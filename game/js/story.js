// Story logic: places the recorders, plays logs and broadcasts, fires the scares, and runs the ending.
import * as THREE from "three";
import { roomAt } from "./map.js";
import { glow, recorderScreen } from "./textures.js";

const ROOM_DEFAULTS = { corridor: "DECK 3 / CORRIDOR", dock: "LOADING DOCK" };

export class Story {
  constructor({ manifest, scene, world, audio, hud, player, lights, post }) {
    Object.assign(this, { m: manifest, scene, world, audio, hud, player, lights, post });
    this.logs = manifest.logs;
    this.final = this.logs.at(-1);
    this.collected = new Set();
    this.pickups = [];
    this.interactables = [];
    this.room = null;
    this.visited = new Set();
    this.ambientQueue = [...Object.keys(manifest.broadcasts).filter((k) => k.startsWith("ambient"))];
    this.pending = [];
    this.timers = [];
    this.t = 0;
    this.playing = null;
    this.ended = false;
    this.shadow = null;
    this.glitch = 0;
    this.placePickups();
    this.placeTerminals();
    this.makeShadow();
  }

  // ---------------------------------------------------------------- setup

  placePickups() {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.5, metalness: 0.4 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.4, metalness: 0.7 });
    const screenMat = new THREE.MeshBasicMaterial({ map: recorderScreen(), color: new THREE.Color(1.6, 1.6, 1.6) });
    const glowTex = glow("255,170,80");
    const used = {};
    for (const log of this.logs) {
      const list = this.world.slots[log.room] ?? this.world.slots.bullpen;
      const i = (used[log.room] = (used[log.room] ?? -1) + 1);
      const base = list[i % list.length].clone();
      if (i >= list.length) base.add(new THREE.Vector3(0.25 * (i - list.length + 1), 0, 0.15));
      const g = new THREE.Group();
      g.position.copy(base);
      g.rotation.y = (i * 1.7) % 6.28;
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.035, 0.075), bodyMat);
      body.position.y = 0.018;
      body.castShadow = true;
      g.add(body);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.008, 0.08), trimMat);
      trim.position.y = 0.002;
      g.add(trim);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.025), screenMat);
      screen.rotation.x = -Math.PI / 2;
      screen.position.set(-0.025, 0.0365, 0);
      g.add(screen);
      const ledMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.3, 0.1) });
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), ledMat);
      led.position.set(0.045, 0.037, 0.02);
      g.add(led);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb060, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.scale.set(0.5, 0.5, 0.5);
      halo.position.y = 0.06;
      g.add(halo);
      this.scene.add(g);
      const p = { log, group: g, led: ledMat, halo, beep: Math.random() * 2, collected: false };
      this.pickups.push(p);
      this.interactables.push({ kind: "log", pos: base.clone().add(new THREE.Vector3(0, 0.05, 0)), pickup: p, prompt: `[E] PLAY AUDIO LOG  ·  ${log.ticket}` });
    }
  }

  placeTerminals() {
    for (const term of this.m.terminals ?? []) {
      const spot = this.world.terminals[term.room];
      if (!spot) continue;
      this.interactables.push({ kind: "terminal", pos: spot.pos.clone(), term, prompt: `[E] READ TERMINAL  ·  ${term.ticket}` });
    }
  }

  makeShadow() {
    const mark = this.world.marks.shadow;
    if (!mark) return;
    const mat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.92, depthWrite: true });
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.16, 4, 10), mat);
    body.position.y = 0.78;
    body.scale.set(1.1, 1, 0.7);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), mat);
    head.position.y = 1.72;
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.55, 3, 6), mat);
    arm.position.set(0.24, 1.05, 0.04);
    arm.rotation.z = 0.08;
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 10), mat);
    mug.position.set(0.27, 0.72, 0.08);
    g.add(body, head, arm, mug);
    g.position.copy(mark);
    g.visible = false;
    this.scene.add(g);
    this.shadow = { group: g, state: "waiting", t: 0 };
  }

  // ---------------------------------------------------------------- flow

  begin() {
    this.hud.setCounter(0, this.logs.length);
    this.hud.setObjective("Find out what happened to the crew.");
    this.after(1.2, () => this.broadcast("intro"));
    for (const e of this.world.emitters) this.audio.addEmitter(e);
  }

  after(seconds, fn) {
    this.timers.push({ at: this.t + seconds, fn });
  }

  /** The station AI speaks over the PA. Broadcasts wait for any log that is playing. */
  broadcast(name, { force = false, then } = {}) {
    const clip = this.m.broadcasts[name];
    if (!clip || (this.ended && !force)) return then?.();
    if (this.playing && !force) {
      this.pending.push({ name, then });
      return;
    }
    this.audio.sfx("pa_chime", null, { volume: 0.4 });
    this.playing = { kind: "broadcast", name };
    this.after(1.3, async () => {
      this.voice = await this.audio.playVoice([clip], {
        lead: 0.05,
        onEnd: () => {
          if (this.playing?.name === name) this.playing = null;
          then?.();
          this.flushPending();
        },
      });
    });
  }

  flushPending() {
    if (this.playing || !this.pending.length) return;
    const next = this.pending.shift();
    this.after(0.8, () => this.broadcast(next.name, { then: next.then }));
  }

  async playLog(log, { fromReader = false } = {}) {
    const index = this.logs.indexOf(log) + 1;
    this.audio.sfx("log_start", null, { volume: 0.8 });
    this.playing = { kind: "log", log };
    this.hud.showLog(log, index, this.logs.length);
    this.voice = await this.audio.playVoice(log.clips, {
      onEnd: () => {
        if (this.playing?.log !== log) return;
        this.playing = null;
        this.audio.sfx("log_stop", null, { volume: 0.7 });
        this.after(1.2, () => this.playing?.kind !== "log" && this.hud.hideLog());
        if (!fromReader) this.onLogEnd(log);
        this.flushPending();
      },
    });
  }

  collect(p) {
    if (p.collected) return;
    p.collected = true;
    this.collected.add(p.log.ticket);
    p.group.visible = false;
    this.hud.setCounter(this.collected.size, this.logs.length);
    this.playLog(p.log);
    this.onLogStart(p.log);
  }

  /** Little scripted moments tied to specific logs, by ticket. */
  onLogStart(log) {
    if (log === this.final) {
      this.hud.setObjective("");
      this.lights.alert = 0.15;
    }
  }

  onLogEnd(log) {
    const marks = this.world.marks;
    // scares are tied to where a log sits in the building, so a station built from any backlog gets them
    const inRoom = this.logs.filter((l) => l.room === log.room);
    const last = inRoom.at(-1) === log;
    if (log.room === "conference" && last && marks.knock) this.after(1.0, () => this.audio.sfx("knock_glass", marks.knock, { volume: 1.2 }));
    if (log.room === "bullpen" && inRoom.indexOf(log) === Math.min(2, inRoom.length - 1) && marks.printer) this.after(0.6, () => this.audio.sfx("printer", marks.printer, { volume: 0.9 }));
    if (log.room === "cage_b" && log !== this.final) {
      this.after(0.4, () => this.audio.sfx("metal_groan", marks.server, { volume: 1.0 }));
      this.player.stutter(0.7);
    }
    if (log === this.final) this.ending();
    if (this.collected.size === this.logs.length - 1 && !this.collected.has(this.final.ticket)) this.hud.setObjective("Something in Level B is still running.");
  }

  ending() {
    if (this.ended) return;
    this.ended = true;
    this.pending = [];
    const marks = this.world.marks;
    this.audio.sfx("fans_spinup", marks.server, { volume: 1.4 });
    this.audio.surge("amb_basement", 1.0, 3);
    this.after(0.5, () => {
      this.lights.alert = 1;
      this.glitchFor(0.6);
      this.player.stutter(1.5);
    });
    this.after(2.2, () =>
      this.broadcast("outro", {
        force: true,
        then: () => this.after(1.5, () => this.finish()),
      }),
    );
    this.after(5.6, () => {
      this.audio.sfx("jira_ping", null, { volume: 0.9 });
      this.hud.toast({ title: "You've been assigned an issue", key: this.final.ticket, body: this.final.info?.summary ?? "" });
    });
  }

  finish() {
    this.hud.fade(1, 2.5);
    this.after(2.8, () => {
      this.audio.sfx("stinger", null, { volume: 0.9 });
      this.hud.endCard(
        { found: this.collected.size, total: this.logs.length, assigned: this.final.ticket, open: (this.m.tickets ?? []).filter((t) => !/done|closed|resolved|won't|wont/i.test(t.status ?? "")).length },
        {
          onContinue: () => {
            this.hud.hideEndCard();
            this.hud.fade(0, 2);
            this.lights.alert = 0.35;
            this.onResume?.();
          },
          onRestart: () => location.reload(),
        },
      );
      this.onEndCard?.();
    });
  }

  glitchFor(seconds) {
    this.glitch = Math.max(this.glitch, seconds);
  }

  // ---------------------------------------------------------------- per frame

  /** Nearest thing the player is looking at and close enough to use. */
  focus() {
    const eye = this.player.camera.position;
    const fwd = this.player.forward();
    let best = null;
    let bestScore = Infinity;
    for (const it of this.interactables) {
      if (it.pickup?.collected) continue;
      const d = it.pos.clone().sub(eye);
      const dist = d.length();
      if (dist > 2.3) continue;
      const dot = d.normalize().dot(fwd);
      if (dot < 0.72) continue;
      const score = dist * (1.6 - dot);
      if (score < bestScore) {
        bestScore = score;
        best = it;
      }
    }
    return best;
  }

  interact() {
    const it = this.focus();
    if (!it) return false;
    if (it.kind === "log") this.collect(it.pickup);
    if (it.kind === "terminal") {
      this.audio.sfx("terminal", null, { volume: 0.8 });
      this.hud.openTerminal(it.term);
      this.onModal?.(true);
    }
    return true;
  }

  update(dt) {
    this.t += dt;
    for (const tm of this.timers.splice(0)) {
      if (tm.at <= this.t) tm.fn();
      else this.timers.push(tm);
    }

    const pos = this.player.pos;
    const room = roomAt(pos.x, pos.z);
    if (room && room !== this.room) this.enterRoom(room);

    // pickups: blinking LED, pulsing halo, locator beeps
    for (const p of this.pickups) {
      if (p.collected) continue;
      const on = Math.sin(this.t * 6 + p.beep) > 0.3;
      p.led.color.setRGB(on ? 4 : 0.3, on ? 0.3 : 0.02, on ? 0.1 : 0.01);
      p.halo.material.opacity = 0.35 + 0.25 * Math.sin(this.t * 3 + p.beep);
      p.beep -= dt;
      if (p.beep <= 0) {
        p.beep = 2.6;
        const d = p.group.position.distanceTo(pos);
        if (d < 9) this.audio.beep(p.group.position, 0.12 * (1 - d / 9) + 0.02);
      }
    }

    // the figure at the end of the loading corridor
    const sh = this.shadow;
    if (sh) {
      const fwd = this.player.forward();
      if (sh.state === "waiting" && room === "dock" && pos.z < 16.5 && pos.x > 39 && pos.x < 42.5 && fwd.z > 0.75) {
        sh.state = "visible";
        sh.t = 0;
        sh.group.visible = true;
        this.audio.sfx("metal_groan", sh.group.position, { volume: 0.5 });
      } else if (sh.state === "visible") {
        sh.t += dt;
        const near = pos.distanceTo(sh.group.position) < 6.5;
        if (near || sh.t > 4.5 || fwd.z < 0.2) {
          sh.state = "gone";
          this.lights.blackout(0.35);
          this.glitchFor(0.35);
          this.after(0.18, () => (sh.group.visible = false));
          this.audio.sfx("stinger", null, { volume: 0.35 });
        }
      }
    }

    const vs = this.audio.voiceState();
    const showPanel = this.playing?.kind === "log";
    this.hud.updateVoice(vs, this.audio, showPanel);

    const it = this.hud.modalOpen ? null : this.focus();
    this.hud.prompt(it?.prompt ?? null);

    this.glitch = Math.max(0, this.glitch - dt);
    this.post.uniforms.glitch.value = Math.min(1, this.glitch * 2.5) + (this.lights.alert > 0.9 ? 0.04 : 0);
    this.post.uniforms.red.value = this.lights.alert;
  }

  enterRoom(room) {
    const prev = this.room;
    this.room = room;
    this.audio.setZone(room === "cage_b" || (room === "stairwell" && this.player.pos.y < -2) ? "basement" : "station");
    const info = this.m.rooms.find((r) => r.id === room);
    const first = !this.visited.has(room);
    this.visited.add(room);
    if (first || prev) this.hud.banner(info?.display_name ?? ROOM_DEFAULTS[room] ?? room.toUpperCase(), first ? info?.flavor ?? "" : "");
    for (const p of this.pickups) if (p.log.room === room) this.audio.preloadLog(p.log);
    if (room === "cage_b" && first) this.glitchFor(0.3);
    if (!first || this.scripted) return;
    if (room === "stairwell") this.after(0.5, () => this.broadcast("stairwell"));
    if (["galley", "conference", "bullpen", "server_room"].includes(room) && this.ambientQueue.length) {
      const name = this.ambientQueue.shift();
      this.after(4 + Math.random() * 4, () => this.broadcast(name));
    }
  }
}
