// Thin wrapper around the ElevenLabs REST API: voices, models, text to speech with timestamps, sound effects.
import { sleep } from "./util.js";

const BASE = process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io";

function key() {
  const k = process.env.ELEVENLABS_API_KEY;
  if (!k) throw new Error("Set ELEVENLABS_API_KEY (see .env.example).");
  return k;
}

async function request(path, { method = "GET", body, query, binary = false } = {}) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method,
      headers: { "xi-api-key": key(), ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.ok) return binary ? Buffer.from(await res.arrayBuffer()) : res.json();
    const detail = await res.text();
    // 429 = rate or concurrency limit; 5xx = transient. Back off and retry a few times.
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      const wait = 2000 * 2 ** attempt;
      console.warn(`  ElevenLabs ${res.status}, retrying in ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    const err = new Error(`ElevenLabs ${method} ${path} failed: ${res.status} ${detail.slice(0, 400)}`);
    err.status = res.status;
    throw err;
  }
}

export async function listVoices() {
  const voices = [];
  let token;
  do {
    const page = await request("/v2/voices", { query: { page_size: 100, next_page_token: token } });
    voices.push(...page.voices);
    token = page.has_more ? page.next_page_token : undefined;
  } while (token);
  return voices.map((v) => ({
    voice_id: v.voice_id,
    name: v.name,
    category: v.category,
    labels: v.labels ?? {},
    description: v.description ?? "",
  }));
}

export async function listModels() {
  return request("/v1/models");
}

const PREFERRED_MODELS = ["eleven_v4", "eleven_v3", "eleven_multilingual_v2"];

/** Picks ELEVENLABS_MODEL if set, otherwise the most expressive TTS model this account can use. */
export async function pickModel() {
  if (process.env.ELEVENLABS_MODEL) return process.env.ELEVENLABS_MODEL;
  try {
    const models = await listModels();
    const ids = new Set(models.filter((m) => m.can_do_text_to_speech !== false).map((m) => m.model_id));
    return PREFERRED_MODELS.find((id) => ids.has(id)) ?? "eleven_multilingual_v2";
  } catch {
    return "eleven_v3";
  }
}

/** Models that understand inline audio tags like [whispers]. Others get the tags stripped. */
export const supportsAudioTags = (modelId) => /eleven_v[3-9]/.test(modelId);

/**
 * Text to speech with character timestamps. Returns { audio: Buffer, alignment }.
 * If the API rejects any optional setting (speed, previous/next text), we retry once without them.
 */
export async function speak({ voiceId, text, modelId, speed = 1, stability = 0.5, previousText, nextText }) {
  const settings = { stability, similarity_boost: 0.8, speed };
  const body = { text, model_id: modelId, voice_settings: settings };
  if (previousText) body.previous_text = previousText;
  if (nextText) body.next_text = nextText;
  const path = `/v1/text-to-speech/${voiceId}/with-timestamps`;
  const query = { output_format: "mp3_44100_128" };
  let res;
  try {
    res = await request(path, { method: "POST", body, query });
  } catch (err) {
    if (err.status !== 400 && err.status !== 422) throw err;
    // Some models reject previous/next text or speed. Try the plain request once.
    delete body.previous_text;
    delete body.next_text;
    body.voice_settings = { stability, similarity_boost: 0.8 };
    res = await request(path, { method: "POST", body, query });
  }
  return { audio: Buffer.from(res.audio_base64, "base64"), alignment: res.alignment ?? res.normalized_alignment ?? null };
}

/** Generates a sound effect from a text prompt. Returns an mp3 Buffer. */
export async function soundEffect({ text, duration, loop = false, influence = 0.45 }) {
  const body = { text, duration_seconds: duration, prompt_influence: influence, model_id: "eleven_text_to_sound_v2" };
  if (loop) body.loop = true;
  const query = { output_format: "mp3_44100_128" };
  try {
    return await request("/v1/sound-generation", { method: "POST", body, query, binary: true });
  } catch (err) {
    if (err.status !== 400 && err.status !== 422) throw err;
    delete body.loop;
    delete body.model_id;
    return request("/v1/sound-generation", { method: "POST", body, query, binary: true });
  }
}

/** Speech to text, used by the QA step to check each clip says what the script says. */
export async function transcribe(audio, fileName = "clip.mp3") {
  const form = new FormData();
  form.set("model_id", "scribe_v1");
  form.set("tag_audio_events", "true");
  form.set("file", new Blob([audio], { type: "audio/mpeg" }), fileName);
  const res = await fetch(BASE + "/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": key() }, body: form });
  if (!res.ok) throw new Error(`ElevenLabs speech-to-text failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).text ?? "";
}
