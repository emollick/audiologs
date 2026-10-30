// Records the ~55 second trailer for social media.
//
// The game runs in capture mode (game/index.html?capture=1): nothing plays in real time, the script moves the camera,
// triggers audio-log excerpts, and steps the game exactly 1/FPS seconds per frame. Each frame is screenshotted and
// piped to ffmpeg. The game logs every voice clip and sound effect it would have played, and the audio track is then
// mixed offline from that log, so picture and sound line up exactly however slow the rendering is.
//
// Needs ffmpeg on PATH and Playwright with Chromium (npm i -D playwright && npx playwright install chromium).
//
//   npm run trailer                          full 1080p render to recordings/wontfix-trailer.mp4 (slow without a GPU)
//   npm run trailer -- --preview             quick low-res check
//   npm run trailer -- --stills              one still per shot, to recordings/stills/
//   npm run trailer -- --workers 2           render in parallel browsers
//   npm run trailer -- --audio-only          re-mix the sound onto an existing render
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, parseArgs, log } from "../src/util.js";
import { serve } from "./serve.js";

const args = parseArgs(process.argv.slice(2));
const PREVIEW = !!args.preview;
const FPS = PREVIEW ? 15 : 30;
const VIEW = PREVIEW ? { width: 960, height: 540, scale: 1 } : { width: 1280, height: 720, scale: 1.5 }; // 1080p output, HUD at 720p proportions
const OUT_DIR = join(ROOT, "recordings");
const OUT = args.out ? join(ROOT, args.out) : join(OUT_DIR, PREVIEW ? "wontfix-trailer-preview.mp4" : "wontfix-trailer.mp4");
const WORKERS = Number(args.workers ?? 1);
const PLAY_URL = "wontfix-game.netlify.app";
const REPO_URL = "github.com/emollick/audiologs";

const HALF_PI = Math.PI / 2;

// ---------------------------------------------------------------- the edit
// Each shot is a camera move ([t, x, z, yaw, pitch] keyframes, t in seconds from the start of the shot) plus timed
// actions. Shots are hard cuts. Voice excerpts are [clipId, fromSeconds, toSeconds] (see game/data/station.json).
const SHOTS = [
  {
    name: "airlock",
    dur: 4.4,
    path: [
      [0, 3.3, 28.5, -HALF_PI, 0.02],
      [4.4, 9.6, 28.3, -HALF_PI - 0.12, 0],
    ],
    banners: false,
    at: [
      [0, "fadeIn", 0.8],
      [0.15, "caption", `<div class="line">Every audio log in this game<br>was generated from a <b>JIRA ticket</b>.</div>`],
      [0.1, "say", [["ai-intro", 8.62, 11.71]], { panel: false, chime: true }],
      [3.7, "caption", null],
    ],
  },
  {
    name: "galley",
    dur: 6.6,
    path: [
      [0, 13.4, 20.3, 1.22, -0.1],
      [6.6, 11.0, 19.75, 1.32, -0.17],
    ],
    at: [
      [0.1, "take", "FAC-219"],
      [0.15, "say", [["FAC-219-1", 20.3, 26.27]]],
      [0.2, "sfx", "coffee_grind", 0.35],
    ],
  },
  {
    name: "conference",
    dur: 6.6,
    path: [
      [0, 23.7, 15.5, -1.98, 0.0],
      [6.6, 27.3, 16.45, -1.9, -0.04],
    ],
    at: [
      [0.1, "take", "WEB-877"],
      [0.15, "say", [["WEB-877-2", 8.64, 12.23], ["WEB-877-2", 19.12, 21.24]]],
    ],
  },
  {
    name: "printer",
    dur: 6.1,
    path: [
      [0, 25.6, 7.4, -2.0, -0.08],
      [6.1, 28.2, 8.9, -1.95, -0.2],
    ],
    at: [
      [0.0, "sfx", "printer", 0.75],
      [0.1, "take", "IT-4451"],
      [0.15, "say", [["IT-4451-2", 12.07, 17.63]]],
    ],
  },
  {
    name: "server room",
    dur: 5.3,
    path: [
      [0, 34.1, 7.7, -1.1, -0.02],
      [5.3, 35.7, 6.9, -1.52, -0.06],
    ],
    at: [
      [0.1, "take", "PLAT-2310"],
      [0.12, "say", [["PLAT-2310-2", 22.32, 27.16]]],
    ],
  },
  {
    // the figure at the end of the loading corridor shows up and vanishes on its own (see Story.update)
    name: "loading corridor",
    dur: 3.0,
    path: [
      [0, 40.75, 13.3, Math.PI, 0.0],
      [3.0, 40.7, 17.5, Math.PI, -0.02],
    ],
    at: [],
  },
  {
    name: "stairs",
    dur: 4.6,
    path: [
      [0, 40.0, 29.4, Math.PI, -0.32],
      [4.6, 40.0, 37.4, Math.PI, -0.2],
    ],
    at: [[0.05, "say", [["ai-stairwell", 0, 3.15]], { panel: false, chime: true }]],
  },
  {
    name: "cage b",
    dur: 14.2,
    path: [
      [0, 40.0, 42.3, Math.PI, -0.08],
      [5.4, 40.0, 47.7, Math.PI, -0.2],
      [14.2, 40.0, 48.55, Math.PI, -0.3],
    ],
    at: [
      [0.5, "take", "PLAT-88"],
      [0.55, "say", [["PLAT-88-2", 2.24, 5.08], ["PLAT-88-2", 20.24, 22.27]]],
      // the box notices
      [6.4, "sfx", "fans_spinup", 1.2],
      [6.9, "alert", 1],
      [6.9, "glitch", 0.6],
      [6.9, "stutter", 1.5],
      // the outro runs on over the title card, so "...forty-seven invoices in flight" lands on WONTFIX
      [7.5, "say", [["ai-outro", 2.0, 12.04]], { panel: false }],
      [8.9, "toast", "PLAT-88"],
    ],
  },
  {
    name: "title",
    dur: 4.2,
    path: [
      [0, 40.0, 48.55, Math.PI, -0.3],
      [4.2, 40.0, 48.6, Math.PI, -0.3],
    ],
    at: [
      [0, "fade", 1, 0.45],
      [0.35, "sfx", "stinger", 0.55],
      [
        0.4,
        "caption",
        `<div class="big">WONTFIX</div><div class="line">A horror game made of <b>JIRA tickets</b></div><div class="small">Play free in your browser: ${PLAY_URL}</div><div class="small dim">Turn your own backlog into a station: ${REPO_URL}</div>`,
      ],
    ],
  },
];

// ---------------------------------------------------------------- timeline helpers

const starts = [];
{
  let t = 0;
  for (const s of SHOTS) {
    starts.push(t);
    t += s.dur;
  }
}
const TOTAL = SHOTS.reduce((a, s) => a + s.dur, 0);
const FRAMES = Math.round(TOTAL * FPS);

const ease = (u) => 0.55 * u + 0.45 * (u * u * (3 - 2 * u));
function poseAt(shot, t) {
  const p = shot.path;
  if (t <= p[0][0]) return p[0].slice(1);
  for (let i = 0; i < p.length - 1; i++) {
    const [t0, ...a] = p[i];
    const [t1, ...b] = p[i + 1];
    if (t <= t1) {
      const u = ease((t - t0) / (t1 - t0));
      return a.map((v, k) => v + (b[k] - v) * u);
    }
  }
  return p.at(-1).slice(1);
}

/** Runs inside the page: one frame of the edit. */
function pageFrame({ shotIndex, shot, t, dt, firstFrame, actions, render, pose }) {
  const w = window.__wontfix;
  if (firstFrame) {
    w.bannersOn = shot.banners !== false;
    w.teleport(...pose);
  } else w.pose(...pose);
  for (const [, kind, ...a] of actions) {
    if (kind === "say") w.say(a[0], a[1]);
    else if (kind === "take") w.take(a[0]);
    else if (kind === "sfx") w.audio.sfx(a[0], null, { volume: a[1] ?? 1 });
    else if (kind === "caption") w.hud.caption(a[0]);
    else if (kind === "alert") w.lights.alert = a[0];
    else if (kind === "glitch") w.story.glitchFor(a[0]);
    else if (kind === "stutter") w.player.stutter(a[0]);
    else if (kind === "fade") w.hud.fade(a[0], a[1]);
    else if (kind === "fadeIn") {
      w.hud.fade(1, 0);
      w.step(0, false);
      w.hud.fade(0, a[0]);
    } else if (kind === "toast") {
      const log = w.manifest.logs.find((l) => l.ticket === a[0]);
      w.audio.sfx("jira_ping", null, { volume: 0.9 });
      w.hud.toast({ title: "You've been assigned an issue", key: log.ticket, body: log.info?.summary ?? "" });
    }
  }
  w.step(dt, render);
}

/** Loads the game and settles it; resolves with the game's audio clock at frame 0. */
async function prepare(page) {
  await page.goto(`${BASE}/?capture=1&dpr=${VIEW.scale}`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__wontfixReady, null, { timeout: 120000 });
  return page.evaluate(() => {
    const w = window.__wontfix;
    const banner = w.hud.banner.bind(w.hud);
    w.hud.banner = (...a) => w.bannersOn !== false && banner(...a);
    w.bannersOn = false;
    w.hud.setCounter(0, w.manifest.logs.length);
    w.hud.setObjective("");
    // settle into the first room off-camera so its banner and zone change happen before frame 0
    w.teleport(3.3, 28.5, -Math.PI / 2, 0);
    for (let i = 0; i < 10; i++) w.step(0.1, false);
    w.hud.el.banner.classList.remove("show");
    return w.audio.time();
  });
}

/** Simulates frames [0, to), rendering and screenshotting the ones shouldRender picks. */
async function run(page, { to = FRAMES, shouldRender = () => false, onFrame }) {
  const fired = new Set();
  let lastShot = -1;
  for (let f = 0; f < to; f++) {
    const time = f / FPS;
    let si = starts.findLastIndex((s) => s <= time + 1e-9);
    const shot = SHOTS[si];
    const t = time - starts[si];
    const actions = [];
    shot.at.forEach((a, i) => {
      const key = `${si}:${i}`;
      if (!fired.has(key) && a[0] <= t + 1e-9) {
        fired.add(key);
        actions.push(a);
      }
    });
    const render = shouldRender(f);
    await page.evaluate(pageFrame, { shotIndex: si, shot: { banners: shot.banners }, t, dt: 1 / FPS, firstFrame: si !== lastShot, actions, render, pose: poseAt(shot, t) });
    lastShot = si;
    if (render && onFrame) await onFrame(f, await page.screenshot({ type: "jpeg", quality: PREVIEW ? 80 : 93 }));
  }
}

// ---------------------------------------------------------------- video

function ffmpeg(argv, { input } = {}) {
  const p = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...argv], { stdio: [input ? "pipe" : "ignore", "inherit", "inherit"] });
  const done = new Promise((resolve, reject) => p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)))));
  return { stdin: p.stdin, done };
}

function encoder(file) {
  return ffmpeg(["-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-", "-c:v", "libx264", "-preset", PREVIEW ? "veryfast" : "slow", "-crf", PREVIEW ? "26" : "17", "-pix_fmt", "yuv420p", "-movflags", "+faststart", file], { input: true });
}

async function write(stream, buf) {
  if (!stream.write(buf)) await new Promise((r) => stream.once("drain", r));
}

// ---------------------------------------------------------------- audio
// Rough ffmpeg equivalents of the in-game Web Audio chains (game/js/audio.js).
const VOICE_FX = {
  recorder: "highpass=f=170,equalizer=f=2400:t=q:w=1:g=4,lowpass=f=5600,acompressor=threshold=0.125:ratio=3:attack=5:release=90,volume=1.25",
  pa: "highpass=f=260,equalizer=f=1900:t=q:w=1:g=4,lowpass=f=7000,aecho=0.85:0.6:14|95|180:0.4|0.22|0.12,volume=1.15",
  tape: "highpass=f=120,equalizer=f=2400:t=q:w=1:g=2,lowpass=f=3500,vibrato=f=0.55:d=0.04,acompressor=threshold=0.125:ratio=4:attack=5:release=90,volume=1.45",
};
const HISS = { recorder: 0.004, tape: 0.011 };
// without the game's distance falloff and master compressor, these come out too loud next to the voices
const SFX_TRIM = { step_metal: 0.55, pa_chime: 0.55 };

async function mixAudio(events, file) {
  const inputs = [];
  const chains = [];
  const voices = [];
  const beds = [];
  const sfx = [];
  const ms = (s) => Math.max(0, Math.round(s * 1000));
  const add = (argv) => inputs.push(argv) - 1;

  for (const e of events.filter((e) => e.type === "voice")) {
    if (e.at >= TOTAL) continue;
    const i = add(["-ss", e.offset.toFixed(3), "-t", e.duration.toFixed(3), "-i", join(ROOT, "game", e.src)]);
    const label = `v${voices.length}`;
    chains.push(`[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,${VOICE_FX[e.fx] ?? VOICE_FX.recorder},afade=t=in:d=0.02,afade=t=out:st=${Math.max(0, e.duration - 0.06).toFixed(3)}:d=0.06,adelay=${ms(e.at)}:all=1[${label}]`);
    voices.push(`[${label}]`);
    if (HISS[e.fx]) {
      const h = `h${voices.length}`;
      chains.push(`anoisesrc=d=${(e.duration + 0.3).toFixed(2)}:c=pink:a=${HISS[e.fx]}:r=48000,highpass=f=2500,aformat=channel_layouts=stereo,afade=t=in:d=0.05,afade=t=out:st=${e.duration.toFixed(2)}:d=0.3,adelay=${ms(e.at - 0.05)}:all=1[${h}]`);
      sfx.push(`[${h}]`);
    }
  }

  for (const e of events.filter((e) => e.type === "sfx")) {
    if (e.at >= TOTAL) continue;
    const src = MANIFEST.sfx?.[e.name];
    if (!src) continue;
    const i = add(["-i", join(ROOT, "game", src)]);
    const vol = (e.volume ?? 1) * (SFX_TRIM[e.name] ?? 1);
    const label = `s${sfx.length}`;
    chains.push(`[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${vol.toFixed(3)},adelay=${ms(e.at)}:all=1[${label}]`);
    sfx.push(`[${label}]`);
  }

  // ambience follows the zone changes the game logged; the trailer cuts are covered by a continuous bed
  // the game starts in the station zone without logging it, so seed that before the first logged change
  const zones = [{ at: 0, zone: "station" }, ...events.filter((e) => e.type === "zone").map((e) => ({ at: Math.max(0, e.at), zone: e.zone }))];
  const ranges = [];
  for (const z of zones) {
    const name = z.zone === "basement" ? "amb_basement" : "amb_station";
    if (ranges.at(-1)?.name === name) continue;
    if (ranges.length) ranges.at(-1).end = z.at;
    ranges.push({ name, start: z.at, end: TOTAL });
  }
  if (!ranges.length) ranges.push({ name: "amb_station", start: 0, end: TOTAL });
  ranges[0].start = 0;
  for (const r of ranges) {
    const i = add(["-stream_loop", "-1", "-i", join(ROOT, "game", MANIFEST.sfx[r.name])]);
    const len = r.end - r.start + 1.2;
    const label = `b${beds.length}`;
    const vol = r.name === "amb_basement" ? 0.3 : 0.6; // the game plays the basement drone at about 0.28
    chains.push(`[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:${len.toFixed(2)},asetpts=PTS-STARTPTS,volume=${vol},afade=t=in:d=${r.start ? 1.2 : 0.4},afade=t=out:st=${(len - 1.2).toFixed(2)}:d=1.2,adelay=${ms(Math.max(0, r.start - 0.6))}:all=1[${label}]`);
    beds.push(`[${label}]`);
  }

  const n = (list) => list.length;
  const graph = [
    ...chains,
    `${voices.join("")}amix=inputs=${n(voices)}:normalize=0:dropout_transition=0,volume=1.6,asplit=3[vmix][vkey][vkey2]`,
    `${beds.join("")}amix=inputs=${n(beds)}:normalize=0[bmix]`,
    `[bmix][vkey]sidechaincompress=threshold=0.012:ratio=6:attack=30:release=500[bducked]`,
    `${sfx.join("")}amix=inputs=${n(sfx)}:normalize=0[sraw]`,
    // like the game, effects step back while someone is talking
    `[sraw][vkey2]sidechaincompress=threshold=0.012:ratio=4:attack=20:release=400[smix]`,
    `[vmix][bducked][smix]amix=inputs=3:normalize=0,apad,atrim=0:${TOTAL.toFixed(3)},afade=t=out:st=${(TOTAL - 0.6).toFixed(2)}:d=0.6,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[out]`,
  ].join(";\n");
  const graphFile = join(OUT_DIR, "trailer-mix.ffgraph");
  writeFileSync(graphFile, graph);
  await ffmpeg([...inputs.flat(), "-filter_complex_script", graphFile, "-map", "[out]", "-c:a", "pcm_s16le", file]).done;
}

// ---------------------------------------------------------------- main

let BASE;
let MANIFEST;

async function main() {
  let chromium;
  try {
    ({ chromium } = createRequire(import.meta.url)("playwright"));
  } catch {
    throw new Error("Playwright is needed: npm i -D playwright && npx playwright install chromium");
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const server = await serve(0);
  BASE = `http://localhost:${server.address().port}`;
  MANIFEST = await (await fetch(`${BASE}/data/station.json`)).json();
  // software WebGL works everywhere; on a machine with a GPU, drop these flags for a much faster render
  const launch = () => chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--mute-audio"] });
  const newPage = async (browser) => {
    const page = await browser.newPage({ viewport: { width: VIEW.width, height: VIEW.height }, deviceScaleFactor: VIEW.scale });
    page.on("pageerror", (e) => log(`page error: ${e.message}`));
    page.audioStart = await prepare(page);
    return page;
  };
  log(`Trailer: ${SHOTS.length} shots, ${TOTAL.toFixed(1)}s, ${FRAMES} frames at ${FPS} fps`);

  if (args.stills) {
    const dir = join(OUT_DIR, "stills");
    mkdirSync(dir, { recursive: true });
    const browser = await launch();
    const page = await newPage(browser);
    const wanted = new Map(SHOTS.map((s, i) => [Math.round((starts[i] + s.dur * Number(args.at ?? 0.6)) * FPS), s.name]).filter(([, name]) => !args.only || name.includes(args.only)));
    await run(page, {
      to: Math.max(...wanted.keys()) + 1,
      shouldRender: (f) => wanted.has(f),
      onFrame: (f, jpg) => writeFileSync(join(dir, `${String(f).padStart(4, "0")}-${wanted.get(f).replace(/\W+/g, "-")}.jpg`), jpg),
    });
    await browser.close();
    server.close();
    log(`Wrote ${wanted.size} stills to ${dir}`);
    return;
  }

  // 1. a quick pass without rendering collects the audio events
  const t0 = Date.now();
  {
    const browser = await launch();
    const page = await newPage(browser);
    await run(page, {});
    // event times are on the game's audio clock, which started before frame 0
    const events = (await page.evaluate(() => window.__wontfix.events())).map((e) => ({ ...e, at: e.at - page.audioStart }));
    writeFileSync(join(OUT_DIR, "trailer-events.json"), JSON.stringify(events, null, 1));
    await browser.close();
    log(`  audio events: ${events.length}; mixing...`);
    await mixAudio(events, join(OUT_DIR, "trailer-audio.wav"));
  }
  if (args["audio-only"]) {
    // re-mix the sound onto an existing render
    const tmp = OUT.replace(/\.mp4$/, ".remux.mp4");
    await ffmpeg(["-i", OUT, "-i", join(OUT_DIR, "trailer-audio.wav"), "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", tmp]).done;
    renameSync(tmp, OUT);
    server.close();
    log(`Replaced the sound in ${OUT}`);
    return;
  }

  // 2. render frames, split across workers
  const per = Math.ceil(FRAMES / WORKERS);
  const parts = Array.from({ length: WORKERS }, (_, k) => ({ from: k * per, to: Math.min(FRAMES, (k + 1) * per), file: join(OUT_DIR, `trailer-part${k}.mp4`) }));
  let doneFrames = 0;
  await Promise.all(
    parts.map(async (part) => {
      const browser = await launch();
      const page = await newPage(browser);
      const enc = encoder(part.file);
      await run(page, {
        to: part.to,
        shouldRender: (f) => f >= part.from,
        onFrame: async (f, jpg) => {
          await write(enc.stdin, jpg);
          if (++doneFrames % 30 === 0) {
            const rate = (Date.now() - t0) / 1000 / doneFrames;
            log(`  ${doneFrames}/${FRAMES} frames  (~${Math.round(((FRAMES - doneFrames) * rate) / 60)} min left)`);
          }
        },
      });
      enc.stdin.end();
      await enc.done;
      await browser.close();
    }),
  );

  // 3. join the parts and add the sound
  const list = join(OUT_DIR, "trailer-parts.txt");
  writeFileSync(list, parts.map((p) => `file '${p.file}'`).join("\n"));
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-i", join(OUT_DIR, "trailer-audio.wav"), "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", OUT]).done;
  for (const p of parts) rmSync(p.file, { force: true });
  rmSync(list, { force: true });
  server.close();
  log(`Wrote ${OUT} in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
