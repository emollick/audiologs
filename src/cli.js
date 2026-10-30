#!/usr/bin/env node
// WONTFIX pipeline: JIRA tickets -> station bible -> audio log scripts -> voices -> game manifest.
//
//   node src/cli.js write  --tickets data/sample-tickets.json --station station/halcyon
//   node src/cli.js cast   --station station/halcyon
//   node src/cli.js voice  --station station/halcyon
//   node src/cli.js sfx
//   node src/cli.js qa     --station station/halcyon
//   node src/cli.js build  --station station/halcyon --tickets data/sample-tickets.json
//   node src/cli.js all    --tickets data/sample-tickets.json --station station/halcyon
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, relative, resolve } from "node:path";
import { ROOT, hash, loadEnv, parseArgs, pool, readJSON, readText, stripTags, writeJSON, log } from "./util.js";
import { fetchTickets, loadTicketsFile, ticketToText } from "./jira.js";
import { SFX } from "./sfx.js";
import { buildCues, estimateDuration } from "./subtitles.js";

loadEnv();
const args = parseArgs(process.argv.slice(2));
const command = args._[0] ?? "help";
const stationDir = resolve(ROOT, args.station ?? "station/halcyon");
const gameDir = resolve(ROOT, args.game ?? "game");
const rooms = readJSON(join(gameDir, "data", "rooms.json"));
const files = {
  bible: join(stationDir, "bible.json"),
  logs: join(stationDir, "logs.json"),
  cast: join(stationDir, "cast.json"),
  voiceMeta: join(stationDir, "voice-meta.json"),
  tickets: join(stationDir, "tickets.json"),
};

async function loadTickets() {
  if (args.jql) return fetchTickets(args.jql, { max: Number(args.max ?? 60) });
  if (args.tickets) return loadTicketsFile(resolve(ROOT, args.tickets));
  if (existsSync(files.tickets)) return readJSON(files.tickets);
  throw new Error("Pass --tickets <file.json|file.csv> or --jql \"<query>\".");
}

function fillPrompt(name, vars) {
  let text = readText(join(ROOT, "prompts", name));
  for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{{${k}}}`, String(v));
  return text;
}

// ---------------------------------------------------------------- write: Claude writes the bible and the logs

async function write() {
  if (existsSync(files.bible) && !args.force) {
    throw new Error(`${relative(ROOT, files.bible)} already exists. Pick a new folder with --station station/<name>, or pass --force to overwrite it.`);
  }
  const { askJSON, BIBLE_SCHEMA, LOG_SCHEMA } = await import("./claude.js");
  const tickets = await loadTickets();
  writeJSON(files.tickets, tickets);
  const byKey = new Map(tickets.map((t) => [t.key, t]));
  log(`Loaded ${tickets.length} tickets.`);

  const capacity = rooms.reduce((n, r) => n + r.capacity, 0);
  const maxLogs = Math.min(Number(args["max-logs"] ?? capacity), capacity, tickets.length);
  const minLogs = Math.min(Number(args["min-logs"] ?? Math.min(10, maxLogs)), maxLogs);
  const roomList = rooms.map((r) => `- ${r.id} (holds ${r.capacity} log${r.capacity === 1 ? "" : "s"}): ${r.description}`).join("\n");

  log("Writing the station bible...");
  const bible = await askJSON({
    system: fillPrompt("station-bible.md", { ROOMS: roomList, MIN_LOGS: minLogs, MAX_LOGS: maxLogs }),
    user: `Here is the JIRA export (${tickets.length} tickets).\n\n${tickets.map((t) => ticketToText(t)).join("\n\n---\n\n")}`,
    schema: BIBLE_SCHEMA,
    effort: "high",
  });
  bible.logs = validatePlan(bible, byKey);
  writeJSON(files.bible, bible);
  log(`  ${bible.station.name}: ${bible.characters.length} characters, ${bible.logs.length} logs planned.`);

  const castSheet = {
    station: bible.station,
    station_ai: { id: bible.ai.id, name: bible.ai.name, personality: bible.ai.personality },
    characters: bible.characters.map(({ id, name, station_role, personality }) => ({ id, name, station_role, personality })),
  };
  const logs = [];
  for (const plan of bible.logs) {
    log(`Writing log ${plan.order}: ${plan.ticket} (${plan.speaker})...`);
    const user = [
      "STATION BIBLE (abridged):",
      JSON.stringify(castSheet, null, 2),
      "",
      "THIS LOG'S PLAN:",
      JSON.stringify(plan, null, 2),
      "",
      "THE TICKET:",
      ticketToText(byKey.get(plan.ticket)),
      "",
      "LOGS THE PLAYER HAS ALREADY HEARD:",
      logs.length ? logs.map((l) => `- ${l.ticket} (${l.speaker}): ${l.summary}`).join("\n") : "(none, this is the first log)",
    ].join("\n");
    const entry = await askJSON({ system: fillPrompt("voice-log.md", {}), user, schema: LOG_SCHEMA, effort: "high" });
    entry.ticket = plan.ticket;
    entry.speaker = plan.speaker;
    logs.push(entry);
    writeJSON(files.logs, logs);
  }
  log(`Wrote ${logs.length} logs to ${relative(ROOT, files.logs)}.`);
}

/** Keeps only plan entries that point at real tickets, rooms and speakers, and enforces room capacity. */
function validatePlan(bible, byKey) {
  const speakers = new Set([...bible.characters.map((c) => c.id), bible.ai.id]);
  const left = Object.fromEntries(rooms.map((r) => [r.id, r.capacity]));
  const seen = new Set();
  const kept = [];
  for (const p of [...bible.logs].sort((a, b) => a.order - b.order)) {
    if (!byKey.has(p.ticket) || seen.has(p.ticket) || !speakers.has(p.speaker)) {
      log(`  skipping invalid plan entry ${p.ticket} (${p.speaker})`);
      continue;
    }
    if (!(left[p.room] > 0)) {
      const spare = rooms.find((r) => left[r.id] > 0 && r.id !== "airlock");
      if (!spare) continue;
      p.room = spare.id;
    }
    left[p.room]--;
    seen.add(p.ticket);
    kept.push(p);
  }
  // The game walks rooms in this order, so sort the plan to match.
  const roomOrder = rooms.map((r) => r.id);
  kept.sort((a, b) => roomOrder.indexOf(a.room) - roomOrder.indexOf(b.room) || a.order - b.order);
  kept.forEach((p, i) => (p.order = i + 1));
  return kept;
}

// ---------------------------------------------------------------- cast: pick an ElevenLabs voice per character

async function cast() {
  const { listVoices } = await import("./elevenlabs.js");
  const bible = readJSON(files.bible);
  // Instant voice clones (often of you or your colleagues) are left out unless you opt in.
  const voices = (await listVoices()).filter((v) => args["allow-cloned"] || v.category !== "cloned");
  const people = [
    ...bible.characters.map((c) => ({ id: c.id, name: c.name, voice_brief: c.voice_brief })),
    { id: bible.ai.id, name: bible.ai.name, voice_brief: bible.ai.voice_brief },
  ];
  log(`Casting ${people.length} characters from ${voices.length} voices...`);
  let picks = [];
  if (args["no-llm"] || !process.env.ANTHROPIC_API_KEY) log("  (no Claude key or --no-llm: picking stock voices, matched by gender)");
  else {
    const { askJSON, CAST_SCHEMA } = await import("./claude.js");
    const res = await askJSON({
      system: readText(join(ROOT, "prompts", "casting.md")),
      user: `CHARACTERS:\n${JSON.stringify(people, null, 2)}\n\nAVAILABLE VOICES:\n${JSON.stringify(voices, null, 2)}`,
      schema: CAST_SCHEMA,
      effort: "medium",
    });
    picks = res.cast;
  }
  // Fill gaps (or the whole cast with --no-llm) with unused voices, stock voices first, matching gender when the brief says.
  const valid = new Set(voices.map((v) => v.voice_id));
  const used = new Set(picks.filter((p) => valid.has(p.voice_id)).map((p) => p.voice_id));
  const rank = { premade: 0, professional: 1, generated: 2 };
  const spare = voices.filter((v) => !used.has(v.voice_id)).sort((a, b) => (rank[a.category] ?? 3) - (rank[b.category] ?? 3));
  const genderOf = (brief = "") => (/\b(female|woman|women|her|she)\b/i.test(brief) ? "female" : /\b(male|man|men|his|he)\b/i.test(brief) ? "male" : null);
  const castMap = {};
  for (const person of people) {
    let pick = picks.find((p) => p.character === person.id && valid.has(p.voice_id));
    if (!pick) {
      const g = genderOf(person.voice_brief);
      const i = Math.max(0, spare.findIndex((v) => !g || v.labels?.gender === g));
      const v = spare.splice(i, 1)[0] ?? voices[0];
      pick = { character: person.id, voice_id: v.voice_id, voice_name: v.name, speed: 1, why: "fallback" };
    }
    castMap[person.id] = { voice_id: pick.voice_id, voice_name: pick.voice_name, speed: pick.speed ?? 1, why: pick.why };
    log(`  ${person.id.padEnd(12)} -> ${pick.voice_name}`);
  }
  writeJSON(files.cast, castMap);
}

// ---------------------------------------------------------------- voice: ElevenLabs text to speech

/** Every spoken clip in the game: log lines plus the station AI's broadcasts. */
function allClips(bible, logs) {
  const clips = [];
  for (const l of logs) {
    l.lines.forEach((line, i) => {
      clips.push({
        id: `${l.ticket}-${i + 1}`,
        file: `audio/logs/${l.ticket}-${i + 1}.mp3`,
        speaker: line.speaker,
        text: line.text,
        prev: i > 0 && l.lines[i - 1].speaker === line.speaker ? l.lines[i - 1].text : undefined,
        next: l.lines[i + 1]?.speaker === line.speaker ? l.lines[i + 1].text : undefined,
      });
    });
  }
  const b = bible.ai.broadcasts;
  for (const name of ["intro", "stairwell", "outro"]) {
    if (b[name]) clips.push({ id: `ai-${name}`, file: `audio/ai/${name}.mp3`, speaker: bible.ai.id, text: b[name] });
  }
  (b.ambient ?? []).forEach((text, i) => clips.push({ id: `ai-ambient-${i + 1}`, file: `audio/ai/ambient-${i + 1}.mp3`, speaker: bible.ai.id, text }));
  return clips;
}

function probeDuration(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
  const d = parseFloat(r.stdout);
  return Number.isFinite(d) ? d : null;
}

async function voice() {
  const { speak, pickModel, supportsAudioTags } = await import("./elevenlabs.js");
  const bible = readJSON(files.bible);
  const logs = readJSON(files.logs);
  const castMap = readJSON(files.cast);
  const meta = readJSON(files.voiceMeta, {});
  const modelId = await pickModel();
  const tags = supportsAudioTags(modelId);
  const only = args.only ? new Set(String(args.only).split(",")) : null;
  const clips = allClips(bible, logs).filter((c) => !only || [...only].some((o) => c.id.startsWith(o)));
  log(`Voicing ${clips.length} clips with ${modelId}${tags ? "" : " (audio tags stripped)"}...`);

  let done = 0;
  await pool(clips, Number(args.concurrency ?? 2), async (clip) => {
    const role = castMap[clip.speaker];
    if (!role) throw new Error(`No voice cast for "${clip.speaker}". Run the cast step or edit ${relative(ROOT, files.cast)}.`);
    const text = tags ? clip.text : stripTags(clip.text);
    const key = hash(text, role.voice_id, role.speed, modelId);
    const out = join(gameDir, clip.file);
    if (!args.force && meta[clip.id]?.hash === key && existsSync(out)) return;
    const { audio, alignment } = await speak({
      voiceId: role.voice_id,
      text,
      modelId,
      speed: role.speed,
      previousText: clip.prev && (tags ? clip.prev : stripTags(clip.prev)),
      nextText: clip.next && (tags ? clip.next : stripTags(clip.next)),
    });
    mkdirSync(join(out, ".."), { recursive: true });
    writeFileSync(out, audio);
    const ends = alignment?.character_end_times_seconds ?? [];
    const duration = probeDuration(out) ?? (ends.length ? ends[ends.length - 1] + 0.3 : estimateDuration(text));
    meta[clip.id] = { hash: key, file: clip.file, model: modelId, voice: role.voice_name, duration: +duration.toFixed(3), alignment };
    writeJSON(files.voiceMeta, meta);
    log(`  [${++done}/${clips.length}] ${clip.id} (${duration.toFixed(1)}s)`);
  });
}

// ---------------------------------------------------------------- sfx: ElevenLabs sound effects

async function sfx() {
  const { soundEffect } = await import("./elevenlabs.js");
  const only = args.only ? new Set(String(args.only).split(",")) : null;
  for (const s of SFX) {
    if (only && !only.has(s.name)) continue;
    const out = join(gameDir, "audio", "sfx", `${s.name}.mp3`);
    if (existsSync(out) && !args.force) continue;
    log(`Generating sound effect ${s.name}...`);
    const audio = await soundEffect(s);
    mkdirSync(join(out, ".."), { recursive: true });
    writeFileSync(out, audio);
  }
}

// ---------------------------------------------------------------- build: write game/data/station.json

const PALETTE = ["#f2c14e", "#7ec8e3", "#f78154", "#b4e07a", "#e59cf2", "#ff6b6b", "#9be3c3", "#f5a3a3", "#c9b6ff", "#ffd8a8", "#a3d5ff", "#e9e9a0"];

async function build() {
  const bible = readJSON(files.bible);
  const logs = readJSON(files.logs);
  const tickets = await loadTickets();
  const byKey = new Map(tickets.map((t) => [t.key, t]));
  const meta = readJSON(files.voiceMeta, {});
  const ticketKeys = new Set(byKey.keys());

  const clip = ({ id, file, speaker, text }) => {
    const m = meta[id];
    const hasAudio = m && existsSync(join(gameDir, m.file));
    const duration = hasAudio ? m.duration : estimateDuration(text);
    const fx = speaker === bible.ai.id ? "pa" : "recorder";
    return { id, src: hasAudio ? m.file : null, speaker, fx, duration, cues: buildCues(text, { alignment: hasAudio ? m.alignment : null, duration, ticketKeys }) };
  };
  const clipsById = new Map(allClips(bible, logs).map((c) => [c.id, c]));
  const characters = Object.fromEntries(
    [...bible.characters, { id: bible.ai.id, name: bible.ai.name, station_role: "Station AI", real_role: bible.ai.based_on }].map((c, i) => [
      c.id,
      { name: c.name, role: c.station_role, realRole: c.real_role, color: c.id === bible.ai.id ? "#8fe9ff" : PALETTE[i % PALETTE.length] },
    ]),
  );
  // Gary's log is a decade-old tape; everyone else used a handheld recorder.
  const fxFor = (speaker, recorded) => (speaker === bible.ai.id ? "pa" : /20(0\d|1[0-7])/.test(recorded ?? "") ? "tape" : "recorder");
  const ticketInfo = (key) => {
    const t = byKey.get(key);
    if (!t) return { key };
    return { key: t.key, summary: t.summary, type: t.type, status: t.status, resolution: t.resolution, priority: t.priority, assignee: t.assignee, reporter: t.reporter, created: t.created, updated: t.updated, storyPoints: t.storyPoints, comments: t.comments.length };
  };
  const plan = new Map(bible.logs.map((p) => [p.ticket, p]));
  const manifest = {
    title: args.title ?? "WONTFIX",
    generated: new Date().toISOString(),
    station: bible.station,
    ai: { id: bible.ai.id, name: bible.ai.name, expansion: bible.ai.expansion },
    characters,
    rooms: rooms.map((r) => ({ ...r, ...(bible.rooms.find((b) => b.id === r.id) ?? { display_name: r.id.toUpperCase() }) })),
    logs: logs.map((l, i) => {
      const p = plan.get(l.ticket) ?? {};
      const clips = l.lines.map((_, j) => clip(clipsById.get(`${l.ticket}-${j + 1}`)));
      clips.forEach((c) => (c.fx = fxFor(c.speaker, l.recorded)));
      return { order: i + 1, ticket: l.ticket, room: p.room ?? "bullpen", speaker: l.speaker, title: l.title, recorded: l.recorded, info: ticketInfo(l.ticket), clips, duration: +clips.reduce((n, c) => n + c.duration + 0.35, 0).toFixed(2) };
    }),
    broadcasts: Object.fromEntries(
      [...clipsById.values()].filter((c) => c.id.startsWith("ai-")).map((c) => [c.id.slice(3), clip(c)]),
    ),
    terminals: bible.text_terminals
      .filter((t) => byKey.has(t.ticket))
      .map((t) => ({ ticket: t.ticket, room: t.room, info: ticketInfo(t.ticket), text: ticketToText(byKey.get(t.ticket), { maxComments: 12 }) })),
    tickets: tickets.map((t) => ({ key: t.key, summary: t.summary, status: t.status, assignee: t.assignee, priority: t.priority })),
    graffiti: bible.graffiti,
    sfx: Object.fromEntries(SFX.filter((s) => existsSync(join(gameDir, "audio", "sfx", `${s.name}.mp3`))).map((s) => [s.name, `audio/sfx/${s.name}.mp3`])),
  };
  const out = join(gameDir, "data", "station.json");
  writeJSON(out, manifest);
  if (!args["keep-audio"]) pruneAudio(manifest);
  const voiced = manifest.logs.filter((l) => l.clips.every((c) => c.src)).length;
  log(`Wrote ${relative(ROOT, out)}: ${manifest.logs.length} logs (${voiced} voiced), ${Object.keys(manifest.sfx).length} sound effects.`);
}


/** Deletes voice files no station.json clip points at (for example the demo's, once you build your own station). */
function pruneAudio(manifest) {
  const used = new Set([...manifest.logs.flatMap((l) => l.clips), ...Object.values(manifest.broadcasts)].map((c) => c.src).filter(Boolean));
  let removed = 0;
  for (const dir of ["logs", "ai"]) {
    const abs = join(gameDir, "audio", dir);
    if (!existsSync(abs)) continue;
    for (const f of readdirSync(abs)) {
      if (f.endsWith(".mp3") && !used.has(`audio/${dir}/${f}`)) {
        rmSync(join(abs, f));
        removed++;
      }
    }
  }
  if (removed) log(`  removed ${removed} voice files this station doesn't use (keep them with --keep-audio; git checkout game/audio restores the demo's)`);
}

// ---------------------------------------------------------------- qa: check every clip with speech to text

// Scripts spell numbers out ("ten dot zero") and speech-to-text writes digits ("10.0"), so numbers are ignored on both sides.
const NUMBER_WORDS = new Set(
  "zero oh one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand point dot".split(" "),
);

function wordErrorRate(expected, heard) {
  const norm = (t) =>
    stripTags(t)
      .toLowerCase()
      .replace(/([a-z])(\d)|(\d)([a-z])/g, "$1$3 $2$4")
      .replace(/[^a-z0-9' ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w && !/^\d+$/.test(w) && !NUMBER_WORDS.has(w));
  const a = norm(expected);
  const b = norm(heard);
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return a.length ? d[a.length][b.length] / a.length : 0;
}

async function qa() {
  const { transcribe } = await import("./elevenlabs.js");
  const { readFileSync } = await import("node:fs");
  const bible = readJSON(files.bible);
  const logs = readJSON(files.logs);
  const meta = readJSON(files.voiceMeta, {});
  const clips = allClips(bible, logs).filter((c) => meta[c.id]);
  const report = [];
  await pool(clips, 3, async (clip) => {
    const heard = await transcribe(readFileSync(join(gameDir, meta[clip.id].file)));
    const wer = wordErrorRate(clip.text, heard.replace(/\([^)]*\)/g, " "));
    report.push({ id: clip.id, wer: +wer.toFixed(2), heard });
    log(`  ${clip.id.padEnd(16)} WER ${(wer * 100).toFixed(0).padStart(3)}%${wer > 0.25 ? "  <-- check this one" : ""}`);
  });
  report.sort((a, b) => b.wer - a.wer);
  writeJSON(join(stationDir, "qa-report.json"), report);
  const bad = report.filter((r) => r.wer > 0.25).map((r) => r.id);
  log(bad.length ? `Re-voice with: node src/cli.js voice --force --only ${bad.join(",")}` : "All clips match their scripts.");
}

// ----------------------------------------------------------------

const commands = {
  write,
  cast,
  voice,
  sfx,
  qa,
  build,
  async all() {
    await write();
    await cast();
    await voice();
    await sfx();
    await build();
  },
  help() {
    log(readText(join(ROOT, "src", "cli.js")).split("\n").slice(1, 10).join("\n").replace(/^\/\/ ?/gm, ""));
  },
};

if (!commands[command]) {
  console.error(`Unknown command "${command}".`);
  commands.help();
  process.exit(1);
}
commands[command]().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
