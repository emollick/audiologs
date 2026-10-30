// Copies the three.js files the game needs into game/vendor so the site has no build step.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "game", "vendor");
mkdirSync(out, { recursive: true });

const files = [
  ["node_modules/three/build/three.module.js", "three.module.js"],
  ["node_modules/three/build/three.core.js", "three.core.js"],
  ["node_modules/three/examples/jsm/utils/BufferGeometryUtils.js", "BufferGeometryUtils.js"],
  ["node_modules/three/LICENSE", "three-LICENSE.txt"],
];
for (const [from, to] of files) {
  copyFileSync(join(root, from), join(out, to));
  console.log(`vendored ${to}`);
}
