// Calls Claude with a system prompt from prompts/ and gets schema-checked JSON back.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

let client;
function getClient() {
  // Reads ANTHROPIC_API_KEY (or an `ant auth login` profile) from the environment.
  client ??= new Anthropic();
  return client;
}

/**
 * Sends one request and returns the parsed JSON object.
 * Structured outputs guarantee the reply matches `schema`. If the primary model declines,
 * the server-side `fallbacks: "default"` option re-runs the request on Anthropic's recommended fallback model.
 */
export async function askJSON({ system, user, schema, effort = "high" }) {
  const stream = getClient().beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort, format: { type: "json_schema", schema } },
    system,
    messages: [{ role: "user", content: user }],
  });
  let message;
  try {
    message = await stream.finalMessage();
  } catch (err) {
    if (/authentication method|api[_ -]?key/i.test(err.message)) throw new Error("No Claude API key found. Copy .env.example to .env and set ANTHROPIC_API_KEY.");
    throw err;
  }
  if (message.stop_reason === "refusal") {
    throw new Error(`Claude declined this request (${message.stop_details?.category ?? "no category"}).`);
  }
  if (message.stop_reason === "max_tokens") throw new Error("Claude's reply was cut off at max_tokens.");
  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  return JSON.parse(text);
}

// JSON schemas for structured outputs. Every object lists all of its keys as required and disallows extras.
const str = { type: "string" };
const obj = (properties) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const arr = (items) => ({ type: "array", items });

export const BIBLE_SCHEMA = obj({
  station: obj({ name: str, full_name: str, operator: str, tagline: str, premise: str }),
  ai: obj({
    id: str,
    name: str,
    expansion: str,
    based_on: str,
    personality: str,
    voice_brief: str,
    broadcasts: obj({ intro: str, stairwell: str, outro: str, ambient: arr(str) }),
  }),
  characters: arr(obj({ id: str, name: str, station_role: str, real_role: str, personality: str, voice_brief: str, arc: str })),
  rooms: arr(obj({ id: str, display_name: str, flavor: str })),
  logs: arr(obj({ order: { type: "integer" }, ticket: str, room: str, speaker: str, title: str, beat: str })),
  text_terminals: arr(obj({ ticket: str, room: str, why: str })),
  graffiti: arr(str),
});

export const LOG_SCHEMA = obj({
  ticket: str,
  title: str,
  speaker: str,
  recorded: str,
  lines: arr(obj({ speaker: str, text: str })),
  summary: str,
});

export const CAST_SCHEMA = obj({
  cast: arr(obj({ character: str, voice_id: str, voice_name: str, speed: { type: "number" }, why: str })),
});
