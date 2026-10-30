// Renders the scene at reduced resolution into an HDR target, then a single pass adds the "found footage" look:
// tone mapping, grade, chromatic aberration, grain, scanlines, vignette, glitches and red alert.
import * as THREE from "three";

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  uniform sampler2D tScene;
  uniform vec2 resolution;
  uniform float time, glitch, red, fade, exposure;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  vec3 aces(vec3 x) {
    const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
  }
  vec3 toSRGB(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }

  void main() {
    vec2 uv = vUv;
    vec2 cc = uv - 0.5;
    uv += cc * dot(cc, cc) * 0.045;

    if (glitch > 0.0) {
      float band = floor(uv.y * 28.0 + floor(time * 24.0) * 3.0);
      float g = hash(vec2(band, floor(time * 30.0)));
      uv.x += (g - 0.5) * 0.08 * glitch * step(0.72, g);
    }

    float ca = 0.0012 + 0.007 * glitch;
    vec3 col;
    col.r = texture2D(tScene, uv + cc * ca).r;
    col.g = texture2D(tScene, uv).g;
    col.b = texture2D(tScene, uv - cc * ca).b;

    col = aces(col * exposure);

    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 0.82);
    col *= vec3(0.96, 1.0, 1.04);
    col = mix(col, vec3(lum) * vec3(1.5, 0.28, 0.22), red * 0.55);

    float vig = smoothstep(0.95, 0.28, length(cc) * 1.18);
    col *= mix(0.35, 1.0, vig);

    col = toSRGB(col);
    col += (hash(vUv * resolution + fract(time) * 100.0) - 0.5) * 0.07;
    col *= 0.955 + 0.045 * sin(vUv.y * resolution.y * 1.6);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) col = vec3(0.0);
    col *= 1.0 - fade;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export class Post {
  constructor(renderer, { scale = 0.75, samples = 2 } = {}) {
    this.renderer = renderer;
    this.scale = scale;
    this.target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples });
    this.uniforms = {
      tScene: { value: this.target.texture },
      resolution: { value: new THREE.Vector2(1, 1) },
      time: { value: 0 },
      glitch: { value: 0 },
      red: { value: 0 },
      fade: { value: 0 },
      exposure: { value: 1.4 },
    };
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: this.uniforms, depthTest: false, depthWrite: false }));
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  setSize(w, h, dpr) {
    const s = this.scale * dpr;
    this.target.setSize(Math.max(2, Math.floor(w * s)), Math.max(2, Math.floor(h * s)));
    this.uniforms.resolution.value.set(w * dpr, h * dpr);
  }

  render(scene, camera, t) {
    this.uniforms.time.value = t;
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
  }
}
