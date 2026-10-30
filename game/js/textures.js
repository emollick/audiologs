// Procedural canvas textures: every surface, screen, poster and scrawl in the station is drawn here.
import * as THREE from "three";

const MONO = "'Share Tech Mono', monospace";
const HEAD = "'Bebas Neue', Impact, sans-serif";
const HAND = "'Permanent Marker', 'Comic Sans MS', cursive";

let seed = 1337;
export function rand() {
  // mulberry32: deterministic so the station looks the same every visit (and in recordings).
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const rr = (a, b) => a + rand() * (b - a);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

function canvas(w, h = w) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")];
}

let maxAniso = 4;
export function setAnisotropy(n) {
  maxAniso = n;
}

function tex(c, { repeat = true, color = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  return t;
}

/** Soft value noise: random pixels drawn small, then scaled up with smoothing. */
function noise(ctx, w, h, cell, alpha, light = false) {
  const [n, nx] = canvas(Math.max(2, Math.ceil(w / cell)), Math.max(2, Math.ceil(h / cell)));
  const img = nx.createImageData(n.width, n.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = light ? 255 : Math.floor(rand() * 255);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = light ? 255 : v;
    img.data[i + 3] = light ? Math.floor(rand() * 255) : 255;
  }
  nx.putImageData(img, 0, 0);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(n, 0, 0, w, h);
  ctx.restore();
}

function grime(ctx, w, h, strength = 1) {
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  noise(ctx, w, h, 64, 0.35 * strength);
  noise(ctx, w, h, 16, 0.2 * strength);
  noise(ctx, w, h, 3, 0.12 * strength);
  ctx.restore();
}

function stains(ctx, w, h, n, color = "rgba(40,30,20,0.18)") {
  for (let i = 0; i < n; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = rr(10, w / 6);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function scratches(ctx, w, h, n, color = "rgba(255,255,255,0.08)") {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (let i = 0; i < n; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const a = rand() * Math.PI;
    const l = rr(6, 40);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  ctx.restore();
}

/** Each surface returns { map, bump } so materials get a little relief. */
function pair(draw, size = 512, bumpDraw) {
  const [c, x] = canvas(size);
  draw(x, size);
  const [b, bx] = canvas(size);
  (bumpDraw ?? ((ctx) => {
    ctx.drawImage(c, 0, 0);
    ctx.globalCompositeOperation = "saturation";
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, size, size);
  }))(bx, size);
  return { map: tex(c), bump: tex(b, { color: false }) };
}

// ---------------------------------------------------------------- floors

export function floorMetal() {
  return pair((x, s) => {
    x.fillStyle = "#4a4f54";
    x.fillRect(0, 0, s, s);
    const p = s / 2;
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 2; j++) {
        const v = Math.floor(rr(-10, 10));
        x.fillStyle = `rgb(${74 + v},${79 + v},${84 + v})`;
        x.fillRect(i * p + 3, j * p + 3, p - 6, p - 6);
        // diamond tread
        x.strokeStyle = "rgba(255,255,255,0.07)";
        x.lineWidth = 2;
        for (let a = 0; a < 14; a++)
          for (let b = 0; b < 14; b++) {
            const cx = i * p + 12 + a * 17 + (b % 2) * 8;
            const cy = j * p + 12 + b * 17;
            x.beginPath();
            x.moveTo(cx - 4, cy + (a % 2 ? -3 : 3));
            x.lineTo(cx + 4, cy + (a % 2 ? 3 : -3));
            x.stroke();
          }
        x.fillStyle = "#2a2d30";
        for (const [rx, ry] of [[14, 14], [p - 14, 14], [14, p - 14], [p - 14, p - 14]]) {
          x.beginPath();
          x.arc(i * p + rx, j * p + ry, 5, 0, 7);
          x.fill();
          x.fillStyle = "#8a9096";
          x.beginPath();
          x.arc(i * p + rx - 1, j * p + ry - 1, 2.5, 0, 7);
          x.fill();
          x.fillStyle = "#2a2d30";
        }
      }
    x.fillStyle = "#1c1e20";
    x.fillRect(0, p - 2, s, 4);
    x.fillRect(p - 2, 0, 4, s);
    x.fillRect(0, 0, s, 2);
    x.fillRect(0, 0, 2, s);
    grime(x, s, s, 1.1);
    stains(x, s, s, 6);
    scratches(x, s, s, 120);
  });
}

export function floorHazard() {
  const m = floorMetal();
  const [c, x] = canvas(512);
  x.drawImage(m.map.image, 0, 0);
  x.save();
  x.beginPath();
  x.rect(0, 0, 512, 60);
  x.clip();
  for (let i = -2; i < 14; i++) {
    x.fillStyle = i % 2 ? "#c9a227" : "#151515";
    x.beginPath();
    x.moveTo(i * 48, 0);
    x.lineTo(i * 48 + 48, 0);
    x.lineTo(i * 48 + 108, 60);
    x.lineTo(i * 48 + 60, 60);
    x.fill();
  }
  x.restore();
  grime(x, 512, 512, 0.8);
  return { map: tex(c), bump: m.bump };
}

export function floorCarpet() {
  return pair((x, s) => {
    const p = s / 2;
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 2; j++) {
        x.fillStyle = (i + j) % 2 ? "#2c333b" : "#323942";
        x.fillRect(i * p, j * p, p, p);
      }
    noise(x, s, s, 1.5, 0.12);
    noise(x, s, s, 1, 0.08, true);
    x.strokeStyle = "rgba(0,0,0,0.35)";
    x.lineWidth = 2;
    x.strokeRect(1, 1, p - 2, p - 2);
    x.strokeRect(p + 1, p + 1, p - 2, p - 2);
    x.strokeRect(p + 1, 1, p - 2, p - 2);
    x.strokeRect(1, p + 1, p - 2, p - 2);
    stains(x, s, s, 5, "rgba(20,12,8,0.25)");
    grime(x, s, s, 0.6);
  });
}

export function floorTile() {
  return pair((x, s) => {
    const n = 8;
    const p = s / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const v = Math.floor(rr(-8, 8));
        const base = (i + j) % 2 ? [128, 124, 112] : [104, 106, 100];
        x.fillStyle = `rgb(${base[0] + v},${base[1] + v},${base[2] + v})`;
        x.fillRect(i * p, j * p, p, p);
      }
    x.fillStyle = "#2f2d28";
    for (let i = 0; i <= n; i++) {
      x.fillRect(i * p - 1.5, 0, 3, s);
      x.fillRect(0, i * p - 1.5, s, 3);
    }
    grime(x, s, s, 1.2);
    stains(x, s, s, 10, "rgba(60,40,10,0.2)");
  });
}

export function floorGrating() {
  return pair((x, s) => {
    x.fillStyle = "#111";
    x.fillRect(0, 0, s, s);
    const n = 16;
    const p = s / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        x.fillStyle = "#050505";
        x.fillRect(i * p + 4, j * p + 4, p - 8, p - 8);
      }
    x.strokeStyle = "#5a5e62";
    x.lineWidth = 4;
    for (let i = 0; i <= n; i++) {
      x.beginPath();
      x.moveTo(i * p, 0);
      x.lineTo(i * p, s);
      x.moveTo(0, i * p);
      x.lineTo(s, i * p);
      x.stroke();
    }
    x.strokeStyle = "rgba(255,255,255,0.12)";
    x.lineWidth = 1;
    for (let i = 0; i <= n; i++) {
      x.beginPath();
      x.moveTo(i * p - 1, 0);
      x.lineTo(i * p - 1, s);
      x.stroke();
    }
    grime(x, s, s, 0.9);
  });
}

export function floorConcrete() {
  return pair((x, s) => {
    x.fillStyle = "#5a5750";
    x.fillRect(0, 0, s, s);
    noise(x, s, s, 48, 0.25);
    noise(x, s, s, 6, 0.18);
    noise(x, s, s, 1.2, 0.12);
    x.strokeStyle = "rgba(20,18,15,0.6)";
    for (let i = 0; i < 5; i++) {
      let px = rand() * s;
      let py = rand() * s;
      x.lineWidth = rr(0.8, 2);
      x.beginPath();
      x.moveTo(px, py);
      for (let k = 0; k < 18; k++) {
        px += rr(-14, 14);
        py += rr(-14, 14);
        x.lineTo(px, py);
      }
      x.stroke();
    }
    stains(x, s, s, 9, "rgba(15,12,8,0.35)");
    grime(x, s, s, 1);
  });
}

// ---------------------------------------------------------------- walls and ceilings

export function wallOffice() {
  return pair((x, s) => {
    // texture covers 2m wide x 3m tall: dado band below ~0.9m
    x.fillStyle = "#8e897d";
    x.fillRect(0, 0, s, s);
    noise(x, s, s, 2, 0.06);
    const dado = s * (1 - 0.9 / 3);
    x.fillStyle = "#4f5458";
    x.fillRect(0, dado, s, s - dado);
    x.fillStyle = "#3a3d40";
    x.fillRect(0, dado - 6, s, 6);
    x.fillStyle = "#232527";
    x.fillRect(0, s - 14, s, 14);
    x.fillStyle = "rgba(0,0,0,0.25)";
    x.fillRect(s / 2 - 1, 0, 2, dado - 6);
    x.fillRect(0, 0, 2, dado - 6);
    // water stains running down from the ceiling
    for (let i = 0; i < 3; i++) {
      const sx = rand() * s;
      const g = x.createLinearGradient(0, 0, 0, rr(80, 260));
      g.addColorStop(0, "rgba(70,55,30,0.35)");
      g.addColorStop(1, "rgba(70,55,30,0)");
      x.fillStyle = g;
      x.fillRect(sx, 0, rr(8, 30), 260);
    }
    stains(x, s, s, 4, "rgba(30,25,20,0.15)");
    scratches(x, s, s, 30, "rgba(0,0,0,0.15)");
    grime(x, s, s, 0.7);
  });
}

export function wallMetal(tint = "#4c5359") {
  return pair((x, s) => {
    x.fillStyle = tint;
    x.fillRect(0, 0, s, s);
    const p = s / 2;
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 3; j++) {
        const y0 = (j * s) / 3;
        x.fillStyle = "rgba(255,255,255,0.05)";
        x.fillRect(i * p + 6, y0 + 6, p - 12, s / 3 - 12);
        x.strokeStyle = "rgba(0,0,0,0.55)";
        x.lineWidth = 3;
        x.strokeRect(i * p + 4, y0 + 4, p - 8, s / 3 - 8);
        x.fillStyle = "#24282c";
        for (const [rx, ry] of [[12, 12], [p - 12, 12], [12, s / 3 - 12], [p - 12, s / 3 - 12]]) {
          x.beginPath();
          x.arc(i * p + rx, y0 + ry, 3.5, 0, 7);
          x.fill();
        }
      }
    }
    // vent grille
    if (rand() < 0.9) {
      const vx = rr(40, s - 140);
      x.fillStyle = "#1b1e21";
      x.fillRect(vx, s * 0.12, 100, 50);
      x.fillStyle = "#3b4046";
      for (let k = 0; k < 8; k++) x.fillRect(vx + 4, s * 0.12 + 4 + k * 6, 92, 2);
    }
    // grime streaks
    for (let i = 0; i < 10; i++) {
      const sx = rand() * s;
      const g = x.createLinearGradient(0, 0, 0, s);
      g.addColorStop(0, "rgba(20,15,10,0)");
      g.addColorStop(rr(0.3, 0.9), "rgba(40,25,10,0.3)");
      g.addColorStop(1, "rgba(20,15,10,0)");
      x.fillStyle = g;
      x.fillRect(sx, 0, rr(2, 10), s);
    }
    grime(x, s, s, 1);
  });
}

export function wallConcrete() {
  return pair((x, s) => {
    x.fillStyle = "#545a52";
    x.fillRect(0, 0, s, s);
    const bw = s / 4;
    const bh = s / 8;
    for (let j = 0; j < 8; j++)
      for (let i = -1; i < 5; i++) {
        const ox = (j % 2) * (bw / 2);
        const v = Math.floor(rr(-8, 8));
        x.fillStyle = `rgb(${84 + v},${90 + v},${82 + v})`;
        x.fillRect(i * bw + ox + 2, j * bh + 2, bw - 4, bh - 4);
      }
    noise(x, s, s, 2, 0.12);
    for (let i = 0; i < 6; i++) {
      const sx = rand() * s;
      const g = x.createLinearGradient(0, 0, 0, s);
      g.addColorStop(0, "rgba(30,20,10,0.4)");
      g.addColorStop(1, "rgba(30,20,10,0)");
      x.fillStyle = g;
      x.fillRect(sx, 0, rr(10, 40), s * rr(0.3, 0.9));
    }
    stains(x, s, s, 8, "rgba(10,15,5,0.3)");
    grime(x, s, s, 1.2);
  });
}

export function ceilTiles() {
  return pair((x, s) => {
    x.fillStyle = "#a8a59c";
    x.fillRect(0, 0, s, s);
    noise(x, s, s, 1.5, 0.15);
    const p = s / 2;
    x.fillStyle = "#6b6a66";
    x.fillRect(0, 0, s, 5);
    x.fillRect(0, p - 2, s, 5);
    x.fillRect(0, 0, 5, s);
    x.fillRect(p - 2, 0, 5, s);
    stains(x, s, s, 3, "rgba(110,80,30,0.35)");
    if (rand() < 0.5) {
      x.fillStyle = "#0b0b0b";
      x.fillRect(p + 4, p + 4, p - 6, p - 6);
    }
    grime(x, s, s, 0.6);
  });
}

export function ceilMetal() {
  return wallMetal("#32373c");
}

// ---------------------------------------------------------------- screens

function screenBase(w, h, bg = "#071018") {
  const [c, x] = canvas(w, h);
  x.fillStyle = bg;
  x.fillRect(0, 0, w, h);
  return [c, x];
}

function scan(x, w, h, a = 0.18) {
  x.fillStyle = `rgba(0,0,0,${a})`;
  for (let y = 0; y < h; y += 3) x.fillRect(0, y, w, 1);
}

export function screenJira(tickets, title = "SPRINT 47") {
  const [c, x] = screenBase(512, 320, "#0e1726");
  x.fillStyle = "#1d2b44";
  x.fillRect(0, 0, 512, 30);
  x.fillStyle = "#8fb3ff";
  x.font = `16px ${MONO}`;
  x.fillText(`PLATFORM / ${title}`, 10, 20);
  x.fillStyle = "#ff6b6b";
  x.fillText("● 3 DAYS OVERDUE", 360, 20);
  const cols = [["TO DO", "To Do"], ["IN PROGRESS", "In Progress"], ["DONE", "Done"]];
  cols.forEach(([label], i) => {
    const cx = 8 + i * 168;
    x.fillStyle = "#16223a";
    x.fillRect(cx, 38, 160, 276);
    x.fillStyle = "#7d8fb3";
    x.font = `13px ${MONO}`;
    x.fillText(label, cx + 6, 54);
  });
  const buckets = [[], [], []];
  for (const t of tickets) {
    const s = (t.status ?? "").toLowerCase();
    const col = /done|closed|resolved/.test(s) ? 2 : /progress|review|blocked|waiting/.test(s) ? 1 : 0;
    buckets[col].push(t);
  }
  buckets.forEach((list, i) => {
    list.slice(0, 5).forEach((t, j) => {
      const cx = 12 + i * 168;
      const cy = 62 + j * 50;
      x.fillStyle = "#22324f";
      x.fillRect(cx, cy, 152, 44);
      x.fillStyle = /highest|high/i.test(t.priority) ? "#ff6b6b" : "#4bd4a8";
      x.fillRect(cx, cy, 3, 44);
      x.fillStyle = "#9fb6e0";
      x.font = `11px ${MONO}`;
      x.fillText(t.key, cx + 8, cy + 14);
      x.fillStyle = "#e1e8f5";
      const words = t.summary.split(" ");
      let line = "";
      let ly = cy + 27;
      for (const w of words) {
        if ((line + w).length > 22) {
          x.fillText(line, cx + 8, ly);
          line = "";
          ly += 12;
          if (ly > cy + 40) break;
        }
        line += w + " ";
      }
      if (ly <= cy + 40) x.fillText(line, cx + 8, ly);
    });
  });
  scan(x, 512, 320, 0.12);
  return tex(c, { repeat: false });
}

export function screenCode() {
  const [c, x] = screenBase(512, 320, "#0b0f14");
  const lines = [
    ["#c792ea", "async function retryInvoicePush(invoice) {"],
    ["#89ddff", "  // TODO(gary): persist queue to disk before Monday"],
    ["#c3e88d", "  while (true) {"],
    ["#f07178", "    const ok = await ledger.push(invoice);"],
    ["#c3e88d", "    if (ok) return;   // never lose an invoice"],
    ["#ffcb6b", "    await sleep(backoff(++invoice.attempts));"],
    ["#c3e88d", "  }"],
    ["#c792ea", "}"],
    ["#546e7a", ""],
    ["#546e7a", "// $ grep -r bill-legacy-01 billing-v2/"],
    ["#546e7a", "// (no results)"],
    ["#ff5370", "// FAILED test_payment_retry_backoff: expected 3, got 1148"],
  ];
  x.font = `14px ${MONO}`;
  lines.forEach(([col, l], i) => {
    x.fillStyle = "#3b4a5a";
    x.fillText(String(i + 1).padStart(3, " "), 6, 24 + i * 22);
    x.fillStyle = col;
    x.fillText(l, 40, 24 + i * 22);
  });
  scan(x, 512, 320, 0.1);
  return tex(c, { repeat: false });
}

export function screenSlack() {
  const [c, x] = screenBase(512, 320, "#1a1d21");
  x.fillStyle = "#3f0e40";
  x.fillRect(0, 0, 120, 320);
  x.fillStyle = "#e8d5e9";
  x.font = `13px ${MONO}`;
  ["# platform", "# billing", "# incidents", "# random", "# kitchen"].forEach((ch, i) => x.fillText(ch, 10, 30 + i * 22));
  const msgs = [
    ["Marcus Chen", "has anyone seen Priya?"],
    ["Marcus Chen", "postmortem moved to next week!"],
    ["Tom Becker", "paged for billing, going to check on it"],
    ["Tom Becker", "there's a light on down there"],
    ["Automation", "Reminder: 1 day remaining. 43%"],
  ];
  msgs.forEach(([who, m], i) => {
    x.fillStyle = "#ffffff";
    x.font = `bold 13px ${MONO}`;
    x.fillText(who, 134, 34 + i * 54);
    x.fillStyle = "#d1d2d3";
    x.font = `13px ${MONO}`;
    x.fillText(m, 134, 52 + i * 54);
  });
  x.fillStyle = "#e01e5a";
  x.fillText("Priya Raman: last active Tuesday", 134, 306);
  scan(x, 512, 320, 0.1);
  return tex(c, { repeat: false });
}

export function screenTrainingLarge() {
  const [c, x] = screenBase(512, 320, "#f4f6fb");
  x.fillStyle = "#0b5cff";
  x.fillRect(0, 0, 512, 46);
  x.fillStyle = "#fff";
  x.font = `24px ${HEAD}`;
  x.fillText("SECURITY AWARENESS TRAINING", 14, 32);
  x.fillStyle = "#111";
  x.font = `18px ${MONO}`;
  x.fillText("Module 4 of 4", 20, 86);
  x.font = `16px ${MONO}`;
  x.fillText("Reporting unknown devices", 20, 112);
  x.fillText("on the network", 20, 132);
  x.fillStyle = "#e2e6f0";
  x.fillRect(20, 160, 472, 26);
  x.fillStyle = "#0b5cff";
  x.fillRect(20, 160, 472 * 0.43, 26);
  x.fillStyle = "#111";
  x.font = `18px ${MONO}`;
  x.fillText("Company completion: 43%", 20, 214);
  x.fillStyle = "#c00";
  x.fillText("Due: Fri Oct 30", 20, 244);
  x.fillStyle = "#444";
  x.font = `14px ${MONO}`;
  x.fillText("[ Continue ]", 380, 296);
  return tex(c, { repeat: false });
}

export function screenDashboard(kind) {
  const [c, x] = screenBase(512, 320, "#05070a");
  x.font = `16px ${MONO}`;
  if (kind === "errors") {
    x.fillStyle = "#ff4d4d";
    x.fillText("checkout-api  5xx rate", 12, 24);
    x.font = `64px ${HEAD}`;
    x.fillText("38.2%", 12, 96);
    x.strokeStyle = "#ff4d4d";
    x.lineWidth = 2;
    x.beginPath();
    for (let i = 0; i < 60; i++) {
      const y = 290 - (i > 40 ? rr(120, 170) : rr(4, 14));
      i ? x.lineTo(8 + i * 8.2, y) : x.moveTo(8, y);
    }
    x.stroke();
    x.fillStyle = "#552222";
    x.fillRect(8, 290, 496, 1);
  } else if (kind === "latency") {
    x.fillStyle = "#ffb84d";
    x.fillText("p99 latency (ms)", 12, 24);
    x.font = `64px ${HEAD}`;
    x.fillText("14,210", 12, 96);
    x.fillStyle = "#ffb84d";
    for (let i = 0; i < 40; i++) {
      const hgt = i > 26 ? rr(120, 180) : rr(8, 30);
      x.fillRect(12 + i * 12.3, 290 - hgt, 9, hgt);
    }
  } else if (kind === "pager") {
    x.fillStyle = "#06ac38";
    x.fillRect(0, 0, 512, 36);
    x.fillStyle = "#fff";
    x.font = `20px ${HEAD}`;
    x.fillText("ON-CALL: TOM BECKER", 12, 26);
    x.font = `14px ${MONO}`;
    const rows = [
      ["03:12", "SEV2", "billing-v2 ledger sync timeouts", "#ff4d4d"],
      ["03:12", "SEV2", "billing-v2 ledger sync timeouts", "#ff4d4d"],
      ["03:12", "SEV2", "billing-v2 ledger sync timeouts", "#ff4d4d"],
      ["03:00", "INFO", "nightly-invoice-reconcile: disabled", "#8aa"],
      ["03:00", "WARN", "smtp: 1147 msgs from bill-legacy-01", "#ffb84d"],
      ["--:--", "ACK ", "unacknowledged (7 days)", "#ff4d4d"],
    ];
    rows.forEach(([t, s, m, col], i) => {
      x.fillStyle = col;
      x.fillText(`${t}  ${s}  ${m}`, 12, 64 + i * 38);
    });
  } else {
    x.fillStyle = "#7df9ff";
    x.fillText("NETWORK MAP / UNKNOWN HOSTS", 12, 24);
    x.strokeStyle = "#1e4a50";
    for (let i = 0; i < 12; i++) {
      x.beginPath();
      x.arc(rr(40, 470), rr(60, 280), rr(4, 10), 0, 7);
      x.stroke();
    }
    x.fillStyle = "#ff4d4d";
    x.beginPath();
    x.arc(256, 200, 14, 0, 7);
    x.fill();
    x.font = `18px ${MONO}`;
    x.fillText("10.0.6.12  ???", 280, 206);
    x.fillStyle = "#7df9ff";
    x.font = `14px ${MONO}`;
    x.fillText("resolves: NXDOMAIN   cmdb: NOT FOUND   aws: NOT FOUND", 12, 300);
  }
  scan(x, 512, 320, 0.2);
  return tex(c, { repeat: false });
}

export function screenSupport() {
  const [c, x] = screenBase(512, 320, "#f6f7f9");
  x.fillStyle = "#1f73b7";
  x.fillRect(0, 0, 512, 36);
  x.fillStyle = "#fff";
  x.font = `18px ${HEAD}`;
  x.fillText("SUPPORT QUEUE  (41 NEW)", 12, 25);
  x.font = `13px ${MONO}`;
  for (let i = 0; i < 9; i++) {
    x.fillStyle = i % 2 ? "#fff" : "#eef1f5";
    x.fillRect(0, 40 + i * 30, 512, 30);
    x.fillStyle = "#333";
    x.fillText(`03:00  "Your payment failed, we'll retry soon!"`, 10, 60 + i * 30);
  }
  return tex(c, { repeat: false });
}

export function screenProjector() {
  const [c, x] = screenBase(512, 300, "#f2f2ee");
  x.fillStyle = "#1a1a1a";
  x.font = `54px ${HEAD}`;
  x.fillText("SPRINT 47", 30, 76);
  x.fillStyle = "#c62828";
  x.fillText("LOCKED", 280, 76);
  x.fillStyle = "#333";
  x.font = `18px ${MONO}`;
  x.fillText("Velocity is a team metric!", 32, 118);
  x.fillStyle = "#4a6fa5";
  const bars = [21, 23, 19, 22, 13, 3];
  bars.forEach((v, i) => {
    x.fillRect(40 + i * 72, 270 - v * 6, 46, v * 6);
    x.fillStyle = "#555";
    x.font = `12px ${MONO}`;
    x.fillText(`S${42 + i}`, 50 + i * 72, 290);
    x.fillStyle = i === 5 ? "#c62828" : "#4a6fa5";
  });
  return tex(c, { repeat: false });
}

export function screenEpic() {
  const [c, x] = screenBase(512, 300, "#0e1726");
  x.fillStyle = "#4bd4a8";
  x.font = `40px ${HEAD}`;
  x.fillText("PLAT-1650  BILLING V2 MIGRATION", 18, 60);
  x.font = `22px ${MONO}`;
  x.fillStyle = "#e1e8f5";
  x.fillText("Status: DONE", 20, 110);
  x.fillText("100% of traffic on billing-v2", 20, 146);
  x.fillStyle = "#ffcb6b";
  x.fillText("HUGE win team!! Champagne in", 20, 196);
  x.fillText("the kitchen!", 20, 226);
  scan(x, 512, 300, 0.12);
  return tex(c, { repeat: false });
}

export function screenPostmortem() {
  const [c, x] = screenBase(512, 300, "#111417");
  x.fillStyle = "#e1e8f5";
  x.font = `24px ${HEAD}`;
  x.fillText("POSTMORTEM: OCT 9 BILLING OUTAGE", 16, 36);
  x.font = `16px ${MONO}`;
  const rows = ["## Summary", "TBD", "## Root cause", "TBD", "## Action items", "[ ] Find out what bill-legacy-01 does", "[ ] Find Gary", "[ ] Update runbook"];
  rows.forEach((r, i) => {
    x.fillStyle = r.startsWith("#") ? "#7d8fb3" : r === "TBD" ? "#ff6b6b" : "#c9d1d9";
    x.fillText(r, 18, 70 + i * 27);
  });
  scan(x, 512, 300, 0.1);
  return tex(c, { repeat: false });
}

export function screenTypo() {
  const [c, x] = screenBase(512, 300, "#fafafa");
  x.fillStyle = "#111";
  x.font = `28px ${HEAD}`;
  x.fillText("PRICING", 20, 40);
  ["Starter", "Team", "Enterprice"].forEach((p, i) => {
    x.strokeStyle = "#ccc";
    x.strokeRect(20 + i * 162, 70, 148, 200);
    x.fillStyle = i === 2 ? "#c62828" : "#111";
    x.font = `26px ${HEAD}`;
    x.fillText(p, 32 + i * 162, 110);
  });
  return tex(c, { repeat: false });
}

/** Animated CCTV static with a camera label. */
export function screenCCTV() {
  const [c, x] = canvas(256, 160);
  const t = tex(c, { repeat: false });
  let acc = 0;
  let clock = 0;
  const draw = () => {
    const img = x.createImageData(256, 160);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 120;
      img.data[i] = v * 0.8;
      img.data[i + 1] = v;
      img.data[i + 2] = v * 0.9;
      img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    // a dark doorway shape that is sometimes occupied
    x.fillStyle = "rgba(0,0,0,0.55)";
    x.fillRect(110, 40, 40, 100);
    if (Math.random() < 0.15) {
      x.fillStyle = "rgba(0,0,0,0.85)";
      x.beginPath();
      x.ellipse(130, 70, 7, 9, 0, 0, 7);
      x.fill();
      x.fillRect(122, 79, 16, 50);
    }
    x.fillStyle = "#e8e8e8";
    x.font = `14px ${MONO}`;
    x.fillText("CAM 07  LEVEL B", 8, 18);
    x.fillText(new Date(Date.UTC(2026, 9, 22, 3, 14, Math.floor(clock) % 60)).toISOString().slice(0, 19).replace("T", " "), 8, 152);
    t.needsUpdate = true;
  };
  draw();
  return {
    texture: t,
    update(dt) {
      acc += dt;
      clock += dt;
      if (acc > 0.08) {
        acc = 0;
        draw();
      }
    },
  };
}

/** The console of bill-legacy-01: still logged in, still retrying. */
export function screenCRT() {
  const [c, x] = canvas(384, 288);
  const t = tex(c, { repeat: false });
  let attempts = 2914882113;
  let acc = 0;
  let clock = 0;
  const header = [
    "bill-legacy-01 login: gwhitfield",
    "Last login: Fri Aug 26 17:58:02 2016",
    "",
    "gwhitfield@bill-legacy-01:~$ node retry.js",
    "[retry-queue] in flight: 1147",
  ];
  const lines = [];
  const draw = () => {
    x.fillStyle = "#020a04";
    x.fillRect(0, 0, 384, 288);
    x.font = `14px ${MONO}`;
    x.fillStyle = "#58ff8a";
    header.forEach((l, i) => x.fillText(l, 12, 22 + i * 18));
    lines.forEach((l, i) => x.fillText(l, 12, 22 + (header.length + i) * 18));
    x.fillStyle = "rgba(88,255,138,0.9)";
    if (Math.floor(clock * 2) % 2) x.fillRect(12, 22 + (header.length + lines.length) * 18 - 12, 9, 14);
    const g = x.createRadialGradient(192, 144, 60, 192, 144, 240);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.6)");
    x.fillStyle = g;
    x.fillRect(0, 0, 384, 288);
    scan(x, 384, 288, 0.25);
    t.needsUpdate = true;
  };
  draw();
  return {
    texture: t,
    update(dt) {
      acc += dt;
      clock += dt;
      if (acc > 0.35) {
        acc = 0;
        attempts += Math.floor(rr(1, 4));
        const inv = 20160000 + Math.floor(rand() * 1147);
        lines.push(`[retry] inv#${inv} attempt ${attempts.toLocaleString()} ... OK`);
        if (lines.length > 9) lines.shift();
        draw();
      }
    },
  };
}

/** Blinking rack LEDs. */
export function rackLEDs() {
  const [c, x] = canvas(64, 256);
  const t = tex(c, { repeat: false });
  const leds = Array.from({ length: 60 }, (_, i) => ({ x: 6 + (i % 5) * 12, y: 8 + Math.floor(i / 5) * 20, on: rand() < 0.5, rate: rr(0.05, 0.6), col: pick(["#3dff6e", "#3dff6e", "#ffb000", "#41a8ff", "#ff3030"]) }));
  const draw = () => {
    x.fillStyle = "#0a0b0c";
    x.fillRect(0, 0, 64, 256);
    for (const l of leds) {
      x.fillStyle = l.on ? l.col : "#151515";
      x.fillRect(l.x, l.y, 5, 3);
    }
    t.needsUpdate = true;
  };
  draw();
  let acc = 0;
  return {
    texture: t,
    update(dt) {
      acc += dt;
      if (acc < 0.07) return;
      acc = 0;
      for (const l of leds) if (Math.random() < l.rate * 0.5) l.on = !l.on;
      draw();
    },
  };
}

// ---------------------------------------------------------------- paper, posters, signs

export function poster(kind) {
  const [c, x] = canvas(256, 360);
  if (kind === "training") {
    x.fillStyle = "#f0ede4";
    x.fillRect(0, 0, 256, 360);
    x.fillStyle = "#0b5cff";
    x.fillRect(0, 0, 256, 90);
    x.fillStyle = "#fff";
    x.font = `34px ${HEAD}`;
    x.fillText("SECURITY", 16, 42);
    x.fillText("AWARENESS", 16, 78);
    x.fillStyle = "#111";
    x.font = `15px ${MONO}`;
    ["If you see a device", "you don't recognize:", "", "DO NOT TOUCH IT.", "REPORT IT."].forEach((l, i) => x.fillText(l, 16, 124 + i * 22));
    x.fillStyle = "#c62828";
    x.font = `56px ${HEAD}`;
    x.fillText("43%", 16, 300);
    x.fillStyle = "#333";
    x.font = `13px ${MONO}`;
    x.fillText("complete. Due Fri Oct 30!", 16, 330);
  } else if (kind === "halcyon") {
    x.fillStyle = "#14202c";
    x.fillRect(0, 0, 256, 360);
    x.fillStyle = "#4bd4a8";
    x.font = `48px ${HEAD}`;
    x.fillText("MOVE FAST.", 16, 120);
    x.fillStyle = "#e1e8f5";
    x.fillText("SHIP SAFE.", 16, 172);
    x.font = `14px ${MONO}`;
    x.fillText("HALCYON SYSTEMS", 16, 320);
  } else if (kind === "lunch") {
    x.fillStyle = "#fff6d6";
    x.fillRect(0, 0, 256, 360);
    x.fillStyle = "#d35400";
    x.font = `42px ${HEAD}`;
    x.fillText("LUNCH &", 20, 70);
    x.fillText("LEARN!", 20, 116);
    x.fillStyle = "#333";
    x.font = `18px ${HAND}`;
    x.fillText("Thursday 12pm", 20, 170);
    x.fillText("Pizza provided!!", 20, 204);
    x.fillText("Module 4 review", 20, 238);
  } else {
    x.fillStyle = "#fffef8";
    x.fillRect(0, 0, 256, 360);
    x.fillStyle = "#111";
    x.font = `30px ${HEAD}`;
    x.fillText("FRIDGE CLEANOUT", 16, 50);
    x.font = `18px ${HAND}`;
    ["Friday 4pm!", "Label your food", "with NAME + DATE", "No exceptions", "this time :)", "- Linda"].forEach((l, i) => x.fillText(l, 16, 100 + i * 36));
  }
  grime(x, 256, 360, 0.35);
  return tex(c, { repeat: false });
}

export function whiteboard() {
  const [c, x] = canvas(512, 256);
  x.fillStyle = "#e9ebe6";
  x.fillRect(0, 0, 512, 256);
  stains(x, 512, 256, 6, "rgba(120,130,150,0.12)");
  const words = [["Submit", "#1565c0", 40, 60], ["Continue", "#c62828", 180, 52], ["Next", "#2e7d32", 360, 66], ["Proceed", "#6a1b9a", 60, 150], ["Let's go!", "#ef6c00", 230, 160]];
  x.font = `38px ${HAND}`;
  for (const [w, col, wx, wy] of words) {
    x.fillStyle = col;
    x.fillText(w, wx, wy);
    if (w !== "Submit") {
      x.strokeStyle = "#111";
      x.lineWidth = 3;
      x.beginPath();
      x.moveTo(wx - 6, wy - 12);
      x.lineTo(wx + x.measureText(w).width + 6, wy - 8);
      x.stroke();
    }
  }
  x.strokeStyle = "#c62828";
  x.lineWidth = 4;
  x.beginPath();
  x.ellipse(98, 48, 80, 32, 0, 0, 7);
  x.stroke();
  x.fillStyle = "#111";
  x.font = `24px ${HAND}`;
  x.fillText("13 pts", 400, 160);
  x.fillText("align in sync?", 330, 220);
  x.fillText("(since May)", 40, 230);
  return tex(c, { repeat: false });
}

export function banner() {
  const [c, x] = canvas(1024, 128);
  x.fillStyle = "#1b3d8f";
  x.fillRect(0, 0, 1024, 128);
  x.fillStyle = "#ffd54f";
  x.font = `72px ${HEAD}`;
  x.fillText("CONGRATS BILLING V2 TEAM!!", 60, 92);
  x.fillStyle = "#ff6b6b";
  x.font = `40px ${HAND}`;
  x.fillText("nov 2023", 860, 110);
  grime(x, 1024, 128, 0.8);
  stains(x, 1024, 128, 6, "rgba(60,40,10,0.4)");
  return tex(c, { repeat: false });
}

export function sticky(lines, color = "#f7e463") {
  const [c, x] = canvas(128);
  x.fillStyle = color;
  x.fillRect(0, 0, 128, 128);
  x.fillStyle = "rgba(0,0,0,0.08)";
  x.fillRect(0, 0, 128, 18);
  x.fillStyle = "#1a1a1a";
  x.font = `17px ${HAND}`;
  lines.forEach((l, i) => x.fillText(l, 8, 40 + i * 22));
  return tex(c, { repeat: false });
}

export function invoice() {
  const [c, x] = canvas(128, 166);
  x.fillStyle = "#f2efe6";
  x.fillRect(0, 0, 128, 166);
  x.fillStyle = "#222";
  x.font = `12px ${MONO}`;
  x.fillText("INVOICE", 8, 18);
  x.font = `9px ${MONO}`;
  x.fillText(`#2016-${Math.floor(rr(1000, 9999))}`, 8, 32);
  x.fillText("DUE: 08/26/2016", 8, 44);
  for (let i = 0; i < 8; i++) {
    x.fillStyle = "#888";
    x.fillRect(8, 56 + i * 9, rr(50, 110), 3);
  }
  x.fillStyle = "#b71c1c";
  x.font = `10px ${MONO}`;
  x.fillText("RETRY PENDING - G.W.", 8, 156);
  return tex(c, { repeat: false });
}

export function graffiti(text, color = "#9e1b1b") {
  const [c, x] = canvas(1024, 256);
  x.font = `120px ${HAND}`;
  const w = x.measureText(text).width;
  const scale = Math.min(1, 960 / w);
  x.save();
  x.translate(512 - (w * scale) / 2, 170);
  x.scale(scale, 1);
  x.rotate(rr(-0.03, 0.03));
  for (let i = 0; i < 6; i++) {
    x.globalAlpha = 0.18;
    x.fillStyle = color;
    x.fillText(text, rr(-3, 3), rr(-3, 3));
  }
  x.globalAlpha = 0.85;
  x.fillText(text, 0, 0);
  // drips
  x.globalAlpha = 0.7;
  for (let i = 0; i < text.length * 1.3; i++) {
    const dx = rr(0, w);
    const len = rr(10, 70);
    const g = x.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g;
    x.fillRect(dx, rr(-10, 10), rr(2, 5), len);
  }
  x.restore();
  return tex(c, { repeat: false });
}

export function sign(text, sub = "", { bg = "#101418", fg = "#e8e2c8", accent = "#c9a227" } = {}) {
  const [c, x] = canvas(512, 128);
  x.fillStyle = bg;
  x.fillRect(0, 0, 512, 128);
  x.fillStyle = accent;
  x.fillRect(0, 0, 10, 128);
  x.fillStyle = fg;
  x.font = `56px ${HEAD}`;
  const scale = Math.min(1, 470 / x.measureText(text).width);
  x.save();
  x.translate(28, sub ? 70 : 84);
  x.scale(scale, 1);
  x.fillText(text, 0, 0);
  x.restore();
  if (sub) {
    x.fillStyle = accent;
    x.font = `20px ${MONO}`;
    x.fillText(sub, 30, 106);
  }
  grime(x, 512, 128, 0.5);
  return tex(c, { repeat: false });
}

export function logoSign() {
  const [c, x] = canvas(1024, 256);
  x.fillStyle = "#0a1016";
  x.fillRect(0, 0, 1024, 256);
  x.shadowColor = "#4bd4a8";
  x.shadowBlur = 30;
  x.fillStyle = "#bff5e6";
  x.font = `160px ${HEAD}`;
  x.fillText("HALCYON", 220, 170);
  x.shadowBlur = 0;
  x.fillStyle = "#4bd4a8";
  x.font = `30px ${MONO}`;
  x.fillText("systems that never go down", 300, 225);
  return tex(c, { repeat: false });
}

export function starfield() {
  const [c, x] = canvas(256);
  x.fillStyle = "#01020a";
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 220; i++) {
    const b = rand();
    x.fillStyle = `rgba(255,255,255,${0.3 + b * 0.7})`;
    x.fillRect(rand() * 256, rand() * 256, b > 0.95 ? 2 : 1, b > 0.95 ? 2 : 1);
  }
  const g = x.createRadialGradient(200, 220, 0, 200, 220, 140);
  g.addColorStop(0, "rgba(80,120,255,0.35)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  return tex(c, { repeat: false });
}

export function outOfOrder() {
  const [c, x] = canvas(256, 160);
  x.fillStyle = "#f8f8f2";
  x.fillRect(0, 0, 256, 160);
  x.fillStyle = "#c62828";
  x.font = `46px ${HEAD}`;
  x.fillText("OUT OF ORDER", 14, 62);
  x.fillStyle = "#222";
  x.font = `20px ${HAND}`;
  x.fillText("PLEASE do not use", 22, 104);
  x.fillText("the machine - L.", 22, 136);
  x.fillStyle = "rgba(255,255,255,0.5)";
  x.fillRect(100, 0, 56, 14);
  return tex(c, { repeat: false });
}

export function boxLabel(text) {
  const [c, x] = canvas(256);
  x.fillStyle = "#9a7a4f";
  x.fillRect(0, 0, 256, 256);
  noise(x, 256, 256, 2, 0.12);
  x.fillStyle = "#c9b48a";
  x.fillRect(0, 118, 256, 20);
  x.fillStyle = "#1a1a1a";
  x.font = `30px ${HAND}`;
  x.fillText(text, 20, 80);
  x.font = `22px ${HAND}`;
  x.fillText("DO NOT OPEN", 20, 200);
  return tex(c, { repeat: false });
}

export function nameplate(text) {
  const [c, x] = canvas(256, 64);
  x.fillStyle = "#e8e4d8";
  x.fillRect(0, 0, 256, 64);
  x.fillStyle = "#1a1a1a";
  x.font = `32px ${HAND}`;
  x.fillText(text, 12, 44);
  return tex(c, { repeat: false });
}

/** Flashlight cookie: hot center, soft ring, dark falloff. */
export function flashlightCookie() {
  const [c, x] = canvas(256);
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(255,250,235,1)");
  g.addColorStop(0.25, "rgba(255,245,225,0.95)");
  g.addColorStop(0.42, "rgba(220,215,200,0.55)");
  g.addColorStop(0.5, "rgba(250,245,230,0.75)");
  g.addColorStop(0.62, "rgba(140,138,130,0.3)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = "#000";
  x.fillRect(0, 0, 256, 256);
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  noise(x, 256, 256, 8, 0.08);
  return tex(c, { repeat: false });
}

/** Additive glow sprite. */
export function glow(color = "255,200,120") {
  const [c, x] = canvas(128);
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, `rgba(${color},1)`);
  g.addColorStop(0.2, `rgba(${color},0.5)`);
  g.addColorStop(1, `rgba(${color},0)`);
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return tex(c, { repeat: false });
}

export function recorderScreen() {
  const [c, x] = canvas(64, 32);
  x.fillStyle = "#0b1f12";
  x.fillRect(0, 0, 64, 32);
  x.fillStyle = "#6dff9a";
  x.font = `12px ${MONO}`;
  x.fillText("REC 01", 6, 20);
  return tex(c, { repeat: false });
}

/** Generic issue view for in-world terminals, built from the ticket data. */
export function screenTerminal(info) {
  const [c, x] = screenBase(512, 320, "#0e1726");
  x.fillStyle = "#1d2b44";
  x.fillRect(0, 0, 512, 34);
  x.fillStyle = "#8fb3ff";
  x.font = `18px ${MONO}`;
  x.fillText(`${info.key}  ·  ${info.type ?? "Issue"}`, 12, 23);
  x.fillStyle = "#e1e8f5";
  x.font = `30px ${HEAD}`;
  const words = (info.summary ?? "").split(" ");
  let line = "";
  let y = 76;
  for (const w of words) {
    if (x.measureText(line + w).width > 480) {
      x.fillText(line, 12, y);
      line = "";
      y += 32;
      if (y > 150) break;
    }
    line += w + " ";
  }
  if (y <= 150) x.fillText(line, 12, y);
  const status = (info.status ?? "").toUpperCase();
  x.font = `16px ${MONO}`;
  x.fillStyle = /DONE|CLOSED|RESOLVED/.test(status) ? "#2e7d32" : /PROGRESS|BLOCKED|REVIEW|WAITING/.test(status) ? "#1565c0" : "#5c6b80";
  x.fillRect(12, 196, x.measureText(status).width + 20, 26);
  x.fillStyle = "#fff";
  x.fillText(status, 22, 214);
  x.fillStyle = "#9fb6e0";
  x.fillText(`Assignee: ${info.assignee ?? "Unassigned"}`, 12, 252);
  x.fillText(`${info.comments ?? 0} comments`, 12, 276);
  x.fillStyle = "#ffcb6b";
  x.fillText("[ E ] READ", 400, 306);
  scan(x, 512, 320, 0.12);
  return tex(c, { repeat: false });
}
