// Turns ElevenLabs character timestamps into subtitle cues, skipping [audio tags].
import { stripTags } from "./util.js";

const MAX_CUE_CHARS = 64;

/** Builds word timings from an ElevenLabs alignment, dropping characters inside [brackets]. */
function wordsFromAlignment(alignment) {
  const { characters, character_start_times_seconds: starts, character_end_times_seconds: ends } = alignment;
  const words = [];
  let depth = 0;
  let cur = null;
  for (let i = 0; i < characters.length; i++) {
    const c = characters[i];
    if (c === "[") {
      depth++;
      continue;
    }
    if (c === "]") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth > 0) continue;
    if (/\s/.test(c)) {
      if (cur) words.push(cur);
      cur = null;
      continue;
    }
    if (!cur) cur = { text: "", t0: starts[i], t1: ends[i] };
    cur.text += c;
    cur.t1 = ends[i];
  }
  if (cur) words.push(cur);
  return words;
}

/** Spreads words evenly across a clip when no alignment is available. */
function estimatedWords(text, duration) {
  const words = stripTags(text).split(/\s+/).filter(Boolean);
  const total = words.reduce((n, w) => n + w.length + 1, 0);
  let t = 0.15;
  const usable = Math.max(0.5, duration - 0.3);
  return words.map((w) => {
    const d = ((w.length + 1) / total) * usable;
    const word = { text: w, t0: t, t1: t + d };
    t += d;
    return word;
  });
}

// Scripts spell ticket numbers out so the voices say them naturally ("PLAT eighteen seventy-four").
// Subtitles turn them back into keys ("PLAT-1874") whenever the result is a real ticket.
const ONES = { zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const TEENS = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

/** "seventy-four" -> "74", "nine-oh-one" -> "901"; null if it isn't a spoken number. */
function spokenDigits(word) {
  let out = "";
  const parts = word.toLowerCase().replace(/[.,!?:;'"]+$/, "").split("-");
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p in TENS && parts[i + 1] in ONES && ONES[parts[i + 1]] > 0) {
      out += TENS[p] + ONES[parts[++i]];
    } else if (p in TENS) out += TENS[p];
    else if (p in TEENS) out += TEENS[p];
    else if (p in ONES) out += ONES[p];
    else return null;
  }
  return out;
}

function joinTicketKeys(words, keys) {
  if (!keys?.size) return words;
  const out = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    let merged = false;
    if (/^[A-Z]{2,10}$/.test(w.text)) {
      for (let n = Math.min(4, words.length - i - 1); n >= 1 && !merged; n--) {
        const run = words.slice(i + 1, i + 1 + n);
        const digits = run.map((r) => spokenDigits(r.text));
        const key = `${w.text}-${digits.join("")}`;
        if (digits.includes(null) || !keys.has(key)) continue;
        const tail = run.at(-1).text.match(/[.,!?:;]+$/)?.[0] ?? "";
        out.push({ text: key + tail, t0: w.t0, t1: run.at(-1).t1 });
        i += n;
        merged = true;
      }
    }
    if (!merged) out.push(w);
  }
  return out;
}

/** Other things the scripts spell out for the voices: "ten dot zero dot six dot twelve", "bill-legacy-zero-one". */
function tidyNumbers(words) {
  const out = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    // IPv4 addresses
    const ip = [];
    for (let k = 0; k < 7 && i + k < words.length; k++) ip.push(words[i + k]);
    const octets = ip.filter((_, k) => k % 2 === 0).map((x) => spokenDigits(x.text));
    if (ip.length === 7 && ip.every((x, k) => k % 2 === 0 || x.text === "dot") && !octets.includes(null)) {
      const tail = ip[6].text.match(/[.,!?:;]+$/)?.[0] ?? "";
      out.push({ text: octets.join(".") + tail, t0: w.t0, t1: ip[6].t1 });
      i += 6;
      continue;
    }
    // host names ending in spelled digits
    const m = w.text.match(/^(.*?)([.,!?:;]*)$/);
    const parts = m[1].split("-");
    let k = parts.length;
    while (k > 0 && parts[k - 1].toLowerCase() in ONES) k--;
    if (k > 0 && parts.length - k >= 2 && /^[a-z]+$/i.test(parts[k - 1])) {
      const digits = parts.slice(k).map((p) => ONES[p.toLowerCase()]).join("");
      out.push({ ...w, text: `${parts.slice(0, k).join("-")}-${digits}${m[2]}` });
      continue;
    }
    out.push(w);
  }
  return out;
}

/** Groups words into readable cues that break on sentence ends or when they get long. */
export function buildCues(text, { alignment, duration, ticketKeys }) {
  const words = tidyNumbers(joinTicketKeys(alignment?.characters?.length ? wordsFromAlignment(alignment) : estimatedWords(text, duration), ticketKeys));
  const cues = [];
  let cur = null;
  for (const w of words) {
    if (!cur) cur = { t0: w.t0, t1: w.t1, text: w.text };
    else if (cur.text.length + 1 + w.text.length > MAX_CUE_CHARS) {
      cues.push(cur);
      cur = { t0: w.t0, t1: w.t1, text: w.text };
    } else {
      cur.text += " " + w.text;
      cur.t1 = w.t1;
    }
    if (/[.!?…—-]["')]?$/.test(w.text) && cur.text.length > 18) {
      cues.push(cur);
      cur = null;
    }
  }
  if (cur) cues.push(cur);
  // Hold each cue until the next one starts so subtitles don't blink between words.
  for (let i = 0; i < cues.length; i++) {
    const next = cues[i + 1];
    cues[i].t1 = next ? Math.max(cues[i].t1, next.t0 - 0.05) : cues[i].t1 + 0.6;
    cues[i].t0 = +cues[i].t0.toFixed(3);
    cues[i].t1 = +cues[i].t1.toFixed(3);
  }
  return cues;
}

/** Rough speaking-time estimate for text-only builds (about 2.6 words per second). */
export function estimateDuration(text) {
  const words = stripTags(text).split(/\s+/).filter(Boolean).length;
  const pauses = (text.match(/\[(short pause|long pause|sighs|exhales|inhales deeply)\]/g) ?? []).length;
  return +(words / 2.6 + pauses * 0.6 + 0.6).toFixed(2);
}
