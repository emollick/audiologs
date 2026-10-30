// Web Audio engine: ambience, positional loops, one-shot effects and voice logs run through
// "found recording" processing. Any effect file that is missing gets a synthesized stand-in.
// In capture mode nothing plays; the engine logs timed events so the trailer recorder can mix the audio offline.

const VOICE_GAP = 0.35;

export class AudioEngine {
  constructor(manifest, { capture = false } = {}) {
    this.m = manifest;
    this.capture = capture;
    this.events = [];
    this.virtualTime = 0;
    this.buffers = new Map();
    this.loading = new Map();
    this.loops = [];
    this.voice = null;
    this.duck = 1;
    this.zone = "station";
    this.muted = false;
  }

  time() {
    return this.capture ? this.virtualTime : this.ctx?.currentTime ?? 0;
  }

  async start() {
    if (this.capture) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") await ctx.resume();
    // everything below is synchronous, so the rest of the engine never sees a context without its buses
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    this.bus = {};
    for (const [k, g] of Object.entries({ amb: 0.55, world: 0.9, sfx: 0.8, voice: 1.0 })) {
      this.bus[k] = ctx.createGain();
      this.bus[k].gain.value = g;
      this.bus[k].connect(this.master);
    }
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.bus.voice.connect(this.analyser);
    this.noise = makeNoise(ctx, 2);
    this.crackle = makeCrackle(ctx, 3);
    this.reverb = makeImpulse(ctx, 1.8, 2.5);
    this.bed = this.loopSource("amb_station", this.bus.amb, 0.9);
    this.bedLow = this.loopSource("amb_basement", this.bus.amb, 0);
    // warm the cache for the sounds needed in the first minute; nothing waits on this
    for (const n of ["door_open", "log_start", "log_stop", "step_metal", "pa_chime", "terminal"]) this.sfxBuffer(n);
    this.ready = true;
  }

  // ---------------------------------------------------------------- loading

  async load(url) {
    if (this.buffers.has(url)) return this.buffers.get(url);
    if (this.loading.has(url)) return this.loading.get(url);
    const p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${url}`);
        return r.arrayBuffer();
      })
      .then((b) => this.ctx.decodeAudioData(b))
      .then((buf) => (this.buffers.set(url, buf), buf))
      .catch((err) => {
        console.warn("audio load failed", url, err);
        return null;
      });
    this.loading.set(url, p);
    return p;
  }

  async sfxBuffer(name) {
    const key = `sfx:${name}`;
    if (this.buffers.has(key)) return this.buffers.get(key);
    let buf = null;
    if (this.m.sfx?.[name]) buf = await this.load(this.m.sfx[name]);
    buf ??= synth(this.ctx, name);
    this.buffers.set(key, buf);
    return buf;
  }

  preloadLog(log) {
    if (this.capture || !this.ctx) return;
    for (const c of log.clips) if (c.src) this.load(c.src);
  }

  // ---------------------------------------------------------------- playback

  loopSource(name, dest, gain = 1) {
    const g = this.ctx.createGain();
    g.gain.value = gain;
    g.connect(dest);
    const src = this.ctx.createBufferSource();
    src.loop = true;
    this.sfxBuffer(name).then((b) => {
      src.buffer = b;
      src.start(this.ctx.currentTime + Math.random() * 0.1, Math.random() * (b?.duration ?? 0));
    });
    src.connect(g);
    return g;
  }

  panner(pos, ref = 1.5) {
    const p = this.ctx.createPanner();
    p.panningModel = "HRTF";
    p.distanceModel = "inverse";
    p.refDistance = ref;
    p.rolloffFactor = 1.5;
    p.maxDistance = 40;
    p.positionX.value = pos.x;
    p.positionY.value = pos.y;
    p.positionZ.value = pos.z;
    return p;
  }

  /** A positional loop that runs for the whole game. */
  addEmitter({ sound, pos, volume = 1, ref = 1.5, intermittent }) {
    if (this.capture || !this.ctx) return;
    const p = this.panner(pos, ref);
    p.connect(this.bus.world);
    const g = this.loopSource(sound, p, intermittent ? 0 : volume);
    this.loops.push({ g, volume, intermittent, next: intermittent ? intermittent[0] : 0, on: !intermittent });
  }

  /** One-shot effect, optionally positional. */
  async sfx(name, pos, { volume = 1, rate = 1, delay = 0 } = {}) {
    if (this.capture) {
      this.events.push({ type: "sfx", name, at: this.time() + delay, volume });
      return;
    }
    if (!this.ctx || this.muted) return;
    const buf = await this.sfxBuffer(name);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = volume;
    src.connect(g);
    if (pos) g.connect(this.panner(pos)).connect(this.bus.world);
    else g.connect(this.bus.sfx);
    src.start(this.ctx.currentTime + delay);
  }

  /** Small locator beep from an uncollected recorder. */
  beep(pos, volume = 0.25) {
    if (this.capture || !this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.frequency.value = 1760;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g).connect(this.panner(pos, 0.8)).connect(this.bus.world);
    o.start(t);
    o.stop(t + 0.1);
  }

  /** Plays a list of clips back to back through the right "recording" chain. */
  async playVoice(clips, { onEnd, lead = 0.3 } = {}) {
    this.stopVoice(true);
    const token = { clips, starts: [], ended: false, nodes: [], onEnd };
    this.voice = token;
    if (!this.capture && this.ctx) {
      const bufs = await Promise.all(clips.map((c) => (c.src ? this.load(c.src) : null)));
      if (this.voice !== token) return token;
      let t = this.ctx.currentTime + lead;
      clips.forEach((c, i) => {
        token.starts.push(t);
        const buf = bufs[i];
        if (buf) {
          const src = this.ctx.createBufferSource();
          src.buffer = buf;
          const chain = this.chain(c.fx);
          src.connect(chain.input);
          chain.output.connect(this.bus.voice);
          src.start(t);
          token.nodes.push(src, ...chain.sources);
          chain.sources.forEach((s) => s.start(t));
          chain.sources.forEach((s) => s.stop(t + (buf.duration ?? c.duration) + 0.4));
        }
        t += (buf?.duration ?? c.duration) + VOICE_GAP;
      });
      token.end = t - VOICE_GAP;
    } else {
      let t = this.time() + lead;
      clips.forEach((c) => {
        token.starts.push(t);
        this.events.push({ type: "voice", src: c.src, fx: c.fx, at: t, offset: c.offset ?? 0, duration: c.duration, id: c.id });
        t += c.duration + VOICE_GAP;
      });
      token.end = t - VOICE_GAP;
    }
    return token;
  }

  stopVoice(silent = false) {
    const v = this.voice;
    if (!v) return;
    this.voice = null;
    if (this.capture) this.events.push({ type: "cut", at: this.time() });
    for (const n of v.nodes) {
      try {
        n.stop();
      } catch {}
    }
    if (!silent) this.sfx("log_stop");
  }

  /** Where the current voice log is: which clip and how far into it. */
  voiceState() {
    const v = this.voice;
    if (!v || !v.starts.length) return null;
    const now = this.time();
    if (now >= v.end) {
      if (!v.ended) {
        v.ended = true;
        this.voice = null;
        // synchronous on purpose: capture mode steps many frames inside one task, so a microtask would fire late
        v.onEnd?.();
      }
      return null;
    }
    let i = v.starts.length - 1;
    while (i > 0 && v.starts[i] > now) i--;
    const t = now - v.starts[i];
    const clip = v.clips[i];
    return { index: i, t, clip, playing: t >= 0 && t <= clip.duration, total: v.end - v.starts[0], elapsed: now - v.starts[0] };
  }

  /** Builds the processing chain for a voice clip: handheld recorder, station PA, or decade-old tape. */
  chain(fx) {
    const ctx = this.ctx;
    const input = ctx.createGain();
    const output = ctx.createGain();
    const sources = [];
    const biquad = (type, f, q = 0.7, gain = 0) => {
      const b = ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      b.Q.value = q;
      b.gain.value = gain;
      return b;
    };
    const bed = (buf, level, filter) => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      const g = ctx.createGain();
      g.gain.value = level;
      s.connect(filter ?? g);
      if (filter) filter.connect(g);
      g.connect(output);
      sources.push(s);
    };
    if (fx === "pa") {
      const hp = biquad("highpass", 260);
      const lp = biquad("lowpass", 7000);
      const pk = biquad("peaking", 1900, 1, 4);
      input.connect(hp).connect(pk).connect(lp);
      const dry = ctx.createGain();
      dry.gain.value = 0.9;
      lp.connect(dry).connect(output);
      const delay = ctx.createDelay(0.1);
      delay.delayTime.value = 0.014;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.3;
      const depth = ctx.createGain();
      depth.gain.value = 0.004;
      lfo.connect(depth).connect(delay.delayTime);
      sources.push(lfo);
      const wet = ctx.createGain();
      wet.gain.value = 0.45;
      lp.connect(delay).connect(wet).connect(output);
      const conv = ctx.createConvolver();
      conv.buffer = this.reverb;
      const rv = ctx.createGain();
      rv.gain.value = 0.5;
      lp.connect(conv).connect(rv).connect(output);
      output.gain.value = 0.95;
    } else {
      const tape = fx === "tape";
      const hp = biquad("highpass", tape ? 120 : 170);
      const pk = biquad("peaking", 2400, 1, tape ? 2 : 4);
      const lp = biquad("lowpass", tape ? 3500 : 5600);
      const shaper = ctx.createWaveShaper();
      shaper.curve = softClip(tape ? 2.4 : 1.6);
      let head = input.connect(hp).connect(pk);
      if (tape) {
        const wow = ctx.createDelay(0.1);
        wow.delayTime.value = 0.02;
        for (const [f, d] of [[0.55, 0.0016], [6.5, 0.00018]]) {
          const o = ctx.createOscillator();
          o.frequency.value = f;
          const g = ctx.createGain();
          g.gain.value = d;
          o.connect(g).connect(wow.delayTime);
          sources.push(o);
        }
        head = head.connect(wow);
      }
      head.connect(lp).connect(shaper).connect(output);
      output.gain.value = tape ? 1.05 : 1.0;
      bed(this.noise, tape ? 0.022 : 0.009, biquad("bandpass", tape ? 3800 : 5200, 0.6));
      bed(this.crackle, tape ? 0.32 : 0.12);
    }
    return { input, output, sources };
  }

  // ---------------------------------------------------------------- per-frame

  setListener(pos, forward) {
    if (this.capture || !this.ctx) return;
    const l = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(pos.x, t, 0.02);
      l.positionY.setTargetAtTime(pos.y, t, 0.02);
      l.positionZ.setTargetAtTime(pos.z, t, 0.02);
      l.forwardX.setTargetAtTime(forward.x, t, 0.02);
      l.forwardY.setTargetAtTime(forward.y, t, 0.02);
      l.forwardZ.setTargetAtTime(forward.z, t, 0.02);
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);
    }
  }

  setZone(zone) {
    if (zone === this.zone) return;
    this.zone = zone;
    if (this.capture) this.events.push({ type: "zone", zone, at: this.time() });
  }

  update(dt) {
    if (this.capture) {
      this.virtualTime += dt;
      return;
    }
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const talking = !!this.voice;
    const duck = talking ? 0.45 : 1;
    this.bus.amb.gain.setTargetAtTime(0.55 * duck, t, 0.3);
    this.bus.world.gain.setTargetAtTime(0.9 * (talking ? 0.6 : 1), t, 0.3);
    const deep = this.zone === "basement";
    this.bed.gain.setTargetAtTime(deep ? 0.25 : 0.9, t, 1.2);
    this.bedLow.gain.setTargetAtTime(deep ? 0.5 : 0, t, 1.2);
    for (const l of this.loops) {
      if (!l.intermittent) continue;
      l.next -= dt;
      if (l.next <= 0) {
        l.on = !l.on;
        const [a, b] = l.intermittent;
        l.next = l.on ? a * (0.6 + Math.random() * 0.6) : b * (0.6 + Math.random() * 0.8);
        l.g.gain.setTargetAtTime(l.on ? l.volume : 0, t, 0.15);
      }
    }
  }

  /** Turns up a positional loop for a scripted moment (fans screaming at the end). */
  surge(sound, volume, seconds = 2) {
    if (this.capture || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.bed.gain.setTargetAtTime(0.1, t, 0.5);
    this.bedLow.gain.setTargetAtTime(volume, t, seconds / 3);
  }

  waveform(arr) {
    if (!this.analyser) return false;
    this.analyser.getByteTimeDomainData(arr);
    return true;
  }
}

// ---------------------------------------------------------------- DSP helpers

function softClip(k) {
  const n = 1024;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return c;
}

function makeNoise(ctx, seconds) {
  const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function makeCrackle(ctx, seconds) {
  const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    if (Math.random() < 0.0006) {
      const amp = Math.random() * 0.6;
      for (let k = 0; k < 30 && i + k < d.length; k++) d[i + k] += (Math.random() * 2 - 1) * amp * Math.exp(-k / 6);
    }
  }
  return b;
}

function makeImpulse(ctx, seconds, decay) {
  const len = ctx.sampleRate * seconds;
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < 400 ? i / 400 : 1);
  }
  return b;
}

/** Synthesized stand-ins for every effect, so the game sounds right without the generated files. */
export function synth(ctx, name) {
  if (!ctx) return null;
  const sr = ctx.sampleRate;
  const make = (dur, fn, ch = 1) => {
    const b = ctx.createBuffer(ch, Math.floor(dur * sr), sr);
    for (let c = 0; c < ch; c++) fn(b.getChannelData(c), c);
    return b;
  };
  const loopify = (d, fade = 0.4) => {
    const n = Math.floor(fade * sr);
    for (let i = 0; i < n; i++) {
      const a = i / n;
      d[i] = d[i] * a + d[d.length - n + i] * (1 - a);
    }
    return d;
  };
  const env = (i, a, r, len) => Math.min(1, i / (a * sr)) * Math.max(0, 1 - i / (r * sr || len));
  switch (name) {
    case "amb_station":
      return make(12, (d, c) => {
        let a = 0, b = 0, e = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          const n = Math.random() * 2 - 1;
          a += (n - a) * 0.015;
          b += (a - b) * 0.02;
          e += (n - e) * 0.2;
          const swell = 0.6 + 0.4 * Math.sin((t / 12) * Math.PI * 2 * (c ? 1 : 2));
          d[i] = b * 1.8 * swell + 0.035 * Math.sin(2 * Math.PI * 55 * t) + 0.02 * Math.sin(2 * Math.PI * 82.5 * t + c) + 0.004 * e;
        }
        loopify(d);
      }, 2);
    case "amb_basement":
      return make(8, (d, c) => {
        let a = 0, hp = 0, prev = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          const n = Math.random() * 2 - 1;
          hp = 0.97 * (hp + n - prev);
          prev = n;
          a += (hp - a) * 0.25;
          d[i] = a * 0.22 + 0.025 * Math.sin(2 * Math.PI * 2750 * t * (1 + 0.002 * Math.sin(t * 3 + c))) + 0.06 * Math.sin(2 * Math.PI * 60 * t) + 0.03 * Math.sin(2 * Math.PI * 120 * t);
        }
        loopify(d);
      }, 2);
    case "coffee_grind":
      return make(5, (d) => {
        let a = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          const n = Math.random() * 2 - 1;
          a += (n - a) * 0.3;
          const am = 0.5 + 0.5 * Math.sign(Math.sin(2 * Math.PI * 31 * t)) * (0.7 + 0.3 * Math.sin(t * 1.7));
          d[i] = a * 0.35 * am * (0.6 + 0.4 * Math.sin(t * 2.3));
        }
        loopify(d, 0.2);
      });
    case "fridge_hum":
      return make(6, (d) => {
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          d[i] = 0.12 * Math.sin(2 * Math.PI * 60 * t) + 0.06 * Math.sin(2 * Math.PI * 120 * t) + 0.01 * (Math.random() * 2 - 1) * (Math.sin(t * 9) > 0.95 ? 3 : 1);
        }
        loopify(d);
      });
    case "printer":
      return make(6, (d) => {
        let a = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          const n = Math.random() * 2 - 1;
          a += (n - a) * 0.2;
          d[i] = a * 0.3 * (0.4 + 0.6 * Math.max(0, Math.sin(2 * Math.PI * 1.6 * t))) + 0.05 * Math.sin(2 * Math.PI * 180 * t) * (Math.sin(2 * Math.PI * 1.6 * t) > 0.8 ? 1 : 0.2);
        }
        loopify(d, 0.2);
      });
    case "door_open":
      return make(1.4, (d) => {
        let a = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          const n = Math.random() * 2 - 1;
          const k = 0.35 * Math.exp(-t * 2.5) + 0.02;
          a += (n - a) * k;
          d[i] = a * 0.7 * Math.min(1, t * 30) * Math.exp(-t * 1.6) + (t > 1.05 && t < 1.2 ? 0.4 * Math.sin(2 * Math.PI * 70 * t) * Math.exp(-(t - 1.05) * 30) : 0);
        }
      });
    case "log_start":
    case "log_stop":
    case "terminal":
      return make(0.5, (d) => {
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          const click = t < 0.012 ? (Math.random() * 2 - 1) * (1 - t / 0.012) : 0;
          const tone = name === "terminal" ? 0.25 * Math.sin(2 * Math.PI * 1200 * t) * Math.exp(-t * 30) : 0;
          const hiss = name === "log_start" && t > 0.05 ? (Math.random() * 2 - 1) * 0.05 * Math.exp(-(t - 0.05) * 6) : 0;
          d[i] = click * 0.8 + tone + hiss;
        }
      });
    case "step_metal":
      return make(0.3, (d) => {
        let a = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          a += (Math.random() * 2 - 1 - a) * 0.12;
          d[i] = (a * 1.5 + 0.3 * Math.sin(2 * Math.PI * 95 * t)) * Math.exp(-t * 28);
        }
      });
    case "knock_glass":
      return make(2.2, (d) => {
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          let s = 0;
          for (const k of [0.1, 0.75, 1.4]) {
            const u = t - k;
            if (u > 0) s += (0.6 * Math.sin(2 * Math.PI * 140 * u) + 0.3 * Math.sin(2 * Math.PI * 520 * u) + 0.2 * (Math.random() * 2 - 1)) * Math.exp(-u * 26);
          }
          d[i] = s * 0.8;
        }
      });
    case "stinger":
      return make(3, (d) => {
        let ph = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          ph += (2 * Math.PI * (70 * Math.exp(-t * 0.9) + 25)) / sr;
          d[i] = (0.7 * Math.sin(ph) + 0.25 * (Math.random() * 2 - 1) * Math.exp(-t * 3)) * Math.min(1, t * 40) * Math.exp(-t * 0.9);
        }
      });
    case "metal_groan":
      return make(4, (d) => {
        let ph = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          ph += (2 * Math.PI * (48 + 9 * Math.sin(t * 2.1) + 4 * Math.sin(t * 7.3))) / sr;
          d[i] = (0.4 * Math.sin(ph) + 0.15 * Math.sin(ph * 2.01)) * Math.sin((Math.PI * t) / 4);
        }
      });
    case "fans_spinup":
      return make(6, (d) => {
        let a = 0, ph = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          const ramp = Math.min(1, t / 4);
          a += (Math.random() * 2 - 1 - a) * (0.1 + 0.4 * ramp);
          ph += (2 * Math.PI * (900 + 2600 * ramp)) / sr;
          d[i] = (a * 0.4 + 0.06 * Math.sin(ph)) * (0.2 + 0.8 * ramp);
        }
      });
    case "jira_ping":
      return make(0.9, (d) => {
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          const a = 0.3 * Math.sin(2 * Math.PI * 880 * t) * Math.exp(-t * 10);
          const u = t - 0.13;
          const b = u > 0 ? 0.3 * Math.sin(2 * Math.PI * 1320 * u) * Math.exp(-u * 8) : 0;
          d[i] = a + b;
        }
      });
    case "pa_chime":
      return make(1.8, (d) => {
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          let s = 0;
          [659, 523, 440].forEach((f, k) => {
            const u = t - k * 0.38;
            if (u > 0) s += 0.22 * (Math.sin(2 * Math.PI * f * u) + 0.3 * Math.sin(2 * Math.PI * f * 2 * u)) * Math.exp(-u * 3.2);
          });
          d[i] = s;
        }
      });
    default:
      return make(0.1, () => {});
  }
}
