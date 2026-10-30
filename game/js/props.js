// Furniture and set dressing, built from primitives and merged by material once placed.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/BufferGeometryUtils.js";
import { rr } from "./textures.js";

function makeMaterials() {
  const m = (color, rough = 0.7, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
  return {
    plasticDark: m(0x2a2c2f, 0.6),
    plasticLight: m(0xb9b5aa, 0.55),
    metal: m(0x8a9096, 0.4, 0.7),
    metalDark: m(0x33383d, 0.5, 0.6),
    chrome: m(0xc8ccd0, 0.25, 0.9),
    laminate: m(0x6e6252, 0.6),
    laminateLight: m(0x9c9384, 0.6),
    granite: m(0x2b2b2b, 0.35, 0.1),
    fabric: m(0x353d4a, 1),
    fabricBlue: m(0x2d4466, 1),
    fabricRed: m(0x5a2a2a, 1),
    fabricGreen: m(0x3a4a3a, 1),
    rubber: m(0x111111, 0.9),
    screenOff: m(0x060708, 0.15, 0.3),
    paper: m(0xe6e2d6, 0.9),
    beige: m(0xc4b99c, 0.6),
    red: m(0x8e1a1a, 0.5),
    yellow: m(0xc9a227, 0.6),
    cardboard: m(0x9a7a4f, 0.95),
    wood: m(0x6b4f33, 0.85),
    white: m(0xd9d6cf, 0.5),
    fridge: m(0xc9c7c0, 0.35, 0.2),
    plant: m(0x4a4a2a, 0.9),
    soil: m(0x2a1d14, 1),
    leather: m(0x2b211c, 0.55),
    cot: m(0x4c5a3a, 0.95),
    blanket: m(0x5b3a3a, 1),
    cable: m(0x0c0c0c, 0.6),
    copper: m(0x8a5a32, 0.4, 0.8),
  };
}

export class Kit {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.colliders = [];
    this.mats = makeMaterials();
    this.screens = new Map();
    this.dynamic = [];
  }

  group(x, y, z, ry = 0, parent = this.root) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = ry;
    parent.add(g);
    return g;
  }

  /** Box whose bottom sits at y. */
  box(parent, w, h, d, mat, x, y, z, { ry = 0, rx = 0, rz = 0 } = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mat(mat));
    mesh.position.set(x, y + h / 2, z);
    mesh.rotation.set(rx, ry, rz);
    parent.add(mesh);
    return mesh;
  }

  cyl(parent, rTop, rBot, h, mat, x, y, z, { seg = 12, rx = 0, rz = 0, ry = 0 } = {}) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), this.mat(mat));
    mesh.position.set(x, y + h / 2, z);
    mesh.rotation.set(rx, ry, rz);
    parent.add(mesh);
    return mesh;
  }

  plane(parent, w, h, mat, x, y, z, { ry = 0, rx = 0, rz = 0 } = {}) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mat(mat));
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    parent.add(mesh);
    return mesh;
  }

  sphere(parent, r, mat, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), this.mat(mat));
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  mat(m) {
    return typeof m === "string" ? this.mats[m] : m;
  }

  /** Self-lit material for screens and signs. `glow` above 1 pushes them into the bright range. */
  screen(texture, glow = 1.2) {
    if (this.screens.has(texture)) return this.screens.get(texture);
    const mat = new THREE.MeshBasicMaterial({ map: texture, color: new THREE.Color(glow, glow, glow), toneMapped: true });
    this.screens.set(texture, mat);
    return mat;
  }

  decal(texture, { transparent = true, rough = 0.9 } = {}) {
    return new THREE.MeshStandardMaterial({ map: texture, transparent, roughness: rough, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: !transparent, side: THREE.DoubleSide });
  }

  /** Blocks movement with the object's footprint. */
  solid(obj, pad = 0.02) {
    obj.updateWorldMatrix(true, true);
    const b = new THREE.Box3().setFromObject(obj);
    this.colliders.push({ x0: b.min.x - pad, z0: b.min.z - pad, x1: b.max.x + pad, z1: b.max.z + pad, y0: b.min.y, y1: b.max.y });
    return obj;
  }

  /** Merges everything placed so far into one mesh per material. */
  finalize() {
    this.root.updateMatrixWorld(true);
    const byMat = new Map();
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
      // mergeGeometries needs matching attributes
      if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
      for (const name of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(name)) g.deleteAttribute(name);
      if (!byMat.has(o.material)) byMat.set(o.material, []);
      byMat.get(o.material).push(g);
    });
    const out = new THREE.Group();
    for (const [mat, geos] of byMat) {
      const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
      const isFlat = mat.isMeshBasicMaterial || mat.transparent;
      mesh.castShadow = !isFlat;
      mesh.receiveShadow = !mat.isMeshBasicMaterial;
      out.add(mesh);
    }
    this.scene.add(out);
    return out;
  }
}

// ---------------------------------------------------------------- office

export function desk(kit, x, z, ry, { screen, laptop, mug = true, clutter = true, nameplate } = {}) {
  const g = kit.group(x, 0, z, ry);
  kit.box(g, 1.4, 0.04, 0.72, "laminate", 0, 0.7, 0);
  kit.box(g, 0.04, 0.7, 0.66, "metalDark", -0.66, 0, 0);
  kit.box(g, 0.04, 0.7, 0.66, "metalDark", 0.66, 0, 0);
  kit.box(g, 1.3, 0.35, 0.02, "metalDark", 0, 0.3, -0.33);
  if (screen !== undefined) monitor(kit, g, 0.05, 0.74, -0.18, screen);
  if (laptop) laptopProp(kit, g, -0.35, 0.74, 0.05, 0.3, laptop);
  kit.box(g, 0.45, 0.02, 0.15, "plasticDark", 0.05, 0.74, 0.12);
  kit.box(g, 0.07, 0.01, 0.1, "plasticDark", 0.4, 0.74, 0.14);
  if (mug) {
    kit.cyl(g, 0.04, 0.035, 0.1, rr(0, 1) > 0.5 ? "white" : "red", rr(-0.6, -0.4), 0.74, rr(-0.1, 0.15));
  }
  if (clutter) {
    for (let i = 0; i < 3; i++) kit.box(g, 0.21, 0.004 + i * 0.002, 0.29, "paper", rr(0.3, 0.55), 0.74 + i * 0.004, rr(-0.25, 0), { ry: rr(-0.4, 0.4) });
  }
  if (nameplate) kit.plane(g, 0.24, 0.06, kit.decal(nameplate, { transparent: false }), -0.2, 0.79, 0.3, { rx: -0.5 });
  kit.solid(g);
  return g;
}

export function monitor(kit, parent, x, y, z, texture, w = 0.58, h = 0.34) {
  kit.box(parent, 0.18, 0.02, 0.14, "plasticDark", x, y, z);
  kit.box(parent, 0.04, 0.16, 0.03, "plasticDark", x, y + 0.02, z - 0.02);
  kit.box(parent, w + 0.03, h + 0.03, 0.035, "plasticDark", x, y + 0.14, z);
  kit.plane(parent, w, h, texture ? kit.screen(texture, 1.15) : "screenOff", x, y + 0.155 + h / 2, z + 0.019);
}

function laptopProp(kit, parent, x, y, z, ry, texture) {
  const g = kit.group(x, y, z, ry, parent);
  kit.box(g, 0.33, 0.015, 0.23, "metal", 0, 0, 0);
  const lid = kit.group(0, 0.015, -0.115, 0, g);
  lid.rotation.x = -0.35;
  kit.box(lid, 0.33, 0.22, 0.008, "metal", 0, 0, 0);
  kit.plane(lid, 0.3, 0.19, texture === true ? "screenOff" : kit.screen(texture, 1.1), 0, 0.11, 0.006);
}

export function officeChair(kit, x, z, ry, { jacket, color = "fabric" } = {}) {
  const g = kit.group(x, 0, z, ry);
  for (let i = 0; i < 5; i++) kit.box(g, 0.04, 0.03, 0.3, "plasticDark", Math.sin((i / 5) * Math.PI * 2) * 0.13, 0.04, Math.cos((i / 5) * Math.PI * 2) * 0.13, { ry: (i / 5) * Math.PI * 2 });
  kit.cyl(g, 0.025, 0.025, 0.38, "chrome", 0, 0.06, 0);
  kit.box(g, 0.48, 0.08, 0.46, color, 0, 0.44, 0);
  kit.box(g, 0.44, 0.52, 0.06, color, 0, 0.56, 0.22, { rx: 0.12 });
  if (jacket) {
    kit.box(g, 0.5, 0.42, 0.1, jacket, 0, 0.62, 0.27, { rx: 0.15 });
    kit.box(g, 0.12, 0.38, 0.08, jacket, -0.28, 0.38, 0.22);
    kit.box(g, 0.12, 0.38, 0.08, jacket, 0.28, 0.38, 0.22);
  }
  kit.solid(g, -0.05);
  return g;
}

/** Four desks back to back with a divider. screens: four textures (null = off). */
export function deskPod(kit, cx, cz, screens = [], opts = []) {
  const spots = [
    [-0.72, -0.4, Math.PI],
    [0.72, -0.4, Math.PI],
    [-0.72, 0.4, 0],
    [0.72, 0.4, 0],
  ];
  spots.forEach(([dx, dz, ry], i) => {
    const o = opts[i] ?? {};
    desk(kit, cx + dx, cz + dz, ry, { screen: screens[i] ?? null, ...o });
    if (o.chair !== false) {
      const back = ry === 0 ? 1 : -1;
      officeChair(kit, cx + dx + rr(-0.15, 0.15), cz + dz + back * rr(0.55, 0.85), ry + Math.PI + rr(-0.6, 0.6), { jacket: o.jacket, color: o.chairColor });
    }
  });
  const g = kit.group(cx, 0, cz);
  kit.box(g, 2.9, 0.42, 0.04, "fabricBlue", 0, 0.72, 0);
}

export function counter(kit, x0, z0, x1, z1, { h = 0.92, uppers = true, alongX = false } = {}) {
  const g = kit.group((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const w = x1 - x0;
  const d = z1 - z0;
  kit.box(g, w, h - 0.04, d, "laminateLight", 0, 0, 0);
  kit.box(g, w + 0.02, 0.04, d + 0.02, "granite", 0, h - 0.04, 0);
  kit.box(g, alongX ? w : 0.02, 0.1, alongX ? 0.02 : d, "rubber", alongX ? 0 : (x1 > 9 ? -w / 2 : w / 2) * 0, 0, alongX ? d / 2 : 0);
  if (uppers) {
    const off = alongX ? [0, -d / 2 + 0.17] : [-w / 2 + 0.17, 0];
    kit.box(g, alongX ? w : 0.34, 0.7, alongX ? 0.34 : d, "laminateLight", off[0], 1.55, off[1]);
  }
  kit.solid(g);
  return g;
}

export function coffeeMachine(kit, x, y, z, ry, signTex) {
  const g = kit.group(x, y, z, ry);
  kit.box(g, 0.36, 0.46, 0.4, "metalDark", 0, 0, 0);
  kit.box(g, 0.36, 0.06, 0.42, "chrome", 0, 0.46, 0);
  kit.box(g, 0.2, 0.02, 0.16, "chrome", 0, 0.02, 0.16);
  kit.box(g, 0.08, 0.06, 0.05, "chrome", 0, 0.22, 0.2);
  kit.cyl(g, 0.035, 0.03, 0.08, "white", 0, 0.04, 0.17);
  const led = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.2, 0.1) });
  kit.box(g, 0.02, 0.02, 0.01, led, 0.12, 0.38, 0.205);
  if (signTex) {
    kit.plane(g, 0.3, 0.19, kit.decal(signTex, { transparent: false }), 0, 0.31, 0.205, { rz: 0.05 });
    kit.box(g, 0.08, 0.02, 0.005, "paper", -0.1, 0.39, 0.207, { rz: 0.3 });
    kit.box(g, 0.08, 0.02, 0.005, "paper", 0.1, 0.39, 0.207, { rz: -0.3 });
  }
  return g;
}

export function fridge(kit, x, z, ry, noteTex) {
  const g = kit.group(x, 0, z, ry);
  kit.box(g, 0.78, 1.86, 0.72, "fridge", 0, 0, 0);
  kit.box(g, 0.78, 0.01, 0.01, "metalDark", 0, 1.25, 0.361);
  kit.box(g, 0.03, 0.35, 0.04, "chrome", 0.3, 1.35, 0.38);
  kit.box(g, 0.03, 0.4, 0.04, "chrome", 0.3, 0.72, 0.38);
  if (noteTex) kit.plane(g, 0.21, 0.29, kit.decal(noteTex, { transparent: false }), -0.12, 0.95, 0.362, { rz: -0.04 });
  kit.solid(g);
  return g;
}

export function roundTable(kit, x, z, { chairs = 3 } = {}) {
  const g = kit.group(x, 0, z);
  kit.cyl(g, 0.5, 0.5, 0.04, "laminateLight", 0, 0.72, 0, { seg: 24 });
  kit.cyl(g, 0.04, 0.04, 0.72, "chrome", 0, 0, 0);
  kit.cyl(g, 0.25, 0.28, 0.03, "metalDark", 0, 0, 0, { seg: 16 });
  kit.solid(g, -0.1);
  for (let i = 0; i < chairs; i++) {
    const a = (i / chairs) * Math.PI * 2 + rr(-0.3, 0.3);
    stackChair(kit, x + Math.sin(a) * 0.8, z + Math.cos(a) * 0.8, a + Math.PI + rr(-0.4, 0.4));
  }
  return g;
}

export function stackChair(kit, x, z, ry, tipped = false) {
  const g = kit.group(x, 0, z, ry);
  if (tipped) {
    g.rotation.z = Math.PI / 2;
    g.position.y = 0.22;
  }
  for (const [dx, dz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) kit.cyl(g, 0.012, 0.012, 0.45, "chrome", dx, 0, dz, { seg: 6 });
  kit.box(g, 0.42, 0.04, 0.42, "plasticDark", 0, 0.45, 0);
  kit.box(g, 0.42, 0.3, 0.03, "plasticDark", 0, 0.62, 0.2);
  return g;
}

export function confTable(kit, x, z, len, wid) {
  const g = kit.group(x, 0, z);
  kit.box(g, len, 0.05, wid, "laminate", 0, 0.72, 0);
  kit.box(g, 0.5, 0.72, 0.5, "metalDark", -len / 3, 0, 0);
  kit.box(g, 0.5, 0.72, 0.5, "metalDark", len / 3, 0, 0);
  kit.solid(g);
  kit.box(g, 0.3, 0.04, 0.3, "plasticDark", 0, 0.77, 0, { ry: 0.6 });
  return g;
}

export function rack(kit, x, z, ry, ledTex) {
  const g = kit.group(x, 0, z, ry);
  kit.box(g, 0.62, 2.05, 1.0, "metalDark", 0, 0, 0);
  kit.plane(g, 0.5, 1.8, kit.screen(ledTex, 1.6), 0, 1.05, 0.505);
  for (let i = 0; i < 9; i++) kit.box(g, 0.56, 0.015, 0.01, "rubber", 0, 0.15 + i * 0.2, 0.51);
  kit.solid(g);
  return g;
}

export function printer(kit, x, z, ry, paperTex) {
  const g = kit.group(x, 0, z, ry);
  kit.box(g, 0.7, 0.62, 0.6, "metalDark", 0, 0, 0);
  kit.box(g, 0.62, 0.44, 0.55, "plasticLight", 0, 0.62, 0);
  kit.box(g, 0.5, 0.04, 0.3, "plasticDark", 0, 1.06, 0.05);
  kit.box(g, 0.2, 0.01, 0.05, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 1.6, 0.4) }), 0.18, 1.06, -0.2);
  for (let i = 0; i < 8; i++) kit.box(g, 0.21, 0.003, 0.29, paperTex ? kit.decal(paperTex, { transparent: false }) : "paper", rr(-0.03, 0.03), 0.9 + i * 0.004, 0.18, { ry: rr(-0.1, 0.1) });
  kit.solid(g);
  return g;
}

export function cot(kit, x, z, ry) {
  const g = kit.group(x, 0, z, ry);
  for (const dx of [-0.32, 0.32]) kit.box(g, 0.04, 0.04, 1.9, "metal", dx, 0.38, 0);
  for (const dz of [-0.85, 0.85]) {
    kit.box(g, 0.03, 0.4, 0.03, "metal", -0.3, 0, dz, { rz: 0.4 });
    kit.box(g, 0.03, 0.4, 0.03, "metal", 0.3, 0, dz, { rz: -0.4 });
  }
  kit.box(g, 0.66, 0.03, 1.86, "cot", 0, 0.4, 0);
  kit.box(g, 0.62, 0.08, 1.1, "blanket", 0, 0.43, 0.3, { rz: 0.03 });
  kit.box(g, 0.4, 0.1, 0.28, "white", 0, 0.43, -0.7);
  kit.solid(g);
  return g;
}

export function crate(kit, x, z, s, ry = 0, labelTex, y = 0) {
  const g = kit.group(x, y, z, ry);
  kit.box(g, s, s * 0.8, s, labelTex ? "cardboard" : "wood", 0, 0, 0);
  if (labelTex) kit.plane(g, s * 0.9, s * 0.7, kit.decal(labelTex, { transparent: false }), 0, s * 0.4, s / 2 + 0.002);
  else for (let i = 0; i < 3; i++) kit.box(g, s + 0.01, 0.04, s + 0.01, "laminate", 0, 0.1 + i * s * 0.28, 0);
  kit.solid(g);
  return g;
}

export function pallet(kit, x, z, ry) {
  const g = kit.group(x, 0, z, ry);
  for (const dz of [-0.45, 0, 0.45]) kit.box(g, 1.2, 0.1, 0.1, "wood", 0, 0, dz);
  for (let i = 0; i < 7; i++) kit.box(g, 0.12, 0.03, 1.0, "wood", -0.54 + i * 0.18, 0.1, 0);
  kit.solid(g);
  return g;
}

export function couch(kit, x, z, ry) {
  const g = kit.group(x, 0, z, ry);
  kit.box(g, 1.9, 0.42, 0.8, "leather", 0, 0, 0);
  kit.box(g, 1.9, 0.45, 0.2, "leather", 0, 0.4, -0.3);
  kit.box(g, 0.2, 0.25, 0.8, "leather", -0.85, 0.4, 0);
  kit.box(g, 0.2, 0.25, 0.8, "leather", 0.85, 0.4, 0);
  kit.solid(g);
  return g;
}

export function plant(kit, x, z, dead = true) {
  const g = kit.group(x, 0, z);
  kit.cyl(g, 0.2, 0.16, 0.42, "plasticDark", 0, 0, 0);
  kit.cyl(g, 0.18, 0.18, 0.02, "soil", 0, 0.4, 0);
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.6, 5), kit.mats.plant);
    leaf.position.set(rr(-0.08, 0.08), 0.6, rr(-0.08, 0.08));
    leaf.rotation.set(rr(-1, 1) * (dead ? 1.2 : 0.4), rr(0, 6), rr(-1, 1) * (dead ? 1.2 : 0.4));
    g.add(leaf);
  }
  kit.solid(g);
  return g;
}

export function waterCooler(kit, x, z, ry) {
  const g = kit.group(x, 0, z, ry);
  kit.box(g, 0.32, 1.0, 0.32, "white", 0, 0, 0);
  kit.cyl(g, 0.14, 0.14, 0.42, new THREE.MeshPhysicalMaterial({ color: 0x8fb4d8, transparent: true, opacity: 0.45, roughness: 0.1 }), 0, 1.0, 0);
  kit.solid(g);
  return g;
}

export function lockers(kit, x, z, ry, n = 4) {
  const g = kit.group(x, 0, z, ry);
  for (let i = 0; i < n; i++) {
    kit.box(g, 0.48, 1.9, 0.45, "metalDark", (i - (n - 1) / 2) * 0.5, 0, 0);
    for (let k = 0; k < 4; k++) kit.box(g, 0.3, 0.015, 0.01, "rubber", (i - (n - 1) / 2) * 0.5, 1.5 + k * 0.05, 0.23);
  }
  kit.solid(g);
  return g;
}

export function bench(kit, x, z, ry, len = 1.6) {
  const g = kit.group(x, 0, z, ry);
  kit.box(g, len, 0.05, 0.38, "wood", 0, 0.42, 0);
  kit.box(g, 0.05, 0.42, 0.3, "metal", -len / 2 + 0.1, 0, 0);
  kit.box(g, 0.05, 0.42, 0.3, "metal", len / 2 - 0.1, 0, 0);
  kit.solid(g);
  return g;
}

export function extinguisher(kit, x, y, z, tipped = false) {
  const g = kit.group(x, y, z);
  if (tipped) {
    g.rotation.z = Math.PI / 2;
    g.position.y = y + 0.08;
  }
  kit.cyl(g, 0.08, 0.08, 0.5, "red", 0, 0, 0);
  kit.cyl(g, 0.03, 0.04, 0.08, "metalDark", 0, 0.5, 0);
  kit.box(g, 0.14, 0.02, 0.03, "metalDark", 0.03, 0.58, 0);
  return g;
}

export function balloon(kit, x, y, z, color = 0xd23b3b, deflated = false) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.1 });
  const g = kit.group(x, y, z);
  const b = new THREE.Mesh(new THREE.SphereGeometry(deflated ? 0.12 : 0.18, 12, 10), mat);
  b.scale.set(1, deflated ? 0.4 : 1.2, 1);
  b.position.y = deflated ? 0.05 : 0;
  g.add(b);
  if (!deflated) kit.box(g, 0.004, 0.9, 0.004, "paper", 0, -1.05, 0);
  return g;
}

export function fixture(kit, x, y, z, w = 1.2, d = 0.3) {
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.0) });
  const g = kit.group(x, y, z);
  kit.box(g, w + 0.06, 0.05, d + 0.06, "metalDark", 0, -0.04, 0);
  kit.box(g, w, 0.01, d, mat, 0, -0.05, 0);
  return mat;
}

export function pipe(kit, x0, y0, z0, x1, y1, z1, r = 0.06, mat = "metalDark") {
  const a = new THREE.Vector3(x0, y0, z0);
  const b = new THREE.Vector3(x1, y1, z1);
  const len = a.distanceTo(b);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), kit.mat(mat));
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  kit.root.add(mesh);
  return mesh;
}

/** Thin cable lying on the floor through a list of [x, z] points. */
export function floorCable(kit, y, points, r = 0.025) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, y + r, z)));
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, points.length * 8, r, 6), kit.mats.cable);
  kit.root.add(mesh);
}

/** Wall-mounted flat thing (sign, poster, graffiti, screen). Faces along the given normal. */
export function wallPlane(kit, mat, x, y, z, normal, w, h, offset = 0.02) {
  const ry = { n: Math.PI, s: 0, e: Math.PI / 2, w: -Math.PI / 2 }[normal];
  const d = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[normal];
  return kit.plane(kit.root, w, h, mat, x + d[0] * offset, y, z + d[1] * offset, { ry });
}

export function paperOnFloor(kit, x, y, z, tex) {
  kit.plane(kit.root, 0.21, 0.29, tex ? kit.decal(tex, { transparent: false }) : "paper", x, y + 0.004, z, { rx: -Math.PI / 2, rz: rr(0, 6.28) });
}

export function towerPC(kit, x, y, z, ry) {
  const g = kit.group(x, y, z, ry);
  kit.box(g, 0.2, 0.44, 0.45, "beige", 0, 0, 0);
  kit.box(g, 0.16, 0.04, 0.005, "plasticDark", 0, 0.34, 0.226);
  kit.box(g, 0.16, 0.04, 0.005, "plasticDark", 0, 0.28, 0.226);
  const led = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 3, 0.5) });
  kit.box(g, 0.015, 0.015, 0.005, led, 0.06, 0.08, 0.228);
  kit.box(g, 0.015, 0.015, 0.005, new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.5, 0.2) }), 0.03, 0.08, 0.228);
  kit.solid(g);
  return g;
}

export function crt(kit, x, y, z, ry, texture) {
  const g = kit.group(x, y, z, ry);
  kit.box(g, 0.42, 0.36, 0.4, "beige", 0, 0.04, -0.02);
  kit.box(g, 0.3, 0.28, 0.12, "beige", 0, 0.08, -0.26);
  kit.box(g, 0.2, 0.04, 0.2, "beige", 0, 0, -0.05);
  kit.plane(g, 0.34, 0.26, kit.screen(texture, 1.5), 0, 0.22, 0.181);
  return g;
}

export function oldKeyboard(kit, x, y, z, ry) {
  const g = kit.group(x, y, z, ry);
  kit.box(g, 0.46, 0.03, 0.17, "beige", 0, 0, 0, { rx: -0.05 });
}
