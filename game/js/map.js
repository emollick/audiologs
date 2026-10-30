// The station's floor plan. One character per 1m x 1m cell.
//   #  solid          D  sliding door    =  glass wall    F  chain-link fence    P  propped-open door
//   a airlock  h corridor  r reception  g galley  c conference  b bullpen  s ops room
//   l loading corridor  d loading dock  t stairs down  x landing  k Cage B
export const MAP = [
  "################################################",
  "############bbbbbbbbbbbbbbbbbbbb################",
  "############bbbbbbbbbbbbbbbbbbbb#ssssssssss#####",
  "############bbbbbbbbbbbbbbbbbbbb#ssssssssss#####",
  "############bbbbbbbbbbbbbbbbbbbb#ssssssssss#####",
  "############bbbbbbbbbbbbbbbbbbbb#ssssssssss#####",
  "############bbbbbbbbbbbbbbbbbbbbDssssssssss#####",
  "############bbbbbbbbbbbbbbbbbbbbDssssssssss#####",
  "############bbbbbbbbbbbbbbbbbbbb#ssssssssss#####",
  "############bbbbbbbbbbbbbbbbbbbb#ssssssssss#####",
  "############bbbbbbbbbbbbbbbbbbbb#ssssssssss#####",
  "############bbbbbbbbbbbbbbbbbbbb#ssssssssss#####",
  "###################DD###################DD######",
  "##################hhhh##################ll######",
  "########ggggggggg#hhhh=ccccccccc########ll######",
  "########ggggggggg#hhhhDccccccccc########ll######",
  "########ggggggggg#hhhhDccccccccc########ll######",
  "########gggggggggDhhhh=ccccccccc########ll######",
  "########gggggggggDhhhh=ccccccccc########ll######",
  "########ggggggggg#hhhh=ccccccccc########ll######",
  "########ggggggggg#hhhh=ccccccccc########ll######",
  "########ggggggggg#hhhh=ccccccccc########ll######",
  "##################hhhh##################ll######",
  "###################DD###################ll######",
  "#############rrrrrrrrrrrrrr#######dddddddddddd##",
  "#############rrrrrrrrrrrrrr#######dddddddddddd##",
  "##aaaaaa#####rrrrrrrrrrrrrr#######dddddddddddd##",
  "##aaaaaaDhhhhrrrrrrrrrrrrrr#######dddddddddddd##",
  "##aaaaaaDhhhhrrrrrrrrrrrrrr#######dddddddddddd##",
  "##aaaaaa#####rrrrrrrrrrrrrr#######dddddddddddd##",
  "##aaaaaa#####rrrrrrrrrrrrrr############PP#######",
  "#############rrrrrrrrrrrrrr############tt#######",
  "#######################################tt#######",
  "#######################################tt#######",
  "#######################################tt#######",
  "#######################################tt#######",
  "#######################################tt#######",
  "#######################################tt#######",
  "#######################################tt#######",
  "#######################################tt#######",
  "#######################################tt#######",
  "#####################################xxxxxx#####",
  "#####################################xxxxxx#####",
  "#################################kkkkkkkkkkkkkk#",
  "#################################kkkkkkkkkkkkkk#",
  "#################################kkkkkkkkkkkkkk#",
  "#################################kFFFFFkkFFFFFk#",
  "#################################kkkkkkkkkkkkkk#",
  "#################################kkkkkkkkkkkkkk#",
  "#################################kkkkkkkkkkkkkk#",
  "#################################kkkkkkkkkkkkkk#",
  "################################################",
];

export const W = MAP[0].length;
export const H = MAP.length;

/** Per-area surfaces and heights. `room` is the id the story and the station manifest use. */
export const AREAS = {
  a: { room: "airlock", floor: "hazard", wall: "metal", ceil: "metalCeil", height: 3.0 },
  h: { room: "corridor", floor: "metal", wall: "office", ceil: "tiles", height: 3.0 },
  r: { room: "reception", floor: "carpet", wall: "office", ceil: "tiles", height: 3.2 },
  g: { room: "galley", floor: "tile", wall: "office", ceil: "tiles", height: 3.0 },
  c: { room: "conference", floor: "carpet", wall: "office", ceil: "tiles", height: 3.0 },
  b: { room: "bullpen", floor: "carpet", wall: "office", ceil: "tiles", height: 3.3 },
  s: { room: "server_room", floor: "grating", wall: "metal", ceil: "metalCeil", height: 3.3 },
  l: { room: "dock", floor: "concrete", wall: "metalDark", ceil: "metalCeil", height: 3.4 },
  d: { room: "dock", floor: "concrete", wall: "metalDark", ceil: "metalCeil", height: 4.6 },
  t: { room: "stairwell", floor: "grating", wall: "concrete", ceil: "concreteCeil", height: 3.4 },
  x: { room: "cage_b", floor: "concrete", wall: "concrete", ceil: "concreteCeil", height: 3.0, base: -4 },
  k: { room: "cage_b", floor: "concrete", wall: "concrete", ceil: "concreteCeil", height: 3.0, base: -4 },
};

export const DOOR_HEIGHT = 2.6;
const STAIR_TOP = 30; // z of the propped door; stairs drop 0.4m per cell after it

export const at = (x, z) => (x < 0 || z < 0 || x >= W || z >= H ? "#" : MAP[z][x]);
export const isInterior = (ch) => ch !== "#";
export const blocksMovement = (ch) => ch === "#" || ch === "=" || ch === "F";

/** The area a cell belongs to. Doors, glass and fences borrow from a neighbour. */
export function areaOf(x, z) {
  const ch = at(x, z);
  if (AREAS[ch]) return { ch, ...AREAS[ch] };
  if (ch === "#") return null;
  // pick the neighbour whose floor is closest to ours; prefer the side with the larger room
  const order = ch === "F" ? ["k"] : null;
  for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const n = at(x + dx, z + dz);
    if (AREAS[n] && (!order || order.includes(n))) return { ch: n, ...AREAS[n] };
  }
  return { ch: "h", ...AREAS.h };
}

export function floorAt(x, z) {
  const ch = at(x, z);
  if (ch === "t") return -0.4 * (z - STAIR_TOP);
  const a = areaOf(x, z);
  return a?.base ?? 0;
}

export function ceilAt(x, z) {
  const ch = at(x, z);
  if (ch === "D" || ch === "P") return floorAt(x, z) + DOOR_HEIGHT;
  const a = areaOf(x, z);
  if (!a) return 0;
  return floorAt(x, z) + a.height;
}

export function roomAt(wx, wz) {
  const a = areaOf(Math.floor(wx), Math.floor(wz));
  return a?.room ?? null;
}

/** Smooth floor height for walking: interpolates across stairs so steps feel like steps, not cliffs. */
export function walkHeight(wx, wz) {
  const cx = Math.floor(wx);
  const cz = Math.floor(wz);
  const ch = at(cx, cz);
  if (ch === "t" || at(cx, cz - 1) === "t" || at(cx, cz + 1) === "t") {
    const fz = wz - STAIR_TOP - 0.5;
    if (fz > 0 && fz < 10) return -0.4 * fz;
  }
  return floorAt(cx, cz);
}

export const SPAWN = { x: 3.6, z: 28.5, yaw: -Math.PI / 2 };
