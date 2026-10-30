// First-person movement with grid + prop collision, stairs, head bob, footsteps and a flashlight.
import * as THREE from "three";
import { at, blocksMovement, walkHeight } from "./map.js";
import { flashlightCookie } from "./textures.js";

const EYE = 1.62;
const RADIUS = 0.28;

export class Player {
  constructor(camera, { colliders, doors, onStep }) {
    this.camera = camera;
    this.colliders = colliders;
    this.doors = doors;
    this.onStep = onStep;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.keys = new Set();
    this.touchMove = { x: 0, y: 0 };
    this.enabled = false;
    this.stepDist = 0;
    this.bob = 0;
    this.feetY = 0;
    this.sensitivity = 0.0022;

    const flash = (this.flashlight = new THREE.SpotLight(0xfff1d6, 26, 22, 0.52, 0.45, 1.4));
    flash.map = flashlightCookie();
    flash.castShadow = true;
    flash.shadow.mapSize.set(1024, 1024);
    flash.shadow.bias = -0.0004;
    flash.shadow.normalBias = 0.02;
    flash.shadow.camera.near = 0.2;
    flash.shadow.camera.far = 22;
    flash.position.set(0.18, -0.22, 0.1);
    flash.target.position.set(0.05, -0.15, -3);
    camera.add(flash);
    camera.add(flash.target);
    this.flashOn = true;
    this.flashFlicker = 0;
    this._forward = new THREE.Vector3();
  }

  place(x, z, yaw = 0, pitch = 0) {
    this.pos.set(x, walkHeight(x, z), z);
    this.feetY = this.pos.y;
    this.yaw = yaw;
    this.pitch = pitch;
    this.vel.set(0, 0, 0);
    this.apply(0);
  }

  look(dx, dy) {
    this.yaw -= dx * this.sensitivity;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - dy * this.sensitivity));
  }

  toggleFlashlight() {
    this.flashOn = !this.flashOn;
  }

  forward() {
    return this.camera.getWorldDirection(this._forward);
  }

  /** True if a circle at (x, z) overlaps anything solid. */
  blocked(x, z) {
    for (let cz = Math.floor(z - RADIUS); cz <= Math.floor(z + RADIUS); cz++)
      for (let cx = Math.floor(x - RADIUS); cx <= Math.floor(x + RADIUS); cx++) {
        if (!blocksMovement(at(cx, cz)) && !this.doors.blocks(cx, cz)) continue;
        if (circleBox(x, z, cx, cz, cx + 1, cz + 1)) return true;
      }
    const feet = this.feetY;
    for (const c of this.colliders) {
      if (c.y1 < feet + 0.3 || c.y0 > feet + 1.8) continue;
      if (circleBox(x, z, c.x0, c.z0, c.x1, c.z1)) return true;
    }
    return false;
  }

  update(dt) {
    let fx = 0;
    let fz = 0;
    if (this.enabled) {
      if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) fz -= 1;
      if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) fz += 1;
      if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) fx -= 1;
      if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) fx += 1;
      fx += this.touchMove.x;
      fz += this.touchMove.y;
    }
    const len = Math.hypot(fx, fz);
    if (len > 1) {
      fx /= len;
      fz /= len;
    }
    const run = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    const speed = run ? 4.4 : 2.6;
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    const wx = (fx * c + fz * s) * speed;
    const wz = (-fx * s + fz * c) * speed;
    const k = 1 - Math.exp(-dt * 10);
    this.vel.x += (wx - this.vel.x) * k;
    this.vel.z += (wz - this.vel.z) * k;
    this.moveBy(this.vel.x * dt, this.vel.z * dt);
    this.apply(dt);
  }

  /** Moves with sliding collision. Also used by the scripted camera in capture mode. */
  moveBy(dx, dz) {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.1));
    let moved = 0;
    for (let i = 0; i < steps; i++) {
      const sx = dx / steps;
      const sz = dz / steps;
      const ox = this.pos.x;
      const oz = this.pos.z;
      if (!this.blocked(this.pos.x + sx, this.pos.z)) this.pos.x += sx;
      if (!this.blocked(this.pos.x, this.pos.z + sz)) this.pos.z += sz;
      moved += Math.hypot(this.pos.x - ox, this.pos.z - oz);
    }
    this.travel(moved);
  }

  travel(moved) {
    this.stepDist += moved;
    this.bob += moved * 2.4;
    if (this.stepDist > 0.72) {
      this.stepDist = 0;
      this.onStep?.(this.pos);
    }
  }

  apply(dt) {
    const target = walkHeight(this.pos.x, this.pos.z);
    this.feetY += (target - this.feetY) * (dt ? 1 - Math.exp(-dt * 14) : 1);
    this.pos.y = this.feetY;
    const moving = Math.hypot(this.vel.x, this.vel.z);
    const bobAmt = Math.min(1, moving / 2.6) * 0.045;
    this.camera.position.set(this.pos.x, this.feetY + EYE + Math.sin(this.bob * 2) * bobAmt, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, Math.sin(this.bob) * bobAmt * 0.12, "YXZ");
    // the flashlight lags a little behind the view, like a hand
    this.flashFlicker = Math.max(0, this.flashFlicker - (dt || 0));
    const flick = this.flashFlicker > 0 ? (Math.random() < 0.5 ? 0.1 : 1) : 1;
    this.flashlight.intensity = this.flashOn ? 26 * flick : 0;
  }

  /** The flashlight stutters for a moment (scares, the end). */
  stutter(seconds = 0.8) {
    this.flashFlicker = seconds;
  }
}

function circleBox(x, z, x0, z0, x1, z1) {
  const cx = Math.max(x0, Math.min(x, x1));
  const cz = Math.max(z0, Math.min(z, z1));
  return (x - cx) ** 2 + (z - cz) ** 2 < RADIUS * RADIUS;
}
