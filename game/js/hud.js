// The DOM overlay: audio log panel, subtitles, prompts, room banners, terminals, the log reader and the end card.
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmt = (s) => `${String(Math.floor(Math.max(0, s) / 60)).padStart(2, "0")}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;

export class HUD {
  constructor(manifest) {
    this.m = manifest;
    // delayed UI changes; capture mode swaps this for the story's virtual clock
    this.later = (fn, seconds) => setTimeout(fn, seconds * 1000);
    this.el = {
      counter: $("#counter"),
      objective: $("#objective"),
      banner: $("#banner"),
      prompt: $("#prompt"),
      log: $("#logpanel"),
      subs: $("#subs"),
      toast: $("#toast"),
      terminal: $("#terminal"),
      reader: $("#reader"),
      fade: $("#fade"),
      caption: $("#caption"),
      end: $("#endcard"),
      flash: $("#flash"),
    };
    this.wave = this.el.log.querySelector("canvas");
    this.waveCtx = this.wave.getContext("2d");
    this.waveData = new Uint8Array(1024);
    this.bannerTimer = 0;
    this.toastTimer = 0;
    this.currentCue = null;
  }

  setCounter(n, total) {
    this.el.counter.innerHTML = `<span class="k">AUDIO LOGS</span> ${String(n).padStart(2, "0")} <span class="dim">/ ${String(total).padStart(2, "0")}</span>`;
  }

  setObjective(text) {
    this.el.objective.textContent = text ?? "";
  }

  banner(title, sub = "") {
    const b = this.el.banner;
    b.innerHTML = `<div class="rule"></div><div class="t">${esc(title)}</div>${sub ? `<div class="s">${esc(sub)}</div>` : ""}<div class="rule"></div>`;
    b.classList.remove("show");
    void b.offsetWidth;
    b.classList.add("show");
    this.fitBanner();
    const token = (this.bannerToken = {});
    this.later(() => this.bannerToken === token && b.classList.remove("show"), 3.6);
  }

  /** Slides the room banner right, just far enough to clear the log panel while both are up. */
  fitBanner() {
    const b = this.el.banner;
    const p = this.el.log;
    const width = b.offsetParent?.clientWidth ?? innerWidth;
    let shift = 0;
    if (p.classList.contains("show") && width > 640) {
      const left = width / 2 - b.offsetWidth / 2;
      shift = Math.max(0, Math.min(p.offsetLeft + p.offsetWidth + 24 - left, left - 24));
    }
    b.style.transform = `translateX(calc(-50% + ${Math.round(shift)}px))`;
  }

  prompt(text) {
    if (this._prompt === text) return;
    this._prompt = text;
    this.el.prompt.innerHTML = text ? text.replace(/\[(\w+)\]/g, '<span class="key">$1</span>') : "";
    this.el.prompt.classList.toggle("show", !!text);
  }

  showLog(log, index, total) {
    const ch = this.m.characters[log.speaker] ?? { name: log.speaker, role: "" };
    const i = log.info ?? {};
    const status = [i.status, i.resolution].filter(Boolean).join(" · ");
    this.el.log.querySelector(".head").innerHTML = `<span class="rec">●</span> AUDIO LOG ${String(index).padStart(2, "0")} / ${String(total).padStart(2, "0")}<span class="time"></span>`;
    this.el.log.querySelector(".ticket").innerHTML = `<span class="key">${esc(log.ticket)}</span> <span class="dim">${esc(i.type ?? "")}</span> <span class="status">${esc(status.toUpperCase())}</span>${i.priority ? ` <span class="prio">${esc(i.priority)}</span>` : ""}`;
    this.el.log.querySelector(".summary").textContent = i.summary ?? "";
    this.el.log.querySelector(".who").innerHTML = `<span style="color:${ch.color}">${esc(ch.name.toUpperCase())}</span> <span class="dim">· ${esc(ch.role)}</span>`;
    this.el.log.querySelector(".title").innerHTML = `“${esc(log.title)}” <span class="dim">· ${esc(log.recorded)}</span>`;
    this.el.log.classList.add("show");
    this.fitBanner();
    this.logTotal = log.duration;
  }

  hideLog() {
    this.el.log.classList.remove("show");
    this.fitBanner();
    this.subtitle(null);
  }

  /** Called every frame while a log or broadcast plays. */
  updateVoice(state, audio, showPanel = true) {
    if (!state) {
      this.subtitle(null);
      return;
    }
    if (showPanel) {
      this.el.log.querySelector(".time").textContent = `${fmt(state.elapsed)} / ${fmt(state.total)}`;
      this.el.log.querySelector(".bar i").style.width = `${Math.min(100, (state.elapsed / state.total) * 100)}%`;
      this.drawWave(audio, state);
    }
    const cue = state.playing ? state.clip.cues.find((c) => state.t >= c.t0 && state.t < c.t1) : null;
    this.subtitle(cue ? state.clip.speaker : null, cue?.text);
  }

  drawWave(audio, state) {
    const c = this.waveCtx;
    const w = (this.wave.width = this.wave.clientWidth * devicePixelRatio);
    const h = (this.wave.height = this.wave.clientHeight * devicePixelRatio);
    c.clearRect(0, 0, w, h);
    c.strokeStyle = "rgba(255,190,90,0.9)";
    c.lineWidth = 1.5 * devicePixelRatio;
    c.beginPath();
    const live = audio.waveform(this.waveData);
    for (let x = 0; x < w; x++) {
      let v;
      if (live) v = (this.waveData[Math.floor((x / w) * this.waveData.length)] - 128) / 128;
      else {
        // capture mode or no audio: draw a plausible fake waveform while someone is talking
        const talking = state.playing && state.clip.cues.some((q) => state.t >= q.t0 && state.t < q.t1);
        v = talking ? Math.sin(x * 0.21 + state.t * 40) * Math.sin(x * 0.033 + state.t * 7) * (0.3 + 0.35 * Math.abs(Math.sin(state.t * 5.3))) : 0.02 * Math.sin(x * 0.5 + state.t * 20);
      }
      const y = h / 2 + v * h * 0.45;
      x ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.stroke();
  }

  subtitle(speaker, text) {
    const key = speaker ? `${speaker}|${text}` : null;
    if (key === this.currentCue) return;
    this.currentCue = key;
    if (!speaker) {
      this.el.subs.classList.remove("show");
      return;
    }
    const ch = this.m.characters[speaker] ?? { name: speaker, color: "#fff" };
    this.el.subs.innerHTML = `<span class="who" style="color:${ch.color}">${esc(ch.name)}:</span> ${esc(text)}`;
    this.el.subs.classList.add("show");
  }

  toast({ title, body, key }) {
    const t = this.el.toast;
    t.innerHTML = `<div class="bar"></div><div class="row"><div class="avatar">S</div><div><div class="title">${esc(title)}</div><div class="body">${key ? `<b>${esc(key)}</b> ` : ""}${esc(body)}</div><div class="meta">Automation for Jira · just now</div></div></div>`;
    t.classList.add("show");
    const token = (this.toastToken = {});
    this.later(() => this.toastToken === token && t.classList.remove("show"), 7);
  }

  openTerminal(term) {
    const t = this.el.terminal;
    t.querySelector(".body").textContent = term.text;
    const station = (this.m.station?.name ?? "").split(" ")[0] || "STATION";
    t.querySelector(".hdr").textContent = `${station.toUpperCase()} TERMINAL  //  ${term.ticket}`;
    t.classList.add("show");
    t.querySelector(".body").scrollTop = 0;
  }

  closeTerminal() {
    this.el.terminal.classList.remove("show");
  }

  get modalOpen() {
    return this.el.terminal.classList.contains("show") || this.el.reader.classList.contains("show");
  }

  openReader(logs, collected, onPlay) {
    const r = this.el.reader;
    const list = r.querySelector(".list");
    list.innerHTML = "";
    logs.forEach((l, i) => {
      const got = collected.has(l.ticket);
      const ch = this.m.characters[l.speaker] ?? {};
      const row = document.createElement("button");
      row.className = "row" + (got ? "" : " locked");
      row.innerHTML = got
        ? `<span class="n">${String(i + 1).padStart(2, "0")}</span><span class="key">${esc(l.ticket)}</span><span class="t">“${esc(l.title)}”</span><span class="who" style="color:${ch.color}">${esc(ch.name)}</span>`
        : `<span class="n">${String(i + 1).padStart(2, "0")}</span><span class="key">??????</span><span class="t dim">not recovered</span>`;
      if (got) row.onclick = () => onPlay(l);
      list.appendChild(row);
    });
    r.classList.add("show");
  }

  closeReader() {
    this.el.reader.classList.remove("show");
  }

  fade(opacity, seconds = 1) {
    this.el.fade.style.transition = `opacity ${seconds}s ease`;
    this.el.fade.style.opacity = opacity;
  }

  flash(color = "rgba(255,40,20,0.35)", ms = 180) {
    const f = this.el.flash;
    f.style.background = color;
    f.style.transition = "none";
    f.style.opacity = 1;
    void f.offsetWidth;
    f.style.transition = `opacity ${ms}ms ease-out`;
    f.style.opacity = 0;
  }

  caption(html) {
    this.el.caption.innerHTML = html ?? "";
    this.el.caption.classList.toggle("show", !!html);
  }

  endCard({ found, total, assigned, open }, { onContinue, onRestart }) {
    const e = this.el.end;
    e.querySelector(".stats").innerHTML = `Audio logs recovered: <b>${found} / ${total}</b><br>Tickets still open: <b>${open}</b><br>Assigned to you: <b>${esc(assigned)}</b>`;
    e.querySelector(".continue").onclick = onContinue;
    e.querySelector(".restart").onclick = onRestart;
    e.classList.add("show");
  }

  hideEndCard() {
    this.el.end.classList.remove("show");
  }
}
