// Time of day, weather state machine, and sky/fog/light colors (vanilla formulas + physical-sky values for shader mode).
import { clamp, lerp, smoothstep } from '../engine/math.js';

export function hsvToRgb(h, s, v) {
  const i = Math.floor(h * 6) % 6, f = h * 6 - Math.floor(h * 6);
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i];
}
export function biomeSkyColor(temp) { const f = clamp(temp / 3, -1, 1); return hsvToRgb(0.62222224 - f * 0.05, 0.5 + f * 0.1, 1); }
export const rgb24 = (c) => [(c >> 16 & 255) / 255, (c >> 8 & 255) / 255, (c & 255) / 255];

// DimensionType.timeOfDay
export function celestialAngle(dayTime) {
  const d0 = ((dayTime / 24000 - 0.25) % 1 + 1) % 1;
  const d1 = 0.5 - Math.cos(d0 * Math.PI) / 2;
  return (d0 * 2 + d1) / 3;
}

export const WEATHER_TYPES = ['clear', 'cloudy', 'overcast', 'rain', 'thunder', 'fog', 'snow'];
const PRESETS = {
  clear: { clouds: 0.32, rain: 0, thunder: 0, fog: 0.0, wind: 0.25, cirrus: 0.5 },
  cloudy: { clouds: 0.62, rain: 0, thunder: 0, fog: 0.05, wind: 0.45, cirrus: 0.7 },
  overcast: { clouds: 0.9, rain: 0, thunder: 0, fog: 0.15, wind: 0.5, cirrus: 0.2 },
  rain: { clouds: 0.95, rain: 1, thunder: 0, fog: 0.3, wind: 0.7, cirrus: 0.0 },
  thunder: { clouds: 1.0, rain: 1, thunder: 1, fog: 0.35, wind: 1.0, cirrus: 0.0 },
  fog: { clouds: 0.5, rain: 0, thunder: 0, fog: 1.0, wind: 0.1, cirrus: 0.2 },
  snow: { clouds: 0.92, rain: 1, thunder: 0, fog: 0.45, wind: 0.6, cirrus: 0.0 },
};

export class Weather {
  constructor(seed = 0) {
    this.type = 'clear';
    this.timer = 6000 + (seed % 6000);
    this.cur = { ...PRESETS.clear };
    this.target = { ...PRESETS.clear };
    this.rainLevel = 0; this.thunderLevel = 0; this.prevRain = 0; this.prevThunder = 0;
    this.flash = 0; this.lightningTimer = 0;
    this.rng = () => Math.random();
    this.rainbow = 0;
    this.cycle = true;
  }
  set(type, duration) {
    if (!PRESETS[type]) return false;
    this.type = type;
    this.target = { ...PRESETS[type] };
    this.timer = duration ?? (type === 'clear' ? 12000 + this.rng() * 60000 : 6000 + this.rng() * 12000);
    return true;
  }
  tick() {
    this.prevRain = this.rainLevel; this.prevThunder = this.thunderLevel;
    if (this.cycle && --this.timer <= 0) {
      // random transitions roughly mirroring vanilla's clear->rain->(thunder) cycle with extra intermediate skies
      const r = this.rng();
      const next = {
        clear: r < 0.45 ? 'cloudy' : r < 0.6 ? 'fog' : r < 0.85 ? 'overcast' : 'clear',
        cloudy: r < 0.35 ? 'clear' : r < 0.7 ? 'overcast' : 'rain',
        overcast: r < 0.5 ? 'rain' : r < 0.75 ? 'cloudy' : 'thunder',
        rain: r < 0.25 ? 'thunder' : r < 0.75 ? 'cloudy' : 'overcast',
        thunder: r < 0.6 ? 'rain' : 'cloudy',
        fog: r < 0.6 ? 'clear' : 'cloudy',
        snow: 'cloudy',
      }[this.type];
      const wasRain = this.type === 'rain' || this.type === 'thunder';
      this.set(next);
      if (wasRain && (next === 'cloudy' || next === 'clear')) this.rainbow = 1;
    }
    // smooth transitions (vanilla rain level moves by 0.01 per tick)
    for (const k of Object.keys(this.cur)) {
      const step = k === 'rain' || k === 'thunder' ? 0.01 : 0.002;
      const d = this.target[k] - this.cur[k];
      this.cur[k] += Math.abs(d) < step ? d : Math.sign(d) * step;
    }
    this.rainLevel = this.cur.rain; this.thunderLevel = this.cur.thunder * this.cur.rain;
    if (this.flash > 0) this.flash--;
    if (this.rainbow > 0 && this.rainLevel < 0.05) this.rainbow = Math.max(0, this.rainbow - 1 / 4000);
    if (this.rainLevel > 0.2) this.rainbow = Math.max(this.rainbow, 0);
  }
  rain(pt) { return lerp(this.prevRain, this.rainLevel, pt); }
  thunder(pt) { return lerp(this.prevThunder, this.thunderLevel, pt); }
}

// ---- Physical atmosphere (JS port of the LUT shader, coarse) for light & ambient colors ----
const RG = 6360e3, RT = 6460e3;
const RAY = [5.802e-6, 13.558e-6, 33.1e-6], MIE_S = 3.996e-6, MIE_E = 4.4e-6, OZ = [0.650e-6, 1.881e-6, 0.085e-6];
function raySphere(o, d, r) {
  const b = o[0] * d[0] + o[1] * d[1] + o[2] * d[2], c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - r * r;
  const D = b * b - c; if (D < 0) return [-1, -1];
  const s = Math.sqrt(D); return [-b - s, -b + s];
}
function ext(h) {
  const dr = Math.exp(-h / 8000), dm = Math.exp(-h / 1200), oz = Math.max(0, 1 - Math.abs(h - 25000) / 15000);
  return { rs: RAY.map(v => v * dr), ms: MIE_S * dm, e: RAY.map((v, i) => v * dr + MIE_E * dm + OZ[i] * oz) };
}
export function transmittance(p, d, n = 8) {
  const g = raySphere(p, d, RG);
  if (g[0] > 0) return [0, 0, 0];
  const t = raySphere(p, d, RT)[1];
  const dt = t / n; const od = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const q = [p[0] + d[0] * (i + 0.5) * dt, p[1] + d[1] * (i + 0.5) * dt, p[2] + d[2] * (i + 0.5) * dt];
    const h = Math.hypot(...q) - RG;
    const e = ext(h).e;
    for (let k = 0; k < 3; k++) od[k] += e[k] * dt;
  }
  return od.map(v => Math.exp(-v));
}
function skyRadiance(rd, L, alt, intensity) {
  const ro = [0, RG + alt, 0];
  const top = raySphere(ro, rd, RT), gnd = raySphere(ro, rd, RG);
  let tMax = top[1]; if (gnd[0] > 0) tMax = gnd[0];
  const N = 10;
  const c = rd[0] * L[0] + rd[1] * L[1] + rd[2] * L[2];
  const pr = 3 / (16 * Math.PI) * (1 + c * c);
  const g = 0.76, g2 = g * g;
  const pm = 3 / (8 * Math.PI) * ((1 - g2) * (1 + c * c)) / ((2 + g2) * Math.pow(1 + g2 - 2 * g * c, 1.5));
  const sum = [0, 0, 0], T = [1, 1, 1];
  let prev = 0;
  for (let i = 0; i < N; i++) {
    const t = tMax * Math.pow((i + 0.5) / N, 1.6);
    const dt = t - prev; prev = t;
    const p = [ro[0] + rd[0] * t, ro[1] + rd[1] * t, ro[2] + rd[2] * t];
    const h = Math.hypot(...p) - RG;
    const E = ext(h);
    const Ts = transmittance(p, L, 4);
    for (let k = 0; k < 3; k++) {
      const scat = (E.rs[k] * pr + E.ms * pm) * Ts[k];
      const ms2 = (E.rs[k] + E.ms) * 0.25 * (Ts[k] * 0.6 + 0.08) * (0.3 + 0.7 * clamp(L[1] * 4 + 0.5, 0, 1));
      const st = Math.exp(-E.e[k] * dt);
      const S = (scat + ms2) * intensity;
      sum[k] += T[k] * (S - S * st) / Math.max(E.e[k], 1e-9);
      T[k] *= st;
    }
  }
  return sum;
}

// Computes all per-frame sky/light values for both render modes.
export function computeEnvironment(game, pt) {
  const w = game.world, wt = game.weather;
  const dayTime = w.time + pt;
  const angle = celestialAngle(dayTime);
  const sunAngle = angle * Math.PI * 2;
  const rain = wt.rain(pt), thunder = wt.thunder(pt);
  const cam = game.camera;
  // ---- vanilla sky color (ClientLevel.getSkyColor) ----
  const biome = game.biomeAtCamera();
  let sky = biomeSkyColor(biome.temperature ?? 0.8);
  if (biome.skyColor !== undefined) sky = rgb24(biome.skyColor);
  const f1 = clamp(Math.cos(sunAngle) * 2 + 0.5, 0, 1);
  let [sr, sg, sb] = sky.map(v => v * f1);
  if (rain > 0) { const g = (sr * 0.3 + sg * 0.59 + sb * 0.11) * 0.6, k = 1 - rain * 0.75; sr = sr * k + g * (1 - k); sg = sg * k + g * (1 - k); sb = sb * k + g * (1 - k); }
  if (thunder > 0) { const g = (sr * 0.3 + sg * 0.59 + sb * 0.11) * 0.2, k = 1 - thunder * 0.75; sr = sr * k + g * (1 - k); sg = sg * k + g * (1 - k); sb = sb * k + g * (1 - k); }
  if (wt.flash > 0) { const f = Math.min(1, wt.flash - pt) * 0.45; sr = sr * (1 - f) + 0.8 * f; sg = sg * (1 - f) + 0.8 * f; sb = sb * (1 - f) + f; }
  // ---- sunrise color ----
  let sunrise = null;
  { const c = Math.cos(sunAngle); if (c >= -0.4 && c <= 0.4) { const f3 = c / 0.4 * 0.5 + 0.5; let f4 = 1 - (1 - Math.sin(f3 * Math.PI)) * 0.99; f4 *= f4; sunrise = [f3 * 0.3 + 0.7, f3 * f3 * 0.7 + 0.2, 0.2, f4]; } }
  // ---- fog color (FogRenderer.setupColor) ----
  const rd = game.settings.renderDistance;
  let ff = 0.25 + 0.75 * rd / 32; ff = 1 - Math.pow(ff, 0.25);
  const fogBase = biome.fogColor !== undefined ? rgb24(biome.fogColor) : [0.7529412, 0.84705883, 1];
  const f5 = clamp(Math.cos(sunAngle) * 2 + 0.5, 0, 1);
  let fog = [fogBase[0] * (f5 * 0.94 + 0.06), fogBase[1] * (f5 * 0.94 + 0.06), fogBase[2] * (f5 * 0.91 + 0.09)];
  if (rd >= 4 && sunrise) {
    const f7 = Math.sin(sunAngle) > 0 ? -1 : 1;
    let f8 = Math.max(0, cam.look[0] * f7);
    if (f8 > 0) { f8 *= sunrise[3]; fog = fog.map((v, i) => v * (1 - f8) + sunrise[i] * f8); }
  }
  fog = [fog[0] + (sr - fog[0]) * ff, fog[1] + (sg - fog[1]) * ff, fog[2] + (sb - fog[2]) * ff];
  if (rain > 0) { const a = 1 - rain * 0.5, b = 1 - rain * 0.4; fog = [fog[0] * a, fog[1] * a, fog[2] * b]; }
  if (thunder > 0) { const a = 1 - thunder * 0.5; fog = fog.map(v => v * a); }
  // void darkness
  const voidF = clamp((cam.pos[1] + 64) / 32, 0, 1);
  if (voidF < 1) { fog = fog.map(v => v * voidF * voidF); sr *= voidF; sg *= voidF; sb *= voidF; }
  // ---- sky darken (Level.getSkyDarken) for lightmap ----
  let sd = 1 - (Math.cos(sunAngle) * 2 + 0.2); sd = clamp(sd, 0, 1); sd = 1 - sd;
  sd *= 1 - rain * 5 / 16; sd *= 1 - thunder * 5 / 16;
  const skyDarken = sd * 0.8 + 0.2;
  // star brightness
  let star = 1 - (Math.cos(sunAngle) * 2 + 0.25); star = clamp(star, 0, 1); star = star * star * 0.5;
  // fog distances
  const viewDist = rd * 16;
  let fogStart = viewDist - clamp(viewDist / 10, 4, 64), fogEnd = viewDist;
  const fluid = game.player ? game.player.eyeFluid() : 0;
  let underwater = fluid === 1, inLava = fluid === 2;
  if (underwater) {
    const wf = biome.waterFogColor !== undefined ? rgb24(biome.waterFogColor) : [0.02, 0.02, 0.2];
    const light = game.cameraBrightness();
    fog = wf.map(v => v * clamp(light, 0.1, 1));
    fogStart = -8; fogEnd = 96 * (game.player.waterVision ?? 1);
  } else if (inLava) { fog = [0.6, 0.1, 0]; fogStart = 0.25; fogEnd = 1; }
  // weather fog in vanilla: thick fog during rain is not vanilla; keep vanilla distances
  const env = {
    time: game.renderTime, dayTime, timeOfDay: angle, sunAngle, rain, thunder,
    skyColor: [sr, sg, sb], fogColor: fog, sunrise, skyDarken, starBrightness: star * (1 - rain),
    fogStart, fogEnd, renderDistance: rd, moonPhase: Math.floor(dayTime / 24000) % 8,
    cameraBelowHorizon: cam.pos[1] - 63 < 0, underwater, inLava, skyFlash: wt.flash,
    wind: wt.cur.wind, clouds: wt.cur.clouds, cirrus: wt.cur.cirrus, weatherFog: wt.cur.fog, rainbow: wt.rainbow,
  };
  // ---- shader-mode light ----
  const sunDir = [-Math.sin(sunAngle), Math.cos(sunAngle), 0];
  // tilt the sun path slightly so shadows are never perfectly axis-aligned (like shaderpacks' sunPathRotation)
  const tilt = -0.35;
  const sDir = [sunDir[0], sunDir[1] * Math.cos(tilt), sunDir[1] * Math.sin(tilt)];
  const moonDir = [-sDir[0], -sDir[1], -sDir[2]];
  env.sunDir = sDir; env.moonDir = moonDir;
  const st = game._skyCache || (game._skyCache = { t: -1e9 });
  if (Math.abs(st.t - dayTime) > 4 || Math.abs((st.rain ?? 0) - rain) > 0.02 || st.forced) {
    st.t = dayTime; st.rain = rain; st.forced = false;
    const p0 = [0, RG + 500, 0];
    const sunT = transmittance(p0, [sDir[0], Math.max(sDir[1], -0.2), sDir[2]], 16);
    const moonT = transmittance(p0, [moonDir[0], Math.max(moonDir[1], -0.2), moonDir[2]], 16);
    const sunVis = smoothstep(-0.06, 0.03, sDir[1]);
    const moonVis = smoothstep(-0.06, 0.05, moonDir[1]);
    const sunI = 3.6, moonI = 0.075;
    st.sunColor = sunT.map(v => v * sunI * sunVis);
    st.moonColor = moonT.map((v, i) => v * moonI * moonVis * [0.75, 0.88, 1.25][i]);
    // ambient irradiance estimates
    const samp = (el, n) => {
      const acc = [0, 0, 0];
      for (let i = 0; i < n; i++) {
        const az = (i / n) * Math.PI * 2;
        const d = [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
        const r1 = skyRadiance(d, sDir, 500, 22), r2 = skyRadiance(d, moonDir, 500, 22 * 0.0025);
        for (let k = 0; k < 3; k++) acc[k] += (r1[k] + r2[k] * [0.7, 0.85, 1.25][k]) / n;
      }
      return acc;
    };
    const up = samp(1.2, 3), hz = samp(0.12, 6);
    st.ambUp = up.map(v => v * 2.2); st.ambHorizon = hz.map(v => v * 1.6);
  }
  const overcast = clamp((wt.cur.clouds - 0.6) / 0.4, 0, 1);
  const dim = 1 - 0.75 * Math.max(rain, overcast * 0.8);
  const sunUp = sDir[1] > -0.02;
  env.lightDir = sunUp ? sDir : moonDir;
  env.lightColor = (sunUp ? st.sunColor : st.moonColor).map(v => v * dim);
  env.sunColor = st.sunColor;
  const grey = (c) => { const g = (c[0] + c[1] + c[2]) / 3; return c.map(v => lerp(v, g, Math.max(rain, overcast) * 0.6)); };
  env.ambUp = grey(st.ambUp).map(v => v * (1 - 0.35 * rain) + 0.0004);
  env.ambHorizon = grey(st.ambHorizon).map(v => v * (1 - 0.35 * rain) + 0.0003);
  const groundAlb = 0.25;
  env.ambDown = env.lightColor.map((v, i) => v * Math.max(env.lightDir[1], 0) * groundAlb * 0.25 + env.ambHorizon[i] * 0.3);
  if (wt.flash > 0) { const f = Math.min(1, wt.flash - pt); env.ambUp = env.ambUp.map(v => v + f * 1.5); env.ambHorizon = env.ambHorizon.map(v => v + f * 1.0); }
  // star rotation (stars turn with the sky)
  const a = angle * Math.PI * 2;
  env.starRot = new Float32Array([1, 0, 0, 0, Math.cos(a), Math.sin(a), 0, -Math.sin(a), Math.cos(a)]);
  return env;
}
