// Shared GLSL snippets.
export const TERRAIN_ATTRIBS = `
layout(location=0) in vec4 a_pos;     // xyz in 1/16 block, w = texture layer
layout(location=1) in vec2 a_uv;      // 1/4096 units
layout(location=2) in vec4 a_nrm;     // xyz * 127, w = material id
layout(location=3) in vec4 a_light;   // sky, block, ao, flags (normalized)
layout(location=4) in vec4 a_color;   // tint rgb, sway
`;

export const NOISE = `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
float vnoise3(vec3 p){ vec3 i = floor(p), f = fract(p); vec3 u = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash13(i), hash13(i+vec3(1,0,0)), u.x), mix(hash13(i+vec3(0,1,0)), hash13(i+vec3(1,1,0)), u.x), u.y),
             mix(mix(hash13(i+vec3(0,0,1)), hash13(i+vec3(1,0,1)), u.x), mix(hash13(i+vec3(0,1,1)), hash13(i+vec3(1,1,1)), u.x), u.y), u.z); }
float fbm2(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*vnoise(p); p=p*2.03+vec2(17.1,9.2); a*=0.5; } return s; }
float ign(vec2 px){ return fract(52.9829189 * fract(dot(px, vec2(0.06711056, 0.00583715)))); }
`;

// Waving foliage (shared by shadow + gbuffer passes)
export const WAVING = `
uniform float u_time;
uniform float u_wind;
vec3 wave(vec3 worldPos, float mat, float sway){
  if (sway <= 0.0) return vec3(0.0);
  vec3 p = mod(worldPos, 1024.0);
  float t = u_time;
  float strength = (0.04 + 0.08 * u_wind) * sway;
  if (mat > 1.5 && mat < 2.5) strength *= 0.6; // leaves
  vec3 off;
  off.x = sin(t * 1.7 + p.x * 0.6 + p.z * 0.3) * 0.6 + sin(t * 2.9 + p.z * 1.3) * 0.4;
  off.z = sin(t * 1.4 + p.z * 0.6 + p.x * 0.4) * 0.6 + cos(t * 3.1 + p.x * 1.1) * 0.4;
  off.y = (mat > 1.5 && mat < 2.5) ? sin(t * 2.0 + p.x + p.z) * 0.3 : 0.0;
  return off * strength;
}
`;

export const ATMOSPHERE = `
const float PI = 3.14159265;
const float R_GROUND = 6360e3;
const float R_TOP = 6460e3;
const vec3 RAYLEIGH = vec3(5.802e-6, 13.558e-6, 33.1e-6);
const float RAYLEIGH_H = 8000.0;
const float MIE_S = 3.996e-6;
const float MIE_E = 4.4e-6;
const float MIE_H = 1200.0;
const vec3 OZONE = vec3(0.650e-6, 1.881e-6, 0.085e-6);

vec2 raySphere(vec3 ro, vec3 rd, float r){
  float b = dot(ro, rd), c = dot(ro, ro) - r*r;
  float d = b*b - c;
  if (d < 0.0) return vec2(-1.0);
  d = sqrt(d);
  return vec2(-b - d, -b + d);
}
vec3 extinctionAt(float h, out vec3 rayS, out float mieS){
  float dr = exp(-h / RAYLEIGH_H), dm = exp(-h / MIE_H);
  float oz = max(0.0, 1.0 - abs(h - 25000.0) / 15000.0);
  rayS = RAYLEIGH * dr; mieS = MIE_S * dm;
  return rayS + MIE_E * dm + OZONE * oz;
}
// optical depth transmittance from point p toward direction d to the top of the atmosphere
vec3 transmittanceTo(vec3 p, vec3 d){
  vec2 g = raySphere(p, d, R_GROUND);
  if (g.x > 0.0) return vec3(0.0);
  float t = raySphere(p, d, R_TOP).y;
  const int N = 8;
  float dt = t / float(N);
  vec3 od = vec3(0.0);
  for (int i = 0; i < N; i++){
    vec3 q = p + d * (float(i) + 0.5) * dt;
    float h = length(q) - R_GROUND;
    vec3 rs; float ms;
    od += extinctionAt(h, rs, ms) * dt;
  }
  return exp(-od);
}
float phaseR(float c){ return 3.0 / (16.0 * PI) * (1.0 + c*c); }
float phaseM(float c, float g){ float g2 = g*g; return 3.0/(8.0*PI) * ((1.0-g2)*(1.0+c*c)) / ((2.0+g2) * pow(1.0 + g2 - 2.0*g*c, 1.5)); }
`;

export const TONEMAP = `
vec3 acesFitted(vec3 v){
  const mat3 ACESIn = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 ACESOut = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  v = ACESIn * v;
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  v = a / b;
  return clamp(ACESOut * v, 0.0, 1.0);
}
vec3 linearToSrgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
vec3 srgbToLinear(vec3 c){ return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;
