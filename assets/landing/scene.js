// The two pictures behind the landing page, rendered in code in place of photos: one 3D scene in two moods (night
// and day), drawn by the same fragment shader with one number changed, so the pair matches pixel for pixel and one
// can be revealed over the other. The scene's geometry can be prepared once in "maps" (float textures both moods
// read), and each picture is drawn in thin bands across frames, so the page never freezes and the counter shows real
// progress. (Plain-JS port of the lucid template's src/lib/scene.ts.)
(function () {
  "use strict";

  /** The pictures' size in pixels (they fill the screen like object-fit: cover). */
  const IMAGE = { w: 2752, h: 1536 };

  const PRELUDE = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
out vec4 o;
uniform vec2 R;           // the size of what is being drawn, in pixels
uniform float uDay;       // 0 = the night picture, 1 = the day picture
uniform float uQuality;   // 1 on desktop, 0 on touch devices: a scene may take fewer steps
uniform int uSamples;
uniform sampler2D uNoise; // 256 × 256 random values that tile; g is r shifted by (37, 17)
uniform sampler2D uMap0, uMap1, uMap2;
int RAY = 0;               // which of the pixel's rays is being drawn (0 … uSamples - 1), for scenes that spread things over them

const float PI = 3.14159265;

// Hashes on whole numbers (no bands, no repeats)
uint pcg(uint v) { uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
float hash(vec2 p) { ivec2 i = ivec2(floor(p)); return float(pcg(uint(i.x) + pcg(uint(i.y)))) / 4294967296.0; }
float hash(vec3 p) { ivec3 i = ivec3(floor(p)); return float(pcg(uint(i.x) + pcg(uint(i.y) + pcg(uint(i.z))))) / 4294967296.0; }
vec2 hash2(vec2 p) { ivec2 i = ivec2(floor(p)); uint a = pcg(uint(i.x) + pcg(uint(i.y))); return vec2(float(a), float(pcg(a))) / 4294967296.0; }
vec3 hash3(vec2 p) { ivec2 i = ivec2(floor(p)); uint a = pcg(uint(i.x) + pcg(uint(i.y))); uint b = pcg(a); return vec3(float(a), float(b), float(pcg(b))) / 4294967296.0; }

// Value noise 0…1, and with its slope (yz)
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
vec3 noised(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0), du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  float a = hash(i), b = hash(i + vec2(1, 0)), c = hash(i + vec2(0, 1)), d = hash(i + vec2(1, 1));
  return vec3(a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y, du * (vec2(b - a, c - a) + (a - b - c + d) * u.yx));
}
float noise(vec3 p) {
  vec3 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), u.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), u.x), u.y),
             mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), u.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), u.x), u.y), u.z);
}
// The same from the noise texture: one read each, for inner loops (soft things only: it has 256 levels)
float tnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return textureLod(uNoise, (i + f + 0.5) / 256.0, 0.0).b; }
float tnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  vec2 rg = textureLod(uNoise, (i.xy + vec2(37.0, 17.0) * i.z + f.xy + 0.5) / 256.0, 0.0).rg;
  return mix(rg.x, rg.y, f.z);
}
const mat2 ROT = mat2(0.8, 0.6, -0.6, 0.8);
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { s += a * noise(p); p = ROT * p * 2.03 + 11.7; a *= 0.5; } return s; }
float fbm(vec2 p, int n) { float s = 0.0, a = 0.5; for (int i = 0; i < n; i++) { s += a * noise(p); p = ROT * p * 2.03 + 11.7; a *= 0.5; } return s; }
float tfbm(vec2 p, int n) { float s = 0.0, a = 0.5; for (int i = 0; i < n; i++) { s += a * tnoise(p); p = ROT * p * 2.03 + 11.7; a *= 0.5; } return s; }
float tfbm(vec3 p, int n) { float s = 0.0, a = 0.5; for (int i = 0; i < n; i++) { s += a * tnoise(p); p = p * 2.03 + vec3(11.7, 3.1, 7.3); a *= 0.5; } return s; }

// Film response: scene light (any range) to display light 0…1, with a soft shoulder and a little toe
vec3 filmic(vec3 x) { x = max(x, 0.0); return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

  const MAP_MAIN = /* glsl */ `
void main() { o = map(gl_FragCoord.xy / R); }`;

  const MAIN = /* glsl */ `
void main() {
  vec3 col = vec3(0.0);
  for (int i = 0; i < uSamples; i++) {
    // rays spread inside the pixel: a rotated grid for four, a low-discrepancy set for more
    vec2 j = uSamples == 4 ? (vec2(float(i & 1), float(i >> 1)) * 0.5 + vec2(float(i >> 1), float(1 - (i & 1))) * 0.25 - 0.375)
           : uSamples == 1 ? vec2(0.0) : fract(0.5 + float(i) * vec2(0.7548776662, 0.5698402910)) - 0.5;
    RAY = i;
    col += clamp(picture((gl_FragCoord.xy + j - 0.5 * R) / R.y), 0.0, 1.0);
  }
  col /= float(uSamples);
  col = mix(col * 12.92, 1.055 * pow(col, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, col)); // to sRGB
  vec3 h = hash3(gl_FragCoord.xy);
  col += (h.x + h.y - 1.0) * (0.004 + 0.012 * sqrt(luma(col)) * (1.0 - luma(col))); // grain; it also dithers the long gradients
  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

  // Lets the page breathe while the GPU works. A message, not a timer: timers are held back in background tabs. One
  // channel for all of them: a new one per wait would be tens of thousands, and freeing those stalls the browser.
  let channel = null;
  const waiting = [];
  const pause = () =>
    new Promise((resolve) => {
      if (!channel) {
        channel = new MessageChannel();
        channel.port1.onmessage = () => {
          const next = waiting.shift();
          if (next) next();
        };
      }
      waiting.push(resolve);
      channel.port2.postMessage(null);
    });
  // A short rest for the GPU: until the next frame, or 6 ms, whichever comes first (in a hidden tab, where neither
  // frames nor timers run on time: a message)
  const rest = () =>
    document.hidden
      ? pause()
      : new Promise((resolve) => {
          requestAnimationFrame(() => resolve());
          setTimeout(resolve, 6);
        });

  // The noise texture: seeded, so every visit draws the same picture
  function noiseTexture() {
    const n = 256, data = new Uint8Array(n * n * 4);
    let seed = 20240607;
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = 0; i < n * n; i++) {
      data[i * 4] = rand() * 256;
      data[i * 4 + 2] = rand() * 256;
      data[i * 4 + 3] = rand() * 256;
    }
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) data[(y * n + x) * 4 + 1] = data[(((y + 17) % n) * n + ((x + 37) % n)) * 4];
    return data;
  }

  /**
   * Renders the night picture, then the day picture. Progress runs 0 → 1 over both, and each resolves on its own, so
   * the preloader can start as soon as the night is in. The day is drawn in short stretches with rests in between,
   * which leaves the preloader its share of the GPU.
   */
  function bakePair(art, onProgress) {
    const run = async function* () {
      const touch = window.matchMedia("(pointer: coarse)").matches;
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true, antialias: false, alpha: false, powerPreference: "high-performance" });
      if (!gl) throw new Error("WebGL 2 is not available: the pictures can't be drawn");
      const maps = art.maps ?? [];
      if (maps.length && !gl.getExtension("EXT_color_buffer_float") && !gl.getExtension("EXT_color_buffer_half_float")) {
        throw new Error("Float textures can't be drawn to: the pictures can't be drawn");
      }
      const scale = Math.min(touch ? 0.7 : 1, gl.getParameter(gl.MAX_TEXTURE_SIZE) / IMAGE.w);
      canvas.width = Math.round(IMAGE.w * scale);
      canvas.height = Math.round(IMAGE.h * scale);

      const compile = (type, source) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        return shader;
      };
      const vertex = compile(gl.VERTEX_SHADER, "#version 300 es\nin vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }");
      const build = (body) => {
        const program = gl.createProgram();
        const fragment = compile(gl.FRAGMENT_SHADER, PRELUDE + (art.common ?? "") + body);
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.bindAttribLocation(program, 0, "p");
        gl.linkProgram(program);
        return { program, fragment };
      };
      // Compile everything up front (the browser can do it off the main thread), then check
      const built = [...maps.map((m) => build(m.glsl + MAP_MAIN)), build(art.glsl + MAIN)];
      const parallel = gl.getExtension("KHR_parallel_shader_compile");
      if (parallel) while (!built.every((b) => gl.getProgramParameter(b.program, parallel.COMPLETION_STATUS_KHR))) await rest();
      for (const b of built) {
        if (!gl.getProgramParameter(b.program, gl.LINK_STATUS)) {
          throw new Error(gl.getShaderInfoLog(b.fragment) || gl.getProgramInfoLog(b.program) || "The scene's shader did not compile");
        }
      }
      const use = ({ program }, w, h) => {
        gl.useProgram(program);
        gl.uniform2f(gl.getUniformLocation(program, "R"), w, h);
        gl.uniform1f(gl.getUniformLocation(program, "uQuality"), touch ? 0 : 1);
        gl.uniform1i(gl.getUniformLocation(program, "uSamples"), (art.samples ?? [4, 2])[touch ? 1 : 0]);
        gl.uniform1i(gl.getUniformLocation(program, "uNoise"), 0);
        for (let i = 0; i < 3; i++) gl.uniform1i(gl.getUniformLocation(program, `uMap${i}`), i + 1);
        gl.viewport(0, 0, w, h);
        return program;
      };

      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      const texture = (unit, filter, wrap) => {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
      };
      texture(0, gl.LINEAR, gl.REPEAT);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, noiseTexture());
      gl.enable(gl.SCISSOR_TEST);

      // Draws the current program over w × h in bands, waiting for the GPU to finish each one. The first time it
      // sizes the bands as it goes, to take about 28 ms each, and returns what every band cost (ms per row). Given
      // those costs (the night's, for the day: the same scene), it draws gently instead: bands of about 8 ms with a
      // rest after each, which leaves the page's animation its share of every frame.
      const draw = async (w, h, known, progress) => {
        const costs = [];
        let rows = Math.max(4, Math.round(h / 64));
        for (let y = 0; y < h; ) {
          if (known) {
            // as many rows as fit in 8 ms, going by what they cost last time
            let ms = 0, k = 0;
            for (rows = 0; y + rows < h && (rows < 2 || ms < 8); rows++) {
              while (k + 1 < known.length && known[k + 1].y <= y + rows) k++;
              ms += known[k].perRow;
            }
          }
          const n = Math.min(rows, h - y);
          gl.scissor(0, y, w, n);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
          gl.flush();
          const t0 = performance.now();
          for (;;) {
            await pause();
            const state = sync ? gl.clientWaitSync(sync, 0, 0) : gl.CONDITION_SATISFIED;
            if (state !== gl.TIMEOUT_EXPIRED || performance.now() - t0 > 4000) break;
          }
          gl.deleteSync(sync);
          const took = Math.max(0.5, performance.now() - t0);
          costs.push({ y, perRow: took / n });
          rows = Math.max(2, Math.min(Math.round(h / 12), Math.round(rows * Math.min(1.6, Math.max(0.4, 28 / took)))));
          y += n;
          progress(y / h);
          if (known && y < h) await rest();
        }
        return costs;
      };

      // Progress: the maps are a tenth of the work when there are any, the two pictures share the rest
      const share = maps.length ? 0.1 : 0;
      performance.mark("bake:start");
      const frameBuffer = gl.createFramebuffer();
      for (const [i, m] of maps.entries()) {
        const size = touch ? m.size / 2 : m.size;
        texture(i + 1, gl.LINEAR, gl.CLAMP_TO_EDGE);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, size, size);
        gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, gl.getParameter(gl.TEXTURE_BINDING_2D), 0);
        use(built[i], size, size);
        await draw(size, size, null, (p) => onProgress((share * (i + p)) / maps.length));
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      performance.mark("bake:maps");
      const program = use(built[maps.length], canvas.width, canvas.height);
      let costs = null;
      for (let mood = 0; mood < 2; mood++) {
        gl.uniform1f(gl.getUniformLocation(program, "uDay"), mood);
        // The night as fast as the GPU goes; the day gently, because the preloader is wiping by then
        costs = await draw(canvas.width, canvas.height, costs, (p) => onProgress(share + ((1 - share) * (mood + p)) / 2));
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.94));
        if (!blob) throw new Error("A picture could not be encoded");
        performance.mark(mood ? "bake:day" : "bake:night");
        yield blob;
      }
      const lose = gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
    };
    const pictures = run();
    const night = pictures.next().then((r) => r.value);
    const day = night.then(() => pictures.next()).then((r) => {
      void pictures.next(); // lets the generator finish and free the GL context
      return r.value;
    });
    return { night, day };
  }

  window.LucidScene = { IMAGE, bakePair };
})();
