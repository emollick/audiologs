// A small pool of real point lights follows the player around a much larger set of light "anchors".
// Keeping the light count fixed avoids shader recompiles; anchors far away just glow through their fixtures.
import * as THREE from "three";

const hash = (n) => {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

/** Brightness 0..1 for an anchor at time t. Deterministic, so recordings look the same every time. */
function level(a, t) {
  const s = a.seed;
  switch (a.mode) {
    case "dead":
      return hash(Math.floor(t * 3 + s)) < 0.012 ? 0.6 : 0;
    case "pulse":
      return 0.45 + 0.55 * Math.max(0, Math.sin(t * 2.4 + s));
    case "spin":
      return 0.08 + Math.pow(Math.max(0, Math.sin(t * 3.6 + s)), 6);
    case "dying": {
      const unstable = hash(Math.floor(t * 0.7 + s)) < 0.45;
      const n = hash(Math.floor(t * 22 + s * 13));
      return unstable ? (n < 0.35 ? 0.9 : 0.08) : 0.12 + 0.05 * Math.sin(t * 50);
    }
    case "flicker": {
      const unstable = hash(Math.floor(t * 0.5 + s)) < 0.22;
      const n = hash(Math.floor(t * 15 + s * 7));
      if (n < (unstable ? 0.45 : 0.03)) return 0.12 + 0.3 * hash(n * 100);
      return 1;
    }
    default:
      return 1;
  }
}

// anchors are authored in rough "feel" units; this maps them onto physical candela
const BOOST = 4;

export class LightRig {
  constructor(scene, anchors, poolSize = 8) {
    this.anchors = anchors;
    this.pool = Array.from({ length: poolSize }, () => {
      const l = new THREE.PointLight(0xffffff, 0, 8, 1.5);
      l.userData = { anchor: null, fade: 0 };
      scene.add(l);
      return l;
    });
    this.global = 1;
    this.alert = 0;
    this.surge = 0;
    this._red = new THREE.Color(0xff1a10);
    this._tmp = new THREE.Color();
  }

  /** Briefly kills every light (used for scares). */
  blackout(seconds = 0.6) {
    this.surge = -seconds;
  }

  update(t, dt, playerPos, room) {
    if (this.surge < 0) this.surge = Math.min(0, this.surge + dt);
    const dark = this.surge < 0 ? 0.05 : 1;
    for (const a of this.anchors) {
      let lv = level(a, t);
      if (this.alert > 0) lv = lv * (1 - this.alert) + this.alert * (0.35 + 0.65 * Math.max(0, Math.sin(t * 3.2 + a.seed * 0.1)));
      a.level = lv * this.global * dark;
      if (a.fixture) {
        const k = 2.2 * a.level;
        this._tmp.setRGB(k, k, k * 0.93);
        if (this.alert > 0) this._tmp.lerp(this._red.clone().multiplyScalar(k * 1.4), this.alert);
        a.fixture.color.copy(this._tmp);
      }
    }

    // pick the closest useful anchors, preferring the player's own room
    const scored = this.anchors
      .filter((a) => a.mode !== "dead" || a.level > 0.01)
      .map((a) => {
        const d = a.pos.distanceTo(playerPos);
        return { a, score: d * (a.room && room && a.room !== room ? 1.7 : 1) };
      })
      .filter((s) => s.score < s.a.distance * 2.2)
      .sort((x, y) => x.score - y.score)
      .slice(0, this.pool.length)
      .map((s) => s.a);

    const wanted = new Set(scored);
    const free = [];
    for (const l of this.pool) {
      if (l.userData.anchor && wanted.has(l.userData.anchor)) wanted.delete(l.userData.anchor);
      else free.push(l);
    }
    for (const a of wanted) {
      const l = free.pop();
      if (!l) break;
      l.userData.anchor = a;
      l.userData.fade = 0;
      l.position.copy(a.pos);
      l.distance = a.distance;
    }
    for (const l of free) l.userData.anchor = null;

    for (const l of this.pool) {
      const a = l.userData.anchor;
      l.userData.fade = Math.min(1, l.userData.fade + dt * 3);
      if (!a) {
        l.intensity = Math.max(0, l.intensity - dt * 20);
        continue;
      }
      l.color.set(a.color);
      if (this.alert > 0) l.color.lerp(this._red, this.alert);
      l.intensity = a.intensity * BOOST * a.level * l.userData.fade;
    }
  }
}
