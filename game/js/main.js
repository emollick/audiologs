// WONTFIX: boots the station, wires input, and runs the frame loop.
// URL options: ?debug (fps + position), ?at=x,z (start somewhere else), ?capture (scripted recording mode).
import * as THREE from "three";
import { makeSurfaceMaterials, buildShell, buildDoors, buildPanes } from "./builder.js";
import { Kit } from "./props.js";
import { dressStation } from "./layout.js";
import { LightRig } from "./lights.js";
import { AudioEngine } from "./audio.js";
import { HUD } from "./hud.js";
import { Player } from "./player.js";
import { Story } from "./story.js";
import { Post } from "./post.js";
import { setupTouch } from "./touch.js";
import { setAnisotropy } from "./textures.js";
import { SPAWN, areaOf } from "./map.js";

const params = new URLSearchParams(location.search);
const CAPTURE = params.has("capture");
const DEBUG = params.has("debug");
const TOUCH = matchMedia("(pointer: coarse)").matches && !CAPTURE;

/** "HALCYON SYSTEMS // LAST ACTIVITY OCT 23 09:04", from the newest log's timestamp. */
function titleLine(m) {
  const months = "JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split(" ");
  const stamps = m.logs
    .map((l) => l.recorded?.match(/([A-Z]{3}) (\d{1,2}) (\d{4})(?: \/ (\d{2}:\d{2}))?/))
    .filter((x) => x && months.includes(x[1]))
    .map((x) => ({ x, t: Date.UTC(+x[3], months.indexOf(x[1]), +x[2], ...(x[4] ?? "00:00").split(":").map(Number)) }))
    .sort((a, b) => b.t - a.t);
  const who = (m.station?.operator || m.station?.name || "").toUpperCase();
  const last = stamps[0]?.x;
  return [who, last && `LAST ACTIVITY ${last[1]} ${last[2]} ${last[4] ?? ""}`.trim()].filter(Boolean).join(" // ");
}

async function boot() {
  await Promise.all(["Bebas Neue", "Share Tech Mono", "Permanent Marker"].map((f) => document.fonts.load(`32px "${f}"`)));
  const manifest = await (await fetch("data/station.json")).json();
  document.querySelector("#title .tag").textContent = manifest.station?.tagline ?? "";
  document.querySelector("#title .pre").textContent = titleLine(manifest);
  document.querySelector("#endcard .count").textContent = manifest.tickets?.length ?? "";

  const canvas = document.getElementById("view");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: CAPTURE });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  setAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020304);
  scene.fog = new THREE.FogExp2(0x040608, 0.06);
  const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 90);
  scene.add(camera);
  scene.add(new THREE.HemisphereLight(0x7d8a99, 0x1a140f, 0.75));

  scene.add(buildShell(makeSurfaceMaterials()));
  buildPanes(scene);
  const kit = new Kit(scene);
  const world = dressStation(kit, manifest);
  kit.finalize();

  const audio = new AudioEngine(manifest, { capture: CAPTURE });
  const doors = buildDoors(scene, (name, pos) => audio.sfx(name, pos, { volume: 0.55 }));
  const lights = new LightRig(scene, world.lights, TOUCH ? 6 : 8);
  const hud = new HUD(manifest);
  const player = new Player(camera, {
    colliders: kit.colliders,
    doors,
    onStep: (p) => {
      const area = areaOf(Math.floor(p.x), Math.floor(p.z));
      const soft = area?.floor === "carpet";
      audio.sfx("step_metal", null, { volume: soft ? 0.1 : 0.22, rate: 0.85 + Math.random() * 0.3 });
    },
  });
  const post = new Post(renderer, { scale: TOUCH ? 0.6 : CAPTURE ? 1 : 0.8, samples: TOUCH ? 0 : 4 });
  const story = new Story({ manifest, scene, world, audio, hud, player, lights, post });

  const at = params.get("at")?.split(",").map(Number);
  if (at?.length >= 2) player.place(at[0], at[1], at[2] ?? 0);
  else player.place(SPAWN.x, SPAWN.z, SPAWN.yaw);

  function resize() {
    const w = innerWidth;
    const h = innerHeight;
    const dpr = CAPTURE ? Number(params.get("dpr") ?? 1) : Math.min(devicePixelRatio, TOUCH ? 1.5 : 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 1 ? 85 : 72;
    camera.updateProjectionMatrix();
    post.setSize(w, h, dpr);
  }
  addEventListener("resize", resize);
  resize();

  let t = 0;
  let paused = true;
  let started = false;
  const debugEl = document.getElementById("debug");
  let fps = 0;
  function frame(dt, render = true) {
    t += dt;
    if (!CAPTURE && !hud.modalOpen && !paused) player.update(dt);
    else player.apply(dt);
    doors.update(dt, player.pos);
    story.update(dt);
    lights.update(t, dt, player.pos, story.room);
    for (const a of world.animated) a.update(dt);
    audio.setListener(camera.position, player.forward());
    audio.update(dt);
    if (render) post.render(scene, camera, t);
    if (DEBUG) {
      fps = fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
      debugEl.textContent = `${fps.toFixed(0)} fps  x ${player.pos.x.toFixed(2)}  z ${player.pos.z.toFixed(2)}  y ${player.pos.y.toFixed(2)}  yaw ${player.yaw.toFixed(2)}  ${story.room ?? ""}  calls ${renderer.info.render.calls}`;
    }
  }

  // ---------------------------------------------------------------- capture mode (used by scripts/record-trailer.js)
  if (CAPTURE) {
    document.body.classList.add("capture");
    document.getElementById("title").remove();
    player.enabled = false;
    story.scripted = true;
    hud.later = (fn, seconds) => story.after(seconds, fn);

    // CSS transitions and animations follow the virtual clock too, so every frame is reproducible
    let clock = 0;
    const syncAnimations = () => {
      for (const a of document.getAnimations()) {
        if (a._v0 === undefined) {
          a._v0 = clock;
          a.pause();
        }
        a.currentTime = (clock - a._v0) * 1000;
      }
    };

    const findClip = (id) => {
      for (const l of manifest.logs) for (const c of l.clips) if (c.id === id) return { clip: c, log: l };
      for (const c of Object.values(manifest.broadcasts)) if (c.id === id) return { clip: c, log: null };
      throw new Error(`no clip ${id}`);
    };
    /** A slice of a clip, with its subtitles shifted to match. */
    const excerpt = (id, from = 0, to) => {
      const { clip, log } = findClip(id);
      to ??= clip.duration;
      const cues = clip.cues.filter((q) => q.t1 > from + 0.05 && q.t0 < to - 0.05).map((q) => ({ ...q, t0: Math.max(0, q.t0 - from), t1: Math.min(to, q.t1) - from }));
      return { clip: { ...clip, offset: from, duration: to - from, cues }, log };
    };

    window.__wontfix = {
      manifest,
      story,
      hud,
      audio,
      player,
      lights,
      world,
      post,
      begin: () => story.begin(),
      pose(x, z, yaw, pitch = 0) {
        const moved = Math.hypot(x - player.pos.x, z - player.pos.z);
        player.pos.x = x;
        player.pos.z = z;
        player.vel.set(Math.min(2.6, moved * 30), 0, 0);
        player.yaw = yaw;
        player.pitch = pitch;
        if (moved < 1) player.travel(moved);
      },
      teleport(x, z, yaw, pitch = 0) {
        player.place(x, z, yaw, pitch);
      },
      collect(ticket) {
        const p = story.pickups.find((q) => q.log.ticket === ticket);
        if (p) story.collect(p);
      },
      /** Hide a recorder without playing it (the trailer plays its own excerpts). */
      take(ticket) {
        const p = story.pickups.find((q) => q.log.ticket === ticket);
        if (!p || p.collected) return;
        p.collected = true;
        p.group.visible = false;
        story.collected.add(ticket);
        hud.setCounter(story.collected.size, manifest.logs.length);
      },
      /** Play excerpts [[clipId, from, to], ...] as one log (with the log panel) or as a PA broadcast. */
      say(parts, { panel = true, chime = false } = {}) {
        const pieces = parts.map(([id, from, to]) => excerpt(id, from, to));
        const log = pieces.find((p) => p.log)?.log ?? null;
        if (chime) audio.sfx("pa_chime", null, { volume: 0.7 });
        if (panel && log) {
          audio.sfx("log_start", null, { volume: 0.8 });
          hud.showLog(log, manifest.logs.indexOf(log) + 1, manifest.logs.length);
        }
        story.playing = { kind: panel && log ? "log" : "broadcast", log };
        audio.playVoice(
          pieces.map((p) => p.clip),
          {
            lead: chime ? 1.1 : 0.25,
            onEnd: () => {
              story.playing = null;
              if (panel && log) {
                audio.sfx("log_stop", null, { volume: 0.7 });
                story.after(0.5, () => !story.playing && hud.hideLog());
              }
            },
          },
        );
      },
      step(dt, render = true) {
        clock += dt;
        frame(dt, render);
        syncAnimations();
      },
      time: () => clock,
      events: () => audio.events,
    };
    window.__wontfixReady = true;
    return;
  }

  // ---------------------------------------------------------------- interactive mode
  const title = document.getElementById("title");
  const pauseEl = document.getElementById("pause");

  const lock = () => {
    if (TOUCH) return;
    canvas.requestPointerLock?.()?.catch?.(() => {});
  };

  async function start() {
    if (started) return;
    started = true;
    title.classList.add("gone");
    await audio.start();
    paused = false;
    player.enabled = true;
    lock();
    story.begin();
  }
  title.querySelector("button").addEventListener("click", start);
  story.onModal = () => document.exitPointerLock?.();
  story.onEndCard = () => {
    paused = true;
    document.exitPointerLock?.();
  };
  story.onResume = () => {
    paused = false;
    lock();
  };

  document.addEventListener("pointerlockchange", () => {
    if (!started || TOUCH) return;
    const locked = document.pointerLockElement === canvas;
    if (!locked && !hud.modalOpen && !document.getElementById("endcard").classList.contains("show")) {
      paused = true;
      pauseEl.classList.add("show");
    } else if (locked) {
      paused = false;
      pauseEl.classList.remove("show");
    }
  });
  pauseEl.addEventListener("click", () => {
    pauseEl.classList.remove("show");
    lock();
  });
  canvas.addEventListener("click", () => {
    if (started && !paused && document.pointerLockElement !== canvas) lock();
  });
  // Chrome sometimes reports one huge movement right after pointer lock is (re)acquired; drop those spikes.
  let lockedAt = 0;
  document.addEventListener("pointerlockchange", () => (lockedAt = performance.now()));
  addEventListener("mousemove", (e) => {
    if (document.pointerLockElement !== canvas || hud.modalOpen) return;
    if (performance.now() - lockedAt < 120 || Math.abs(e.movementX) > 250 || Math.abs(e.movementY) > 250) return;
    player.look(e.movementX, e.movementY);
  });

  const toggleReader = () => {
    if (hud.el.reader.classList.contains("show")) {
      hud.closeReader();
      lock();
    } else {
      document.exitPointerLock?.();
      hud.openReader(manifest.logs, story.collected, (log) => {
        hud.closeReader();
        story.playLog(log, { fromReader: true });
        lock();
      });
    }
  };
  document.querySelector("#reader .close").addEventListener("click", toggleReader);
  document.querySelector("#terminal .close").addEventListener("click", () => {
    hud.closeTerminal();
    lock();
  });

  addEventListener("keydown", (e) => {
    if (!started) {
      if (e.code === "Enter" || e.code === "Space") start();
      return;
    }
    player.keys.add(e.code);
    if (e.code === "Tab" || e.code === "KeyL") {
      e.preventDefault();
      toggleReader();
    } else if (e.code === "KeyE") {
      if (hud.el.terminal.classList.contains("show")) {
        hud.closeTerminal();
        lock();
      } else if (!hud.modalOpen) story.interact();
    } else if (e.code === "Escape") {
      if (hud.el.terminal.classList.contains("show")) hud.closeTerminal();
      if (hud.el.reader.classList.contains("show")) hud.closeReader();
    } else if (e.code === "KeyF") player.toggleFlashlight();
    else if (e.code === "KeyM") {
      audio.muted = !audio.muted;
      audio.master && (audio.master.gain.value = audio.muted ? 0 : 0.9);
    }
  });
  addEventListener("keyup", (e) => player.keys.delete(e.code));
  addEventListener("blur", () => player.keys.clear());

  if (TOUCH) {
    setupTouch(player, {
      onUse: () => (hud.el.terminal.classList.contains("show") ? hud.closeTerminal() : story.interact()),
      onLight: () => player.toggleFlashlight(),
      onLogs: toggleReader,
    });
    document.body.classList.add("touch");
  }

  let last = performance.now();
  let reported = false;
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    try {
      frame(dt);
    } catch (err) {
      // keep the station running; report the first failure only
      if (!reported) console.error(err);
      reported = true;
    }
  }
  requestAnimationFrame(loop);
  document.body.classList.add("ready");
  if (DEBUG) window.__wontfix = { manifest, story, hud, audio, player, lights };
}

boot().catch((err) => {
  console.error(err);
  document.getElementById("title").querySelector(".hint").textContent = `Failed to load: ${err.message}`;
});
