// shader.ts
//
// Ported VERBATIM from the source component's VERT/FRAG, plus the mouse-bump
// feature (uMouse / uMouseBump / uMouseRadius). The contour lines are the
// iso-levels of a 3D simplex noise field where the third axis is time, so the
// loops grow, shrink, merge, split and drift on their own. Nothing is
// re-tessellated on the CPU; the whole thing is a per-pixel GPU calculation.

export const VERT = `
precision highp float;
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export const FRAG = `
#extension GL_OES_standard_derivatives : enable
precision highp float;

uniform vec2  uRes;
uniform float uTime;
uniform vec2  uSeed;
uniform float uScale;
uniform float uLevels;
uniform float uLineWidth;
uniform float uOpacity;
uniform vec3  uColor;
uniform vec2  uDrift;
uniform float uWarp;
uniform vec2  uScrollOff;
uniform vec2  uMouse;        // cursor in the pre-offset stBase space
uniform float uMouseBump;    // eased bump height (0 disables the feature)
uniform float uMouseRadius;  // bump falloff radius, in stBase units

// Simplex noise — Ashima Arts / Stefan Gustavson, MIT licensed.
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// Two octaves. One is too glassy, three gets fussy and crowded.
float fbm(vec3 p) {
  return (snoise(p) + 0.5 * snoise(p * 2.0)) / 1.5;
}

void main() {
  // Normalize by the shorter edge: aspect-correct, and the pattern scales with
  // the element instead of stretching. stBase is the pre-offset, scale-applied
  // space that uMouse is expressed in.
  vec2 stN = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
  vec2 stBase = stN * uScale;
  vec2 st = stBase + uSeed + uDrift * uTime + uScrollOff;

  // Domain warp — bends the field so the loops meander like real terrain
  // rather than reading as regular concentric blobs.
  if (uWarp > 0.0) {
    vec2 q = vec2(
      fbm(vec3(st, uTime * 0.6)),
      fbm(vec3(st + 5.2, uTime * 0.6))
    );
    st += q * uWarp;
  }

  float v = fbm(vec3(st, uTime));

  // Mouse bump — raise the field with a soft Gaussian around the cursor so the
  // contour rings bloom outward. d is measured in the pre-offset stBase space,
  // the same space uMouse lives in.
  vec2 d = stBase - uMouse;
  v += uMouseBump * exp(-dot(d, d) / (uMouseRadius * uMouseRadius));

  float c = v * uLevels;

  // fwidth() converts "distance to the nearest iso-level" into screen pixels,
  // so every line draws at the same width regardless of how steep the field is.
  float w = fwidth(c);
  float dist = 0.5 - abs(fract(c) - 0.5);
  float dd = dist / max(w, 1e-5);

  float line = 1.0 - smoothstep(uLineWidth * 0.5 - 0.5, uLineWidth * 0.5 + 0.5, dd);

  // Where the field is so steep that bands fall below one pixel, fade out
  // instead of aliasing into moiré. Typical w here is ~0.02, so this only
  // engages in genuinely degenerate regions.
  line *= 1.0 - smoothstep(0.6, 1.4, w);

  float a = line * uOpacity;
  gl_FragColor = vec4(uColor * a, a); // premultiplied
}
`;

/** Compile + link the VERT/FRAG pair. Returns null on any compile/link error. */
export function buildProgram(gl: WebGLRenderingContext): WebGLProgram | null {
  const compile = (type: number, src: string): WebGLShader | null => {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error("topolines shader:", gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  };

  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;

  const p = gl.createProgram();
  if (!p) return null;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.error("topolines link:", gl.getProgramInfoLog(p));
    return null;
  }
  return p;
}
