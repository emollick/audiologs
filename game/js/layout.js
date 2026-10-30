// Set dressing for every room, plus the spots the story uses: log slots, terminals, lights and sound emitters.
import * as THREE from "three";
import * as T from "./textures.js";
import * as P from "./props.js";

const rr = T.rr;

/**
 * Builds all props. Returns:
 *  slots:     { room: [Vector3...] } places a recorder can sit, in the order logs fill them
 *  terminals: { room: {pos, normal} } where text-only tickets are shown
 *  lights:    light anchors for the light pool
 *  emitters:  positional sound loops
 *  animated:  things with update(dt)
 *  marks:     named points the story uses (knock spot, shadow figure, the server)
 */
export function dressStation(kit, station) {
  const m = kit.mats;
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const animated = [];
  const lights = [];
  const emitters = [];
  const slots = {};
  const terminals = {};
  const marks = {};
  const slot = (room, x, y, z) => (slots[room] ??= []).push(v(x, y, z));
  const light = (x, y, z, o = {}) => lights.push({ pos: v(x, y, z), color: o.color ?? 0xdfe8ff, intensity: o.intensity ?? 5, distance: o.distance ?? 9, mode: o.mode ?? "steady", room: o.room, fixture: o.fixture ?? null, seed: rr(0, 100) });
  const ceilLight = (x, y, z, o = {}) => light(x, y - 0.12, z, { ...o, fixture: P.fixture(kit, x, y, z, o.w ?? 1.2, o.d ?? 0.3) });
  const anim = (a) => (animated.push(a), a.texture);

  const tickets = station.tickets ?? [];
  const termFor = (room) => station.terminals?.find((t) => t.room === room);
  const termScreen = (room) => (termFor(room) ? T.screenTerminal(termFor(room).info) : null);
  const roomName = (id, fallback) => station.rooms?.find((r) => r.id === id)?.display_name ?? fallback;
  const signTex = (id, fallback, sub) => T.sign(roomName(id, fallback), sub);

  // ---------------------------------------------------------------- airlock
  P.lockers(kit, 4.5, 26.25, 0, 4);
  P.bench(kit, 4.6, 30.62, 0, 2.2);
  const hatch = kit.group(2.06, 0, 28.5, Math.PI / 2);
  kit.box(hatch, 2.1, 2.7, 0.12, "metalDark", 0, 0, 0);
  kit.box(hatch, 1.9, 0.1, 0.16, "yellow", 0, 0.05, 0);
  const port = new THREE.Mesh(new THREE.CircleGeometry(0.32, 24), kit.screen(T.starfield(), 1.0));
  port.position.set(0, 1.65, 0.07);
  hatch.add(port);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.05, 8, 24), m.chrome);
  ring.position.set(0, 1.65, 0.08);
  hatch.add(ring);
  P.wallPlane(kit, kit.screen(T.sign("TO DECK 3", "INNER DOOR"), 0.9), 7.99, 2.8, 28, "w", 1.4, 0.35);
  P.wallPlane(kit, kit.screen(T.sign("DOCKING AIRLOCK 3", "CYCLE COMPLETE"), 0.9), 4.6, 2.2, 26.02, "s", 2.0, 0.5);
  ceilLight(5, 3.0, 28.5, { mode: "flicker", intensity: 4, room: "airlock" });
  light(7.6, 2.7, 26.4, { color: 0xff2a1a, intensity: 3, distance: 6, mode: "spin", room: "airlock" });
  marks.paSpeaker = v(7.8, 2.6, 27.2);

  // ---------------------------------------------------------------- west corridor
  P.wallPlane(kit, kit.decal(T.poster("halcyon"), { transparent: false }), 11, 1.6, 27.0, "s", 0.7, 1.0);
  ceilLight(11, 3.0, 28, { intensity: 3.5, mode: "flicker", room: "corridor" });

  // ---------------------------------------------------------------- reception
  P.counter(kit, 17.5, 27.9, 22.5, 28.6, { h: 1.05, uppers: false, alongX: true });
  const cctv = anim(T.screenCCTV());
  const deskG = kit.group(20.4, 1.05, 28.3, 0);
  P.monitor(kit, deskG, 0, 0, 0, cctv, 0.5, 0.32);
  const deskG2 = kit.group(19.2, 1.05, 28.35, Math.PI);
  P.monitor(kit, deskG2, 0, 0, 0, cctv, 0.5, 0.32);
  kit.box(kit.root, 0.3, 0.03, 0.22, "fabricRed", 21.6, 1.05, 28.2, { ry: 0.2 });
  P.officeChair(kit, 20.4, 29.3, Math.PI + 0.3);
  slot("reception", 18.3, 1.06, 28.2);
  P.wallPlane(kit, kit.screen(T.logoSign(), 1.3), 20, 1.9, 32, "n", 4.4, 1.1);
  light(20, 2.3, 31.1, { color: 0x4bd4a8, intensity: 2.5, distance: 6, room: "reception" });
  P.couch(kit, 15.4, 24.62, 0);
  kit.box(kit.root, 1.0, 0.4, 0.55, "laminate", 15.4, 0, 25.75);
  for (let i = 0; i < 3; i++) kit.box(kit.root, 0.22, 0.01, 0.3, "paper", 15.1 + i * 0.25, 0.4 + i * 0.01, 25.7, { ry: i * 0.5 });
  P.plant(kit, 13.6, 24.6);
  P.plant(kit, 26.4, 31.4);
  P.wallPlane(kit, kit.decal(T.poster("training"), { transparent: false }), 27, 1.6, 25.6, "w", 0.75, 1.05);
  P.wallPlane(kit, kit.decal(T.poster("lunch"), { transparent: false }), 27, 1.5, 26.7, "w", 0.6, 0.85);
  kit.solid(kit.box(kit.root, 0.5, 0.72, 0.5, "laminate", 26.4, 0, 27.9));
  slot("reception", 26.4, 0.73, 27.9);
  P.desk(kit, 24.6, 31.45, Math.PI, { screen: termScreen("reception"), mug: false });
  terminals.reception = { pos: v(24.55, 1.08, 31.6), screen: { x: 24.55, y: 1.07, z: 31.63, ry: Math.PI } };
  P.wallPlane(kit, kit.screen(T.sign("GALLEY / ALIGNMENT / ENGINEERING"), 0.9), 20, 2.9, 24.0, "s", 1.9, 0.36);
  ceilLight(16.5, 3.2, 26.5, { mode: "flicker", room: "reception" });
  ceilLight(23.5, 3.2, 26.5, { room: "reception", intensity: 4 });
  ceilLight(20, 3.2, 30.4, { mode: "dying", room: "reception" });

  // ---------------------------------------------------------------- north corridor
  P.waterCooler(kit, 18.3, 13.7, Math.PI / 2);
  P.wallPlane(kit, kit.decal(T.graffiti(station.graffiti?.[2] ?? "IT'S JUST A SERVER")), 18, 1.7, 21.0, "e", 2.6, 0.65);
  P.wallPlane(kit, kit.screen(signTex("galley", "GALLEY"), 0.9), 18, 2.8, 18, "e", 1.5, 0.36);
  P.wallPlane(kit, kit.screen(signTex("conference", "ALIGNMENT ROOM"), 0.9), 22, 2.8, 16, "w", 1.5, 0.36);
  P.wallPlane(kit, kit.screen(signTex("bullpen", "PLATFORM ENGINEERING"), 0.9), 20, 2.8, 13.0, "s", 1.9, 0.36);
  P.wallPlane(kit, kit.screen(T.sign("RECEPTION / AIRLOCK"), 0.9), 20, 2.8, 23.0, "n", 1.6, 0.36);
  ceilLight(20, 3.0, 15.5, { mode: "flicker", room: "corridor" });
  ceilLight(20, 3.0, 20.5, { mode: "dying", room: "corridor" });

  // ---------------------------------------------------------------- galley
  P.counter(kit, 8.0, 14.95, 8.68, 21.4, { h: 0.92 });
  P.coffeeMachine(kit, 8.36, 0.92, 19.2, Math.PI / 2, T.outOfOrder());
  kit.box(kit.root, 0.5, 0.05, 0.62, "chrome", 8.36, 0.88, 17.0);
  kit.cyl(kit.root, 0.015, 0.015, 0.3, "chrome", 8.15, 0.92, 17.0);
  kit.box(kit.root, 0.38, 0.3, 0.5, "plasticDark", 8.32, 0.92, 20.65);
  kit.box(kit.root, 0.01, 0.18, 0.3, new THREE.MeshBasicMaterial({ color: 0x050a05 }), 8.52, 0.98, 20.6);
  P.fridge(kit, 9.55, 14.42, 0, T.poster("cleanout"));
  P.roundTable(kit, 12.4, 16.8, { chairs: 3 });
  P.roundTable(kit, 13.4, 20.0, { chairs: 2 });
  P.stackChair(kit, 14.6, 20.6, 1.2, true);
  kit.cyl(kit.root, 0.04, 0.045, 0.3, new THREE.MeshStandardMaterial({ color: 0x0f2a12, roughness: 0.2, metalness: 0.3 }), 12.15, 0.74, 16.5);
  kit.cyl(kit.root, 0.012, 0.04, 0.06, new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.8, roughness: 0.3 }), 12.15, 1.04, 16.5);
  for (const [bx, bz, col] of [[14.7, 15.1, 0x2a62c9], [15.9, 14.8, 0xd23b3b], [16.3, 16.0, 0xc9a227]]) P.balloon(kit, bx, 0, bz, col, true);
  const bannerMesh = P.wallPlane(kit, kit.decal(T.banner(), { transparent: false }), 13.2, 2.35, 14.0, "s", 4.2, 0.52);
  bannerMesh.rotation.z = -0.05;
  slot("galley", 8.42, 0.93, 18.5);
  slot("galley", 12.7, 0.765, 17.05);
  const epic = kit.group(12.5, 1.25, 21.94, Math.PI);
  kit.box(epic, 1.28, 0.78, 0.05, "plasticDark", 0, 0, 0);
  kit.plane(epic, 1.2, 0.7, kit.screen(termScreen("galley") ?? T.screenEpic(), 1.1), 0, 0.39, -0.03, { ry: Math.PI });
  terminals.galley = { pos: v(12.5, 1.65, 21.85) };
  ceilLight(12.5, 3.0, 16.5, { mode: "flicker", color: 0xffe2b8, room: "galley" });
  ceilLight(12.5, 3.0, 20.5, { room: "galley", intensity: 3 });
  light(9.6, 1.1, 15.3, { color: 0x9dffb0, intensity: 0.8, distance: 3, mode: "flicker", room: "galley" });
  emitters.push({ sound: "coffee_grind", pos: v(8.4, 1.15, 19.2), volume: 0.55, ref: 1.2 });
  emitters.push({ sound: "fridge_hum", pos: v(9.6, 1.0, 14.6), volume: 0.35, ref: 1.2 });

  // ---------------------------------------------------------------- conference
  P.confTable(kit, 27.6, 18.0, 5.0, 1.5);
  for (let i = 0; i < 4; i++) {
    P.officeChair(kit, 25.7 + i * 1.3 + 0.1 * Math.sin(i * 3), 16.85 - 0.15 * (i % 2), rr(-0.3, 0.3));
    P.officeChair(kit, 25.7 + i * 1.3, 19.15 + 0.2 * (i % 2), Math.PI + rr(-0.3, 0.3));
  }
  P.officeChair(kit, 24.5, 18.0, Math.PI / 2 + 0.3);
  P.officeChair(kit, 30.9, 18.4, -Math.PI / 2 - 0.4);
  const wbFrame = kit.group(31.97, 0.9, 18, -Math.PI / 2);
  kit.box(wbFrame, 2.5, 1.3, 0.03, "chrome", 0, 0, 0);
  P.wallPlane(kit, kit.decal(T.whiteboard(), { transparent: false, rough: 0.3 }), 31.94, 1.55, 18, "w", 2.4, 1.2, 0);
  P.wallPlane(kit, kit.screen(T.screenProjector(), 1.0), 27.6, 1.75, 14.0, "s", 2.6, 1.5);
  ["13 pts?", "sync @ 3", "LET'S GO!", "submit."].forEach((t, i) => {
    P.wallPlane(kit, kit.decal(T.sticky([t], ["#f7e463", "#ff9fb5", "#9fe0ff", "#f7e463"][i]), { transparent: false }), 22.56, 1.2 + (i % 2) * 0.35, 18.4 + i * 0.6, "e", 0.12, 0.12, 0);
  });
  slot("conference", 25.4, 0.775, 18.3);
  slot("conference", 29.9, 0.775, 17.7);
  ceilLight(27.6, 3.0, 18, { mode: "flicker", room: "conference" });
  light(27.6, 1.8, 14.6, { color: 0xbfd3ff, intensity: 1.2, distance: 5, room: "conference" });
  marks.knock = v(22.5, 1.4, 19.8);

  // ---------------------------------------------------------------- bullpen
  const jira = T.screenJira(tickets);
  const code = T.screenCode();
  const slack = T.screenSlack();
  const training = T.screenTrainingLarge();
  const typo = T.screenTypo();
  const jenLaptop = T.screenCode();
  P.deskPod(kit, 15.2, 3.8, [jira, code, typo, slack], [{}, {}, { jacket: "fabricRed" }, {}]);
  P.deskPod(kit, 15.2, 8.6, [training, null, code, jira], [{}, { chair: true, jacket: "fabricGreen" }, { laptop: true, nameplate: T.nameplate("TOM B. :)") }, {}]);
  P.deskPod(kit, 25.2, 3.8, [code, jira, null, null], [{}, {}, { laptop: jenLaptop, jacket: "fabricBlue" }, {}]);
  P.deskPod(kit, 25.2, 8.6, [slack, null, termScreen("bullpen"), training], [{ jacket: "fabric" }, {}, {}, {}]);
  P.balloon(kit, 13.6, 1.6, 9.9, 0x2a62c9);
  for (let i = 0; i < 4; i++) kit.cyl(kit.root, 0.033, 0.033, 0.12, i % 2 ? "yellow" : "red", 24.0 + i * 0.09, 0.745, 4.0 + (i % 2) * 0.08);
  const wall = kit.group(20.2, 1.15, 1.04, 0);
  kit.box(wall, 2.9, 1.7, 0.06, "plasticDark", 0, 0, 0);
  kit.plane(wall, 2.8, 1.6, kit.screen(T.screenJira(tickets, "SPRINT 47 (LOCKED)"), 1.1), 0, 0.85, 0.035);
  P.printer(kit, 31.25, 10.5, -Math.PI / 2, T.invoice());
  for (let i = 0; i < 26; i++) P.paperOnFloor(kit, rr(28.6, 31.6), 0, rr(8.8, 11.7), i % 3 ? T.invoice() : null);
  P.wallPlane(kit, kit.decal(T.graffiti(station.graffiti?.[3] ?? "WORKS ON MY MACHINE")), 12, 1.75, 6.4, "e", 3.4, 0.85);
  P.wallPlane(kit, kit.decal(T.graffiti(station.graffiti?.[5] ?? "3 POINTS")), 28.6, 2.2, 1, "s", 1.9, 0.48);
  P.wallPlane(kit, kit.decal(T.poster("halcyon"), { transparent: false }), 13.4, 1.6, 1.0, "s", 0.7, 1.0);
  P.wallPlane(kit, kit.screen(signTex("server_room", "OPS / REACTOR WATCH"), 0.9), 32, 2.95, 7, "w", 1.6, 0.38);
  P.plant(kit, 12.5, 11.4);
  P.plant(kit, 31.4, 1.5);
  slot("bullpen", 15.6, 0.745, 3.3);
  slot("bullpen", 24.9, 0.745, 4.35);
  slot("bullpen", 31.25, 1.1, 10.75);
  slot("bullpen", 14.1, 0.745, 9.15);
  terminals.bullpen = { pos: v(24.53, 1.07, 8.85) };
  ceilLight(15.2, 3.3, 3.8, { room: "bullpen", intensity: 4 });
  ceilLight(15.2, 3.3, 8.6, { mode: "flicker", room: "bullpen" });
  ceilLight(20.2, 3.3, 6.2, { room: "bullpen", intensity: 3 });
  ceilLight(25.2, 3.3, 3.8, { mode: "dead", room: "bullpen" });
  ceilLight(25.2, 3.3, 8.6, { mode: "flicker", room: "bullpen" });
  ceilLight(29.8, 3.3, 10.0, { mode: "dying", room: "bullpen" });
  light(20.2, 1.9, 1.7, { color: 0x86a8ff, intensity: 1.5, distance: 6, room: "bullpen" });
  emitters.push({ sound: "printer", pos: v(31.25, 1.0, 10.5), volume: 0.5, ref: 1.5, intermittent: [6, 14] });
  marks.printer = v(31.25, 1.0, 10.5);

  // ---------------------------------------------------------------- ops room
  const vw = [
    [35.4, 2.3, T.screenDashboard("errors")],
    [38.0, 2.3, T.screenDashboard("latency")],
    [40.6, 2.3, T.screenDashboard("network")],
    [38.0, 1.3, T.screenDashboard("pager")],
  ];
  for (const [x, y, t] of vw) {
    const g = kit.group(x, y - 0.47, 2.04, 0);
    kit.box(g, 1.62, 0.94, 0.06, "plasticDark", 0, 0, 0);
    kit.plane(g, 1.56, 0.88, kit.screen(t, 1.25), 0, 0.47, 0.035);
  }
  const pm = T.screenPostmortem();
  for (let i = 0; i < 4; i++) P.desk(kit, 35.6 + i * 1.42, 4.35, 0, { screen: [termScreen("server_room"), T.screenDashboard("errors"), T.screenDashboard("pager"), pm][i], mug: i !== 0 });
  for (let i = 0; i < 4; i++) P.officeChair(kit, 35.6 + i * 1.42 + rr(-0.2, 0.2), 5.2, Math.PI + rr(-0.5, 0.5));
  kit.box(kit.root, 0.2, 0.06, 0.18, "plasticDark", 38.2, 0.74, 4.6);
  for (let i = 0; i < 5; i++) kit.cyl(kit.root, 0.033, 0.033, 0.12, "yellow", 39.4 + rr(-0.3, 0.3), 0.745, 4.5 + rr(-0.1, 0.2));
  P.cot(kit, 42.3, 8.8, 0);
  P.rack(kit, 34.0, 11.45, Math.PI, anim(T.rackLEDs()));
  P.rack(kit, 34.66, 11.45, Math.PI, anim(T.rackLEDs()));
  P.rack(kit, 35.32, 11.45, Math.PI, anim(T.rackLEDs()));
  P.desk(kit, 36.6, 8.6, -Math.PI / 2, { screen: T.screenSupport() });
  P.officeChair(kit, 37.5, 8.6, -Math.PI / 2 + 0.3);
  slot("server_room", 38.6, 0.745, 4.6);
  slot("server_room", 36.85, 0.745, 9.05);
  terminals.server_room = { pos: v(35.65, 1.07, 4.2) };
  P.wallPlane(kit, kit.screen(T.sign("LOADING DOCK"), 0.9), 41, 2.95, 12, "n", 1.4, 0.36);
  ceilLight(38, 3.3, 7.2, { room: "server_room", intensity: 3, mode: "flicker" });
  light(42.6, 3.0, 2.5, { color: 0xff2a1a, intensity: 4, distance: 9, mode: "spin", room: "server_room" });
  light(38, 1.8, 2.8, { color: 0xff5a4a, intensity: 2, distance: 6, room: "server_room" });

  // ---------------------------------------------------------------- loading corridor and dock
  P.pipe(kit, 40.25, 3.15, 13, 40.25, 3.15, 24, 0.07);
  P.pipe(kit, 41.8, 2.9, 13, 41.8, 2.9, 24, 0.04, "copper");
  ceilLight(41, 3.4, 16, { mode: "dying", room: "dock" });
  ceilLight(41, 3.4, 21.5, { mode: "dead", room: "dock" });
  marks.shadow = v(40.3, 0, 23.6);

  const shutter = kit.group(45.95, 0, 27, -Math.PI / 2);
  kit.box(shutter, 4.2, 3.4, 0.08, "metal", 0, 0, 0);
  for (let i = 0; i < 16; i++) kit.box(shutter, 4.2, 0.03, 0.1, "metalDark", 0, 0.1 + i * 0.21, 0);
  kit.box(shutter, 4.2, 0.25, 0.12, "yellow", 0, 0, 0);
  P.crate(kit, 35.2, 24.9, 1.0);
  P.crate(kit, 35.25, 24.9, 0.7, 0.3, null, 0.8);
  P.crate(kit, 36.5, 25.0, 0.9, -0.2, T.boxLabel("LEVEL B STORAGE 2016"));
  P.crate(kit, 44.6, 24.8, 0.8, 0.1, T.boxLabel("G.W. DESK 2016"));
  P.pallet(kit, 44.0, 28.6, 0.1);
  P.crate(kit, 43.8, 28.6, 0.7, 0.4, T.boxLabel("RETURNED IT EQUIP"), 0.13);
  P.crate(kit, 38.0, 29.35, 0.55, 0.15);
  slot("stairwell", 38.0, 0.45, 29.35);
  // the stairwell door, propped open with a fire extinguisher
  const leaf = kit.group(39.02, 0, 30.02, 0);
  leaf.rotation.y = 1.25;
  kit.box(leaf, 0.06, 2.5, 1.0, "metalDark", 0, 0, 0.5);
  kit.box(leaf, 0.07, 0.06, 0.25, "chrome", 0, 1.0, 0.85);
  P.extinguisher(kit, 39.55, 0, 29.75, true);
  P.wallPlane(kit, kit.screen(T.sign("STAIRWELL B", "NOT ON PLAN", { accent: "#c62828" }), 0.95), 40, 3.0, 30, "n", 1.9, 0.48);
  P.wallPlane(kit, kit.decal(T.graffiti(station.graffiti?.[0] ?? "DON'T RESTART IT")), 43.6, 1.8, 30, "n", 3.2, 0.8);
  ceilLight(40, 4.6, 26.5, { mode: "flicker", color: 0xffb36b, room: "dock", intensity: 6, distance: 11 });
  ceilLight(35.5, 4.6, 26.5, { mode: "dying", color: 0xffb36b, room: "dock" });
  light(40, 2.85, 29.7, { color: 0xff3020, intensity: 1.6, distance: 4, mode: "pulse", room: "dock" });
  // red glow coming up the stairwell door, so anything standing in front of it reads as a silhouette from the corridor
  light(40.0, 1.5, 31.0, { color: 0xff4a2a, intensity: 6, distance: 9, room: "dock" });

  // ---------------------------------------------------------------- stairs
  P.pipe(kit, 39.07, 0.95, 30.6, 39.07, -3.05, 40.6, 0.03, "metal");
  P.pipe(kit, 40.93, 0.95, 30.6, 40.93, -3.05, 40.6, 0.03, "metal");
  light(40, -0.9, 35.5, { color: 0xff3a24, intensity: 2.2, distance: 7, mode: "pulse", room: "stairwell" });
  slot("stairwell", 39.7, -1.97, 35.5);
  const phone = kit.plane(kit.root, 0.07, 0.14, kit.screen(T.sticky(["03:14", "8 missed"], "#1d2b44"), 1.3), 39.35, -1.995, 35.2, { rx: -Math.PI / 2, rz: 0.5 });
  phone.name = "tomPhone";

  // ---------------------------------------------------------------- Level B / Cage B
  const Y = -4;
  P.wallPlane(kit, kit.decal(T.graffiti("LEVEL B", "#d8d0b0")), 37, Y + 2.0, 42, "e", 1.6, 0.4);
  P.pipe(kit, 33, Y + 2.7, 44, 47, Y + 2.7, 44, 0.09);
  P.pipe(kit, 33, Y + 2.55, 48.5, 47, Y + 2.55, 48.5, 0.06, "copper");
  P.pipe(kit, 46.6, Y + 2.9, 43, 46.6, Y + 2.9, 51, 0.12);
  const gate = kit.group(39.0, Y, 46.5, -0.9);
  kit.box(gate, 0.04, 2.3, 1.0, "metalDark", 0, 0, 0.5);
  const oldDesk = P.desk(kit, 40.0, 49.8 + 0.0, Math.PI, { mug: true, clutter: true });
  oldDesk.position.y = Y;
  kit.colliders.pop();
  kit.solid(oldDesk);
  const crtScreen = anim(T.screenCRT());
  P.crt(kit, 40.0, Y + 0.74, 50.05, Math.PI, crtScreen);
  P.wallPlane(kit, kit.decal(T.sticky(["almost done,", "back Monday", "  - G"]), { transparent: false }), 39.8, Y + 1.06, 49.82, "n", 0.1, 0.1, 0);
  P.oldKeyboard(kit, 40.0, Y + 0.745, 49.5, Math.PI);
  P.towerPC(kit, 41.2, Y, 49.95, Math.PI);
  P.wallPlane(kit, kit.decal(T.sign("bill-legacy-01", "DO NOT RESTART", { bg: "#e8e4d8", fg: "#111", accent: "#c62828" }), { transparent: false }), 41.2, Y + 0.32, 49.72, "n", 0.18, 0.05, 0);
  const chair = P.officeChair(kit, 40.15, 48.95, 0.25);
  chair.position.y = Y;
  kit.colliders.pop();
  kit.solid(chair, -0.05);
  P.floorCable(kit, Y, [[41.2, 50.1], [42.4, 50.6], [44.5, 50.4], [46.8, 50.7]]);
  P.floorCable(kit, Y, [[41.3, 49.8], [42.8, 48.9], [44.0, 47.8], [46.7, 47.2]]);
  P.floorCable(kit, Y, [[41.1, 49.9], [40.3, 50.6], [36.2, 50.7], [33.2, 50.2]]);
  P.pipe(kit, 40, Y + 3.0, 49.6, 40, Y + 2.55, 49.6, 0.006, "cable");
  kit.sphere(kit.root, 0.05, new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.4, 1.4) }), 40, Y + 2.5, 49.6);
  slot("cage_b", 38.65, Y + 0.02, 45.35);
  slot("cage_b", 40.5, Y + 0.745, 49.55);
  // Priya's things, left at the fence
  const pl = kit.group(38.25, Y, 45.0, 0.6);
  kit.box(pl, 0.33, 0.015, 0.23, "metal", 0, 0, 0);
  const lid = kit.group(0, 0.015, -0.115, 0, pl);
  lid.rotation.x = -0.4;
  kit.box(lid, 0.33, 0.22, 0.008, "metal", 0, 0, 0);
  kit.plane(lid, 0.3, 0.19, kit.screen(T.screenCode(), 1.2), 0, 0.11, 0.006);
  kit.box(kit.root, 0.55, 0.06, 0.4, "fabricBlue", 37.7, Y, 45.4, { ry: 0.9 });
  P.wallPlane(kit, kit.decal(T.graffiti(station.graffiti?.[1] ?? "ASK GARY")), 33, Y + 1.7, 47.6, "e", 2.4, 0.6);
  P.wallPlane(kit, kit.decal(T.graffiti(station.graffiti?.[6] ?? "BACK MONDAY")), 47, Y + 1.7, 44.6, "w", 2.6, 0.65);
  P.wallPlane(kit, kit.decal(T.graffiti(station.graffiti?.[4] ?? "RETRY PENDING")), 44.4, Y + 1.8, 51, "n", 2.8, 0.7);
  light(40, Y + 2.35, 49.6, { color: 0xffc27a, intensity: 4, distance: 8, mode: "flicker", room: "cage_b" });
  light(40, Y + 2.6, 42, { color: 0xff3a24, intensity: 2, distance: 7, mode: "pulse", room: "cage_b" });
  light(40, Y + 1.1, 49.4, { color: 0x58ff8a, intensity: 0.7, distance: 3, room: "cage_b" });
  emitters.push({ sound: "amb_basement", pos: v(41.2, Y + 0.4, 49.9), volume: 1.0, ref: 1.6 });
  marks.server = v(41.2, Y + 0.3, 49.9);
  marks.console = v(40.0, Y + 1.1, 49.9);

  return { slots, terminals, lights, emitters, animated, marks };
}

