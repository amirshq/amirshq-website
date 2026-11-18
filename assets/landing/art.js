// The landing page's two pictures: an alpine lake, rendered in 3D from the near shore, 2 m above the water: an
// eroded range (ridges, gullies, rock bands, snowfields) baked once into a height map, spruce standing on the shores
// as a field of cones, mist lying where the water meets the land. At night a dense star field, the Milky Way and
// aurora curtains, their green on the snow and in the lake; then dawn, the first sun warm on the summits while
// the valley is still in blue shade. The lake mirrors both by walking the mirrored ray over the same land.
// (The scene from the lucid template's src/content/hush.ts, unchanged.)
(function () {
  "use strict";

// What the maps and the picture share: the camera and how the land is stored. Lengths are in km.
const COMMON = /* glsl */ `
const vec3 EYE = vec3(0.0, 0.0022, 0.0); // the camera, 2.2 m above the lake, looking along +z
const float FOCAL = 1.75;                // the lens: about 54° across
const float PITCH = 0.047;               // tilted up a little: the far shore sits at 58% from the top
const vec3 SUN = vec3(0.8643, 0.0918, -0.4862); // the dawn sun: low, from the right and a little behind the camera

// smoothstep that also runs downhill (edges in either order: the built-in one is undefined when the first is larger)
float sstep(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }

// The maps cover a wedge in front of the camera: across, the bearing; up, the distance on a log scale. So a texel
// is about as wide as a pixel of the picture at any distance.
const float WEDGE = 0.72, Z0 = 0.7, Z1 = 18.0;
vec2 toMap(vec2 q) { float z = max(q.y, Z0); return vec2(q.x / (z * WEDGE) * 0.5 + 0.5, log(z / Z0) / log(Z1 / Z0)); }
vec2 fromMap(vec2 uv) { float z = Z0 * pow(Z1 / Z0, uv.y); return vec2((uv.x * 2.0 - 1.0) * WEDGE * z, z); }

// Relief finer than the map can hold: sharp little ridges a few metres high, for the steep ground (0…1)
const float DETAIL = 0.014;
float detail(vec2 q) {
  float a = 1.0 - abs(2.0 * noise(q * 21.0) - 1.0);
  float b = 1.0 - abs(2.0 * noise(ROT * q * 55.0 + 3.0) - 1.0);
  float c = 1.0 - abs(2.0 * noise(q * 150.0 + 9.0) - 1.0);
  return a * a * 0.58 + b * b * 0.30 * (0.35 + a) + c * 0.12;
}

// The far shore's distance at x; the shore comes nearer at both sides, as wooded headlands
float shoreline(float x) {
  return 3.0 + 0.22 * sin(x * 1.3 + 0.6) + 0.3 * (noise(vec2(x * 1.1, 3.0)) - 0.5)
       - 1.6 * sstep(-0.22, -0.8, x) - 1.15 * sstep(0.45, 1.15, x) + 0.12 * (noise(vec2(x * 6.0, 8.0)) - 0.5);
}
`;

// Map 0: the land. r = height above the lake (negative: the lake bed), g = how much forest, b = gullies (0) to
// spurs (1), a = how rocky (steep and bare).
const HEIGHT = /* glsl */ `
float ridged(vec2 p) {
  float s = 0.0, a = 0.5, w = 1.0;
  for (int i = 0; i < 6; i++) { float n = 1.0 - abs(2.0 * noise(p) - 1.0); n *= n * w; w = clamp(n * 1.8, 0.0, 1.0); s += a * n; p = ROT * p * 2.07 + 5.3; a *= 0.5; }
  return s;
}
float bump(vec2 q, vec2 c, vec2 r) { vec2 d = (q - c) / r; return exp(-dot(d, d)); }

// The land before erosion: a bank, wooded hills, then the range with its named summits
float horn(vec2 q, vec2 c, vec2 r) { return exp(-1.5 * length((q - c) / r)); }
float terrain(vec2 q) {
  float land = q.y - shoreline(q.x);
  if (land < 0.0) return max(land * 0.45, -0.25);
  vec2 w = q - vec2(1.35, 0.0) + 0.5 * (vec2(noise(q * 0.35 + 2.0), noise(q * 0.35 + 9.0)) - 0.5);
  float apron = (0.012 + 0.10 * fbm(w * 0.9 + 4.0)) * (1.0 - exp(-land * 2.5));
  float rise = sstep(0.3, 3.0, land);
  float r = ridged(w * 0.26 + 1.7);
  float peaks = 1.12 * horn(w, vec2(0.45, 6.7), vec2(1.45, 1.7)) + 0.74 * horn(w, vec2(-2.2, 6.2), vec2(1.7, 1.8))
              + 0.80 * horn(w, vec2(3.6, 8.0), vec2(1.8, 2.0)) + 0.62 * horn(w, vec2(-1.0, 8.0), vec2(1.2, 1.3))
              + 2.1 * horn(w, vec2(-5.9, 13.0), vec2(3.2, 3.0)) + 1.3 * horn(w, vec2(6.5, 13.5), vec2(3.0, 3.0)) + 1.0 * horn(w, vec2(1.5, 14.0), vec2(3.0, 3.0));
  return 0.004 * sstep(0.0, 0.012, land) + land * 0.012 + apron + rise * (0.08 + 0.42 * r) + peaks * (0.42 + 0.95 * r) * sstep(0.0, 1.6, land);
}

// Erosion: stripes that run down the slope, each octave steered by the ones before (after Fewes's erosion noise)
vec3 erosion(vec2 p, vec2 dir) {
  vec2 ip = floor(p), fp = fract(p);
  vec3 va = vec3(0.0);
  float wt = 0.0;
  for (int i = -2; i <= 1; i++) for (int j = -2; j <= 1; j++) {
    vec2 o = vec2(float(i), float(j));
    vec2 pp = fp + o - (hash2(ip - o) - 0.5);
    float w = exp(-dot(pp, pp) * 2.0);
    float mag = dot(pp, dir) * 6.2832;
    wt += w;
    va += vec3(cos(mag), -sin(mag) * dir) * w;
  }
  return va / wt;
}

vec4 map(vec2 uv) {
  vec2 q = fromMap(uv);
  float e = 0.03;
  float h = terrain(q);
  vec2 g = vec2(terrain(q + vec2(e, 0.0)) - terrain(q - vec2(e, 0.0)), terrain(q + vec2(0.0, e)) - terrain(q - vec2(0.0, e))) / (2.0 * e);
  float sl = length(g);
  vec2 dir = vec2(g.y, -g.x) / (0.3 + sl) * 1.7;
  vec3 er = vec3(0.0);
  float a = 0.5, f = 1.0;
  for (int i = 0; i < 6; i++) {
    er += erosion(q / 0.8 * f, dir + er.zy * vec2(1.0, -1.0) * 0.55) * a * vec3(1.0, f, f);
    a *= 0.5; f *= 2.0;
  }
  float carve = sstep(0.1, 0.6, sl) * sstep(0.0, 0.25, h);
  float eroded = h + (er.x - 0.3) * 0.17 * carve * (0.35 + 0.65 * sstep(0.15, 1.0, h));
  // forest: on the low ground, thinning toward the tree line, kept off cliffs and out of the avalanche gullies
  float line = 0.42 + 0.2 * (fbm(q * 0.9 + 7.0) - 0.5) + 0.1 * er.x;
  float forest = sstep(line, line - 0.16, eroded) * sstep(0.0025, 0.006, eroded) * sstep(1.3, 0.8, sl)
               * (0.75 + 0.5 * noise(q * 4.0)) * mix(1.0, sstep(-0.75, -0.35, er.x - 0.5 + 0.5 * sstep(0.2, 0.35, eroded)), sstep(0.08, 0.22, eroded));
  float rocky = sstep(0.3, 0.85, sl) * sstep(0.12, 0.4, eroded) * (1.0 - clamp(forest * 1.5, 0.0, 1.0));
  return vec4(eroded, clamp(forest, 0.0, 1.0), er.x * 0.5 + 0.5, rocky);
}`;

// Map 1: light that only depends on the land. r = how much of the dawn sun reaches the ground (soft shadows of the
// range on itself), g = how much sky it sees, ba = the ground's slope.
const LIGHT = /* glsl */ `
float ground(vec2 q) { return textureLod(uMap0, toMap(q), 0.0).r; }
vec4 map(vec2 uv) {
  vec2 q = fromMap(uv);
  float h = ground(q);
  float ex = 2.0 * WEDGE * q.y / R.x, ez = q.y * log(Z1 / Z0) / R.y;
  vec2 slope = vec2(ground(q + vec2(ex, 0.0)) - ground(q - vec2(ex, 0.0)), 0.0) / (2.0 * ex);
  slope.y = (ground(q + vec2(0.0, ez)) - ground(q - vec2(0.0, ez))) / (2.0 * ez);
  float sun = 1.0, t = 0.03;
  for (int i = 0; i < 56; i++) {
    vec3 p = vec3(q.x, max(h, 0.0) + 0.003, q.y) + SUN * t;
    sun = min(sun, 0.5 + 9.0 * (p.y - ground(p.xz)) / t);
    t *= 1.1;
  }
  float sky = 0.0;
  for (int i = 0; i < 8; i++) {
    float an = (float(i) + 0.5) * 0.7854;
    vec2 d = vec2(cos(an), sin(an));
    float up = 0.0;
    for (int k = 0; k < 4; k++) { float r = 0.04 * exp2(float(k) * 1.3); up = max(up, (ground(q + d * r) - h) / r); }
    sky += 1.0 / sqrt(1.0 + up * up); // the cosine of the horizon's height that way
  }
  return vec4(clamp(sun, 0.0, 1.0), sky / 8.0, slope);
}`;

const SCENE = /* glsl */ `
vec3 ray(vec2 p) {
  vec3 d = normalize(vec3(p, FOCAL));
  float c = cos(PITCH), s = sin(PITCH);
  return vec3(d.x, d.y * c + d.z * s, d.z * c - d.y * s);
}

// ---- the forest: spruce as a field of cones standing on the ground -------------------------------------------
const float TREE = 0.0085; // km between trees
// x = the canopy's height above the ground at q, yz = the way out from the nearest trunk, w = that tree's own number
vec4 trees(vec2 q, float forest) {
  vec2 g = q / TREE + 0.35 * vec2(tnoise(q * 37.0), tnoise(q * 37.0 + 40.0)), c = floor(g - 0.5);
  vec4 best = vec4(0.0);
  for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
    vec2 cell = c + vec2(float(i), float(j));
    vec3 r = hash3(cell);
    if (r.z > forest * 1.1) continue;
    vec2 off = g - cell - 0.5 - (r.xy - 0.5) * 0.9;
    float size = fract(r.x * 13.7 + r.y * 7.3);
    float d = length(off), k = 1.0 - d / (0.30 + 0.24 * size);
    if (k <= 0.0) continue;
    float tall = (0.011 + 0.021 * size * size) * (0.6 + 0.4 * sstep(0.0, 0.5, forest));
    float top = tall * (k + 0.05 * sin(k * 28.0) * (1.0 - k)); // tiers of branches
    if (top > best.x) best = vec4(top, off / max(d, 1e-4), r.z / max(forest * 1.1, 0.01));
  }
  return best;
}

// The land's height at q with its trees
float surface(vec2 q) {
  vec4 m = textureLod(uMap0, toMap(q), 0.0);
  return m.r + (m.g > 0.004 ? trees(q, m.g).x : 0.0) + (m.a > 0.01 ? detail(q) * DETAIL * m.a : 0.0);
}

// Walks a ray over the land from t0 to t1: the distance to where it lands, or -1
float walk(vec3 ro, vec3 rd, float t0, float t1) {
  float t = t0, pt = t0;
  int n = uQuality > 0.5 ? 300 : 170;
  for (int i = 0; i < n; i++) {
    vec3 P = ro + rd * t;
    vec4 m = textureLod(uMap0, toMap(P.xz), 0.0);
    float h = P.y - m.r;
    bool wood = m.g > 0.004 && h < 0.04;
    if (wood) h -= trees(P.xz, m.g).x;
    if (m.a > 0.01 && h < 0.03) h -= detail(P.xz) * DETAIL * m.a;
    if (h < 0.0) {
      float a = pt, b = t;
      for (int k = 0; k < 7; k++) { float c = 0.5 * (a + b); vec3 Q = ro + rd * c; if (Q.y < surface(Q.xz)) b = c; else a = c; }
      return 0.5 * (a + b);
    }
    pt = t;
    t += wood ? clamp(h * 0.35, t * 0.0007, t * 0.004) : max(h * 0.4, t * 0.0012);
    if (t > t1 || (P.y > 3.2 && rd.y > 0.0)) break;
  }
  return -1.0;
}

// ---- the sky ---------------------------------------------------------------------------------------------------
vec3 dayAir(vec3 rd) {
  float h = max(rd.y, 0.0);
  float sunward = dot(normalize(rd.xz), normalize(SUN.xz));
  float warm = sstep(-0.9, 0.1, sunward); // 0 at the left of the picture (away from the sun), 1 at the right
  vec3 c = mix(vec3(0.25, 0.40, 0.76), vec3(0.06, 0.15, 0.46), sstep(0.08, 0.40, h));
  c = mix(c, mix(vec3(0.86, 0.56, 0.66), vec3(1.0, 0.62, 0.42), warm), exp(-h * 8.5) * (0.6 + 0.3 * warm));
  c = mix(c, vec3(1.0, 0.82, 0.58), exp(-h * 20.0) * warm * 0.8);
  return c;
}
vec3 nightAir(vec3 rd) {
  float h = max(rd.y, 0.0);
  return mix(vec3(0.010, 0.022, 0.040), vec3(0.0025, 0.005, 0.013), sstep(0.0, 0.45, h)) + vec3(0.004, 0.016, 0.012) * exp(-h * 9.0);
}

// Cloud bars high over the range at dawn, flattened by distance
float bars(vec3 rd) {
  vec2 c = rd.xz / max(rd.y, 0.03) * 6.0;
  float d = tfbm(c * vec2(0.04, 0.15) + vec2(3.2, 1.4), 5) + 0.35 * (tfbm(c * vec2(0.16, 0.42) + 9.0, 4) - 0.5);
  return sstep(0.46, 0.70, d) * sstep(0.07, 0.16, rd.y);
}

// Stars on a flat chart of the sky (the lens is narrow enough), three sizes of cell; more of them in the Milky Way
vec3 stars(vec3 rd, float soft) {
  vec2 uv = vec2(atan(rd.x, rd.z), asin(clamp(rd.y, -1.0, 1.0)));
  float px = soft / (FOCAL * R.y);
  // the Milky Way: a band climbing to the right, with dark lanes of dust
  float across = dot(uv - vec2(-0.12, 0.25), vec2(-0.30, 0.954));
  float along = dot(uv, vec2(0.954, 0.30));
  float dust = fbm(vec2(along * 9.0, across * 22.0) + 3.0, 5);
  float band = exp(-across * across / 0.0050) * (0.35 + 0.65 * sstep(0.30, 0.72, dust + 0.2 * exp(-across * across / 0.0012)));
  vec3 c = mix(vec3(0.020, 0.024, 0.036), vec3(0.034, 0.030, 0.030), exp(-across * across / 0.0010)) * band * (0.55 + 0.9 * fbm(uv * 70.0, 4));
  for (int l = 0; l < 4; l++) {
    float fl = float(l), s = 150.0 * exp2(fl * 0.85);
    vec2 g = uv * s + fl * 13.7, id = floor(g);
    vec3 r = hash3(id + fl * 71.0), r2 = hash3(id + fl * 71.0 + 500.0);
    if (r2.x > 0.30 + 0.45 * band) continue;
    vec2 d = (fract(g) - 0.5 - (r.xy - 0.5) * 0.8) / s;
    float mag = (0.02 + 1.6 * pow(r.z, 7.0)) * exp2(-fl * 1.5);
    float size = px * (0.50 + 0.45 * pow(r.z, 10.0) * exp2(-fl));
    vec3 tint = mix(vec3(1.0, 0.80, 0.60), vec3(0.68, 0.82, 1.0), r2.y);
    c += tint * mag * exp(-dot(d, d) / (size * size)) * 3.0;
  }
  return c;
}

// The aurora: three curtains hanging from about 100 km, each a sheet that follows a winding line on the map. The
// ray meets a sheet where its track on the ground crosses that line; the light depends on the height there.
vec3 aurora(vec3 rd) {
  if (rd.y < 0.03) return vec3(0.0);
  vec3 sum = vec3(0.0);
  vec2 dir = rd.xz / rd.y; // km along the ground per km of height
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float s = (3.5 + 2.0 * fk) * 100.0 / max(rd.z, 0.2); // a first guess of the ground distance, then closing in
    float x = 0.0, line = 0.0, dl = 0.0;
    for (int i = 0; i < 4; i++) {
      x = s * rd.x / 100.0;
      float wig = 0.55 * sin(x * 0.9 + 1.7 * fk + 0.4) + 0.22 * sin(x * 2.9 + 4.0 * fk) + 0.5 * (tnoise(vec2(x * 1.4 + 9.0 * fk, 2.5)) - 0.5);
      line = 3.5 + 2.0 * fk + wig;
      s = line * 100.0 / max(rd.z, 0.2);
    }
    float e = 0.02;
    float w1 = 0.55 * sin((x + e) * 0.9 + 1.7 * fk + 0.4) + 0.22 * sin((x + e) * 2.9 + 4.0 * fk) + 0.5 * (tnoise(vec2((x + e) * 1.4 + 9.0 * fk, 2.5)) - 0.5);
    dl = (3.5 + 2.0 * fk + w1 - line) / e;
    float alt = s * rd.y / length(rd.xz); // km: how high the ray is where it meets the sheet
    // seen edge-on a sheet is brighter: the folds
    vec2 nrm = normalize(vec2(-dl, 1.0));
    float fold = 1.0 / max(abs(dot(normalize(rd.xz), nrm)), 0.4);
    // rays: fine pleats along the sheet, and stretches where it is alive
    float u = x * 100.0;
    float pleat = 0.30 + 0.70 * mix(tnoise(vec2(u * 0.22, fk * 13.0)), tnoise(vec2(u * 0.9, fk * 13.0)) * (0.5 + tnoise(vec2(u * 3.1, fk * 5.0 + 3.0))), 0.6);
    float alive = sstep(0.38, 0.72, tnoise(vec2(x * 0.9 + 4.0 * fk, 7.0 + fk)) * 0.8 + 0.2 * tnoise(vec2(x * 3.5, 2.0 + fk)));
    float foot = 97.0 + 7.0 * tnoise(vec2(u * 0.06, fk * 3.0));
    float reach = (14.0 + 50.0 * tnoise(vec2(u * 0.18 + 5.0, fk * 9.0))) * (0.5 + pleat);
    float up = alt - foot;
    float glow = sstep(-5.0, 4.0, up) * exp(-max(up, 0.0) / reach) + 0.10 * exp(-abs(up) / 55.0);
    vec3 hue = mix(vec3(0.08, 1.0, 0.40), vec3(0.06, 0.70, 0.60), sstep(8.0, 60.0, up));
    hue = mix(hue, vec3(0.42, 0.20, 0.80), sstep(40.0, 130.0, up));
    sum += hue * glow * pleat * alive * fold * (0.50 - 0.1 * fk);
  }
  return sum * sstep(0.03, 0.10, rd.y);
}

vec3 sky(vec3 rd, float soft) {
  rd.y = max(rd.y, 0.0005);
  if (uDay > 0.5) {
    vec3 c = dayAir(rd);
    float b = bars(rd);
    if (b > 0.0) {
      float lit = clamp(0.5 + 3.0 * (b - bars(normalize(rd + SUN * 0.02))), 0.0, 1.0); // the side toward the sun
      vec3 cloud = mix(vec3(0.52, 0.48, 0.66), vec3(1.0, 0.63, 0.50), lit) * (0.85 + 0.25 * lit);
      c = mix(c, cloud, b * 0.85);
    }
    return c;
  }
  vec3 a = aurora(rd);
  return nightAir(rd) + stars(rd, soft) * (1.0 - 0.6 * clamp(luma(a) * 2.5, 0.0, 1.0)) + a * 0.42;
}

// The air between the eye and something t km away
vec3 haze(vec3 col, vec3 rd, float t) {
  vec3 flat_ = normalize(vec3(rd.x, 0.045, rd.z));
  vec3 air = uDay > 0.5 ? mix(vec3(0.30, 0.42, 0.68), dayAir(flat_), 0.4) : nightAir(flat_) * 0.9;
  return mix(col, air, 1.0 - exp(-t * (uDay > 0.5 ? 0.058 : 0.038)));
}

// ---- the land's colour where a ray lands -----------------------------------------------------------------------
vec3 land(vec3 P, vec3 rd, float t) {
  vec2 uv = toMap(P.xz);
  vec4 m = textureLod(uMap0, uv, 0.0), l = textureLod(uMap1, uv, 0.0);
  float alt = P.y, over = P.y - m.r;
  vec3 n = normalize(vec3(-l.b, 1.0, -l.a));
  vec3 albedo;
  float sunlit = l.r, open = l.g;
  bool tree = m.g > 0.004 && over > 0.0012;
  if (tree) {
    vec4 tr = trees(P.xz, m.g);
    n = normalize(vec3(tr.y, 0.6, tr.z));
    float upTree = clamp(over / 0.022, 0.0, 1.0);
    albedo = mix(vec3(0.020, 0.036, 0.026), vec3(0.050, 0.070, 0.040), tr.w * tr.w) * (0.25 + 0.75 * upTree * upTree);
    albedo = mix(albedo, vec3(0.5, 0.55, 0.62), 0.5 * sstep(0.28, 0.5, alt + 0.1 * tr.w) * upTree); // rime on the high trees
    open *= 0.25 + 0.75 * upTree;
    sunlit *= 0.5;
  } else {
    // relief the map is too coarse for
    float rocky = m.a, e = max(t * 0.0005, 0.0012);
    float d0 = detail(P.xz);
    vec2 dg = vec2(detail(P.xz + vec2(e, 0.0)) - d0, detail(P.xz + vec2(0.0, e)) - d0) / e * DETAIL * rocky * 1.6;
    float steep = 1.0 - n.y;
    n = normalize(vec3(-l.b - dg.x, 1.0, -l.a - dg.y));
    float fine = noise(P.xz * 380.0), rough = 0.6 * noise(P.xz * 70.0) + 0.4 * fine;
    // the grain of a rock face: flutes down the fall line, and strata across it with ledges that hold snow
    vec2 fall = l.ba / max(length(l.ba), 1e-3);
    float across = dot(P.xz, vec2(-fall.y, fall.x));
    float flute = noise(vec2(across * 85.0, alt * 7.0 + 3.0)) * 0.6 + noise(vec2(across * 240.0, alt * 16.0)) * 0.4;
    float bed = alt * 62.0 + 3.0 * noise(P.xz * 1.6) + 0.6 * noise(P.xz * 14.0);
    float strata = noise(vec2(bed, 0.5)) * 0.6 + noise(vec2(bed * 3.1, 7.5)) * 0.4;
    float ledge = sstep(0.62, 0.9, noise(vec2(bed * 1.7, 3.5)));
    n = normalize(n + vec3(fall.y, 0.0, -fall.x) * (flute - 0.5) * 0.9 * rocky * steep);
    vec3 rock = mix(vec3(0.050, 0.048, 0.056), vec3(0.21, 0.18, 0.16), strata) * (0.5 + 0.7 * d0) * (0.65 + 0.7 * flute) * (0.85 + 0.3 * fine);
    vec3 turf = mix(vec3(0.045, 0.055, 0.030), vec3(0.085, 0.085, 0.050), noise(P.xz * 9.0));
    vec3 floor_ = vec3(0.020, 0.028, 0.018);
    float line = 0.43 + 0.2 * (m.b - 0.5);
    albedo = mix(turf, rock, sstep(0.2, 0.5, steep + (alt - line) * 0.9 + (rough - 0.5) * 0.2));
    albedo = mix(albedo, floor_, sstep(0.02, 0.3, m.g));
    // snow: above the snow line, lower in the gullies and hollows; it slides off what is too steep (the rock bands)
    float snowLine = 0.80 + 0.26 * (noise(P.xz * 0.6 + 3.0) - 0.5);
    float cover = (alt - snowLine) * 2.4 + (0.5 - m.b) * 0.7 + (0.42 - d0) * 1.1 * rocky + (rough - 0.5) * 0.35 + (n.y - 0.66) * 3.2
                + ((flute - 0.5) * 0.9 + ledge * 0.7 + (fine - 0.5) * 0.4) * sstep(0.15, 0.45, steep);
    float snow = sstep(-0.14, 0.14, cover);
    snow = max(snow, 0.8 * sstep(0.80, 0.93, n.y) * sstep(0.30, 0.45, alt + 0.1 * rough) * (1.0 - sstep(0.02, 0.2, m.g)));
    albedo = mix(albedo, vec3(0.84, 0.88, 0.94), snow);
    open *= mix(1.0, 0.45 + 0.75 * d0, rocky);
  }
  vec3 col;
  if (uDay > 0.5) {
    // only the heights are in the sun yet: the shadow of the ranges behind the camera has not sunk to the valley
    float edge = 0.86 + 0.16 * sin(P.x * 0.33 + 1.2) + 0.10 * (noise(P.xz * 0.9) - 0.5);
    float inSun = sunlit * sstep(-0.16, 0.16, alt - edge);
    vec3 sun = vec3(1.0, 0.40, 0.19) * 4.0 * max(dot(n, SUN), 0.0) * inSun;
    vec3 skyl = vec3(0.17, 0.30, 0.68) * 0.42 * open * (0.35 + 0.65 * n.y);
    vec3 glow = vec3(0.70, 0.40, 0.36) * 0.34 * open * pow(max(0.0, 0.5 + 0.5 * dot(n, normalize(vec3(0.5, 0.25, -0.83)))), 2.0); // the bright sky behind the camera
    col = albedo * (sun + skyl + glow);
  } else {
    vec3 skyl = vec3(0.010, 0.018, 0.034) * open * (0.5 + 0.5 * n.y);
    vec3 green = vec3(0.012, 0.085, 0.050) * open * max(0.0, 0.35 + 0.65 * dot(n, vec3(0.0, 0.85, 0.53)));
    col = albedo * (skyl + green) * (tree ? 2.6 : 1.0);
  }
  return haze(col, rd, t);
}

// ---- the mist that lies where the lake meets the land ----------------------------------------------------------
// A thin veil on the water under the far shore (a layer that thins with height, summed along the ray in closed
// form), and two decks of low cloud hanging over the woods behind it (sampled along the stretch of the ray that is
// inside each deck). Returns how much of the view the mist takes.
float mist(vec3 ro, vec3 rd, float t1) {
  float tau = 0.0, rz = max(rd.z, 0.05);
  float xs = ro.x + rd.x * (2.8 - ro.z) / rz, zs = shoreline(xs);
  float ta = max((zs - 0.75 - ro.z) / rz, 0.0), tb = min((zs + 0.05 - ro.z) / rz, t1);
  if (tb > ta) {
    float high = 0.003 + 0.008 * tnoise(vec2(xs * 2.3, 1.0)) + 0.002 * tnoise(vec2(xs * 9.0, 6.0));
    float ya = max(ro.y + rd.y * ta, 0.0), yb = max(ro.y + rd.y * tb, 0.0), dy = yb - ya;
    float mean = abs(dy) > 1e-6 ? high * (exp(-ya / high) - exp(-yb / high)) / dy : exp(-ya / high);
    tau += mean * (tb - ta) * 1.5 * (0.08 + 0.92 * sstep(0.3, 0.75, tnoise(vec2(xs * 1.4 + 4.0, 3.0)) * 0.7 + 0.3 * tnoise(vec2(xs * 6.0, 8.0))));
  }
  for (int k = 0; k < 2; k++) {
    float fk = float(k), lo = 0.012 + 0.060 * fk, hi = 0.105 + 0.085 * fk; // the deck drifts between these heights
    float a = max((2.2 - ro.z) / rz, 0.0), b = min((6.2 - ro.z) / rz, t1);
    if (abs(rd.y) > 1e-5) {
      float u = (lo - ro.y) / rd.y, v = (hi - ro.y) / rd.y;
      a = max(a, min(u, v)); b = min(b, max(u, v));
    } else if (ro.y < lo || ro.y > hi) continue;
    if (b <= a) continue;
    float sum = 0.0;
    const int N = 14;
    for (int i = 0; i < N; i++) {
      vec3 P = ro + rd * mix(a, b, (float(i) + 0.5) / float(N));
      float yc = mix(lo, hi, 0.25 + 0.5 * tnoise(P.xz * vec2(0.55, 1.1) + 7.0 * fk));
      float hh = 0.006 + 0.020 * tnoise(P.xz * vec2(1.3, 2.4) + 3.0 + 5.0 * fk);
      float v = 1.0 - abs(P.y - yc) / hh;
      float d = tnoise(P.xz * vec2(0.7, 1.7) + 11.0 * fk + 2.0) * 0.6 + tnoise(P.xz * vec2(2.6, 5.5) + 5.0) * 0.4;
      sum += sstep(0.55, 0.80, d) * sstep(0.0, 0.9, v) * sstep(2.2, 3.0, P.z) * sstep(6.2, 4.8, P.z);
    }
    tau += sum / float(N) * (b - a) * (1.5 - 0.5 * fk);
  }
  return 1.0 - exp(-tau);
}
vec3 mistColour(vec3 rd) {
  return uDay > 0.5 ? mix(vec3(0.40, 0.49, 0.68), vec3(0.62, 0.56, 0.66), 0.3 + 0.25 * dot(normalize(rd.xz), normalize(SUN.xz)))
                    : vec3(0.014, 0.034, 0.040);
}

// ---- the lake ----------------------------------------------------------------------------------------------------
// The slope of the water at q, t km from the eye: long swell and ripples, flattened as they shrink under a pixel,
// stronger where a breeze touches the surface
vec2 ripples(vec2 q, float t) {
  float reach = t * t / (EYE.y * FOCAL * R.y); // km of water one pixel covers, along the line of sight
  // cat's paws: long streaks, the same width on screen near and far
  vec2 bl = vec2(q.x / max(q.y, 1e-3) * 2.2, log(max(t, 1e-3)) * 5.0);
  float breeze = sstep(0.56, 0.74, tnoise(bl + 3.0) * 0.7 + 0.3 * tnoise(bl * vec2(3.0, 2.6) + 9.0)) * sstep(0.004, 0.012, t);
  vec2 s = vec2(0.0);
  float lam = 0.016, amp = 0.0019;
  for (int i = 0; i < 5; i++) {
    vec3 d = noised(q * vec2(0.4, 1.0) / lam + float(i) * 17.0);
    float keep = exp(-pow(reach / lam * 1.2, 2.0));
    s += (d.yz - 0.0) * vec2(0.4, 1.0) * amp * keep * (i > 1 ? 0.7 + 3.0 * breeze : 1.0);
    lam *= 0.42; amp *= 0.72;
  }
  // what is finer than a pixel smears the mirror up and down: each of the pixel's rays takes its own tilt
  float tilt = (float(RAY) + hash(gl_FragCoord.xy + 7.0)) / float(uSamples) - 0.5;
  s.y += tilt * (0.0010 + 0.013 * breeze);
  return s;
}

vec3 picture(vec2 p) {
  vec3 rd = ray(p);
  float tw = rd.y < 0.0 ? EYE.y / -rd.y : 1e5;
  float start = 0.75 / rd.z;
  float t = tw > start ? walk(EYE, rd, start, min(tw, 60.0)) : -1.0;
  vec3 col;
  float seen = 60.0;
  if (t > 0.0) {
    col = land(EYE + rd * t, rd, t);
    seen = t;
  } else if (tw < 1e4) {
    vec3 W = EYE + rd * tw;
    vec2 s = ripples(W.xz, tw);
    vec3 n = normalize(vec3(-s.x, 1.0, -s.y));
    vec3 r = reflect(rd, n);
    r.y = max(r.y, 0.0008);
    r = normalize(r);
    float tr = walk(W, r, max(0.0, (0.75 - W.z) / max(r.z, 0.05)), 60.0);
    vec3 mirror = tr > 0.0 ? land(W + r * tr, r, tw + tr) : sky(r, 1.6);
    float m2 = mist(W, r, tr > 0.0 ? tr : 60.0);
    mirror = mix(mirror, mistColour(r), m2);
    float fres = 0.02 + 0.98 * pow(1.0 - clamp(dot(-rd, n), 0.0, 1.0), 5.0);
    vec3 deep = uDay > 0.5 ? vec3(0.012, 0.040, 0.060) : vec3(0.0015, 0.004, 0.008);
    col = mix(deep, mirror, fres);
    seen = tw;
  } else {
    col = sky(rd, 1.0);
  }
  col = mix(col, mistColour(rd), mist(EYE, rd, seen));
  return filmic(col * (uDay > 0.5 ? 1.05 : 1.6));
}
`;

  window.LANDING_ART = { common: COMMON, maps: [{ size: 2048, glsl: HEIGHT }, { size: 2048, glsl: LIGHT }], glsl: SCENE, samples: [6, 3] };
})();
