import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Minimal .env loader so the scripts work without extra dependencies. Existing env vars win. */
export function loadEnv(file = join(ROOT, ".env")) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    const value = m[2].replace(/^["']|["']$/g, "");
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

/** Parses `--flag value` and `--flag` (boolean) arguments. */
export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      args._.push(a);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

export function readJSON(file, fallback) {
  if (!existsSync(file)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing file: ${file}`);
  }
  return JSON.parse(readFileSync(file, "utf8"));
}

export function writeJSON(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

export function readText(file) {
  return readFileSync(file, "utf8");
}

export function hash(...parts) {
  return createHash("sha256").update(parts.map((p) => JSON.stringify(p)).join("|")).digest("hex").slice(0, 16);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Runs async jobs with a fixed concurrency. */
export async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Removes ElevenLabs audio tags like [whispers] and tidies whitespace, for subtitles. */
export function stripTags(text) {
  return text
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function log(...msg) {
  console.log(...msg);
}
