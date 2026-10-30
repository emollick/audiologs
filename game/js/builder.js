// Turns the ASCII floor plan into merged floor, wall and ceiling meshes, plus sliding doors, glass and fences.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/BufferGeometryUtils.js";
import { MAP, W, H, at, isInterior, areaOf, floorAt, ceilAt, DOOR_HEIGHT } from "./map.js";
import * as T from "./textures.js";

export function makeSurfaceMaterials() {
  const std = (tx, { rough = 0.85, metal = 0.05, bump = 0.02, color = 0xffffff } = {}) =>
    new THREE.MeshStandardMaterial({ map: tx.map, bumpMap: tx.bump, bumpScale: bump, roughness: rough, metalness: metal, color, vertexColors: true });
  const metal = T.wallMetal();
  return {
    metal: std(T.floorMetal(), { rough: 0.6, metal: 0.4, bump: 0.6 }),
    hazard: std(T.floorHazard(), { rough: 0.6, metal: 0.4, bump: 0.6 }),
    carpet: std(T.floorCarpet(), { rough: 1, bump: 0.3 }),
    tile: std(T.floorTile(), { rough: 0.45, bump: 0.4 }),
    grating: std(T.floorGrating(), { rough: 0.5, metal: 0.6, bump: 1.2 }),
    concrete: std(T.floorConcrete(), { rough: 0.95, bump: 0.5 }),
    office: std(T.wallOffice(), { rough: 0.9, bump: 0.2 }),
    wallMetal: std(metal, { rough: 0.55, metal: 0.45, bump: 0.8 }),
    metalDark: std(T.wallMetal("#3a3f44"), { rough: 0.6, metal: 0.4, bump: 0.8, color: 0xbbbbbb }),
    wallConcrete: std(T.wallConcrete(), { rough: 0.95, bump: 0.6 }),
    tiles: std(T.ceilTiles(), { rough: 0.95, bump: 0.3 }),
    metalCeil: std(T.ceilMetal(), { rough: 0.6, metal: 0.4, bump: 0.8, color: 0x999999 }),
    concreteCeil: std(T.wallConcrete(), { rough: 0.95, bump: 0.5, color: 0x777777 }),
    frame: new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.5, metalness: 0.6, vertexColors: true }),
  };
}

const WALL_KEY = { office: "office", metal: "wallMetal", metalDark: "metalDark", concrete: "wallConcrete" };

class QuadBatch {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = [];
    this.idx = [];
  }
  quad(p, n, uv, ao) {
    const base = this.pos.length / 3;
    for (let i = 0; i < 4; i++) {
      this.pos.push(...p[i]);
      this.nor.push(...n);
      this.uv.push(...uv[i]);
      const a = ao[i];
      this.col.push(a, a, a);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    return g;
  }
}

const solid = (x, z) => !isInterior(at(x, z));

/** Corner ambient occlusion: darker where walls meet the floor. */
function cornerAO(x, z) {
  let n = 0;
  for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) if (solid(x + dx, z + dz)) n++;
  return 1 - n * 0.2;
}

export function buildShell(mats) {
  const batches = {};
  const batch = (k) => (batches[k] ??= new QuadBatch());
  const wallH = 3; // wall texture covers 3m vertically

  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      const ch = at(x, z);
      if (!isInterior(ch)) continue;
      const area = areaOf(x, z);
      const isDoorish = ch === "D" || ch === "P";
      const f = floorAt(x, z);
      const c = ceilAt(x, z);
      const floorKey = area.floor;
      const wallKey = isDoorish ? "frame" : WALL_KEY[area.wall];
      const ceilKey = isDoorish ? "frame" : area.ceil;

      // floor
      batch(floorKey).quad(
        [[x, f, z], [x, f, z + 1], [x + 1, f, z + 1], [x + 1, f, z]],
        [0, 1, 0],
        [[x / 2, z / 2], [x / 2, (z + 1) / 2], [(x + 1) / 2, (z + 1) / 2], [(x + 1) / 2, z / 2]],
        [cornerAO(x, z), cornerAO(x, z + 1), cornerAO(x + 1, z + 1), cornerAO(x + 1, z)],
      );
      // ceiling
      const cAO = 0.75;
      batch(ceilKey).quad(
        [[x, c, z], [x + 1, c, z], [x + 1, c, z + 1], [x, c, z + 1]],
        [0, -1, 0],
        [[x / 2, z / 2], [(x + 1) / 2, z / 2], [(x + 1) / 2, (z + 1) / 2], [x / 2, (z + 1) / 2]],
        [cAO, cAO, cAO, cAO],
      );

      // edges: [dx, dz, edge start, edge end, normal]
      const edges = [
        [0, -1, [x + 1, z], [x, z], [0, 0, 1]],
        [0, 1, [x, z + 1], [x + 1, z + 1], [0, 0, -1]],
        [-1, 0, [x, z], [x, z + 1], [1, 0, 0]],
        [1, 0, [x + 1, z + 1], [x + 1, z], [-1, 0, 0]],
      ];
      for (const [dx, dz, a, b, n] of edges) {
        const nx = x + dx;
        const nz = z + dz;
        const along = (p) => (dx === 0 ? p[0] : p[1]) / 2;
        const face = (key, y0, y1, ao0 = 0.55, ao1 = 0.9) => {
          batch(key).quad(
            [[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]],
            n,
            [[along(a), (y0 - f) / wallH], [along(b), (y0 - f) / wallH], [along(b), (y1 - f) / wallH], [along(a), (y1 - f) / wallH]],
            [ao0, ao0, ao1, ao1],
          );
        };
        if (solid(nx, nz)) {
          face(wallKey, f, c);
          continue;
        }
        const nf = floorAt(nx, nz);
        const nc = ceilAt(nx, nz);
        if (nf > f + 0.01) face(at(x, z) === "t" || at(nx, nz) === "t" ? "metalDark" : wallKey, f, nf, 0.5, 0.7);
        if (nc < c - 0.01) face(isDoorish || at(nx, nz) === "D" || at(nx, nz) === "P" ? "frame" : wallKey, nc, c, 0.8, 0.9);
      }
    }
  }

  const group = new THREE.Group();
  for (const [key, b] of Object.entries(batches)) {
    const mesh = new THREE.Mesh(b.geometry(), mats[key]);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.name = `shell:${key}`;
    group.add(mesh);
  }
  return group;
}

/** Finds runs of door cells and builds sliding doors that open as the player approaches. */
export function buildDoors(scene, sfx) {
  const seen = new Set();
  const doors = [];
  const leafTex = doorTexture();
  const leafMat = new THREE.MeshStandardMaterial({ map: leafTex, roughness: 0.5, metalness: 0.6, color: 0xaaaaaa });
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x3a7a5a, emissiveIntensity: 0.8 });
  for (let z = 0; z < H; z++)
    for (let x = 0; x < W; x++) {
      if (at(x, z) !== "D" || seen.has(`${x},${z}`)) continue;
      const cells = [[x, z]];
      seen.add(`${x},${z}`);
      const horizontal = at(x + 1, z) === "D";
      let k = 1;
      while (at(x + (horizontal ? k : 0), z + (horizontal ? 0 : k)) === "D") {
        cells.push([x + (horizontal ? k : 0), z + (horizontal ? 0 : k)]);
        seen.add(`${cells.at(-1)[0]},${cells.at(-1)[1]}`);
        k++;
      }
      const len = cells.length;
      const f = floorAt(x, z);
      const cx = horizontal ? x + len / 2 : x + 0.5;
      const cz = horizontal ? z + 0.5 : z + len / 2;
      const group = new THREE.Group();
      group.position.set(cx, f, cz);
      if (!horizontal) group.rotation.y = Math.PI / 2;
      const leaves = [];
      for (const side of [-1, 1]) {
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(len / 2, DOOR_HEIGHT, 0.14), leafMat);
        leaf.position.set((side * len) / 4, DOOR_HEIGHT / 2, 0);
        leaf.castShadow = leaf.receiveShadow = true;
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.04, DOOR_HEIGHT * 0.7, 0.16), stripeMat);
        strip.position.set((-side * len) / 4 + side * 0.06, 0, 0);
        leaf.add(strip);
        group.add(leaf);
        leaves.push({ mesh: leaf, side, closedX: (side * len) / 4 });
      }
      scene.add(group);
      doors.push({
        cells,
        center: new THREE.Vector3(cx, f + 1.2, cz),
        group,
        leaves,
        len,
        open: 0,
        target: 0,
        locked: false,
        wasOpen: false,
      });
    }
  return {
    doors,
    update(dt, playerPos) {
      for (const d of doors) {
        const dist = Math.hypot(playerPos.x - d.center.x, playerPos.z - d.center.z);
        d.target = !d.locked && dist < 2.6 ? 1 : 0;
        const speed = d.target > d.open ? 2.6 : 1.6;
        d.open += Math.sign(d.target - d.open) * Math.min(Math.abs(d.target - d.open), dt * speed);
        const e = d.open * d.open * (3 - 2 * d.open);
        for (const l of d.leaves) l.mesh.position.x = l.closedX + l.side * e * (d.len / 2 - 0.08);
        if (d.target === 1 && !d.wasOpen) sfx?.("door_open", d.center);
        d.wasOpen = d.target === 1;
      }
    },
    /** True if the cell is a door that is currently closed enough to block movement. */
    blocks(cx, cz) {
      for (const d of doors) if (d.open < 0.75 && d.cells.some(([x, z]) => x === cx && z === cz)) return true;
      return false;
    },
  };
}

function doorTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const x = c.getContext("2d");
  x.fillStyle = "#5a6168";
  x.fillRect(0, 0, 256, 256);
  x.fillStyle = "#3a4046";
  x.fillRect(16, 16, 224, 224);
  x.fillStyle = "#6b737b";
  x.fillRect(24, 24, 208, 208);
  for (let i = 0; i < 8; i++) {
    x.fillStyle = i % 2 ? "#c9a227" : "#151515";
    x.fillRect(24 + i * 26, 200, 26, 24);
  }
  x.fillStyle = "rgba(0,0,0,0.3)";
  for (let i = 0; i < 400; i++) x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Glass partitions and chain-link fences live in "=" and "F" cells. */
export function buildPanes(scene) {
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x9fb8c8, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
  const frame = new THREE.MeshStandardMaterial({ color: 0x23272b, roughness: 0.5, metalness: 0.6 });
  const link = new THREE.MeshStandardMaterial({ map: chainLink(), alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.7, roughness: 0.5, color: 0x999999 });
  const geos = { glass: [], frame: [], link: [] };
  const add = (key, geo, x, y, z, ry = 0) => {
    geo.rotateY(ry);
    geo.translate(x, y, z);
    geos[key].push(geo);
  };
  for (let z = 0; z < H; z++)
    for (let x = 0; x < W; x++) {
      const ch = at(x, z);
      if (ch !== "=" && ch !== "F") continue;
      const f = floorAt(x, z);
      const c = ceilAt(x, z);
      const vertical = at(x, z - 1) === ch || at(x, z + 1) === ch || at(x, z - 1) === "D" || at(x, z + 1) === "D";
      const ry = vertical ? Math.PI / 2 : 0;
      if (ch === "=") {
        add("glass", new THREE.PlaneGeometry(1, c - f - 0.1), x + 0.5, f + (c - f) / 2, z + 0.5, ry);
        add("frame", new THREE.BoxGeometry(1, 0.08, 0.12), x + 0.5, f + 0.04, z + 0.5, ry);
        add("frame", new THREE.BoxGeometry(1, 0.08, 0.12), x + 0.5, c - 0.04, z + 0.5, ry);
        add("frame", new THREE.BoxGeometry(1, 0.04, 0.06), x + 0.5, f + 1.05, z + 0.5, ry);
        add("frame", new THREE.BoxGeometry(0.06, c - f, 0.1), x + (vertical ? 0.5 : 0), f + (c - f) / 2, z + (vertical ? 0 : 0.5), 0);
      } else {
        const h = 2.4;
        add("link", new THREE.PlaneGeometry(1, h), x + 0.5, f + h / 2, z + 0.5, ry);
        add("frame", new THREE.CylinderGeometry(0.03, 0.03, h, 6), x, f + h / 2, z + 0.5);
        add("frame", new THREE.BoxGeometry(1, 0.04, 0.04), x + 0.5, f + h, z + 0.5, ry);
      }
    }
  for (const [key, list] of Object.entries(geos)) {
    if (!list.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(list), { glass, frame, link }[key]);
    mesh.castShadow = key !== "glass";
    mesh.receiveShadow = true;
    if (key === "glass") mesh.renderOrder = 2;
    scene.add(mesh);
  }
}

function chainLink() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d");
  x.strokeStyle = "#b5b8ba";
  x.lineWidth = 3;
  for (let i = -128; i < 256; i += 16) {
    x.beginPath();
    x.moveTo(i, 0);
    x.lineTo(i + 128, 128);
    x.moveTo(i + 128, 0);
    x.lineTo(i, 128);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 7);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
