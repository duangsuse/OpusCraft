// Overworld biome registry (vanilla 1.20 values) and the multi-noise biome table (port of OverworldBiomeBuilder logic).

// Vanilla sky color: hsv(0.6222 - t*0.05, 0.5 + t*0.1, 1) with t = clamp(temperature / 3, -1, 1)
export function skyColorFor(temperature) {
  let g = Math.max(-1, Math.min(1, temperature / 3));
  const h = 0.62222224 - g * 0.05, s = 0.5 + g * 0.1, v = 1;
  const i = Math.floor(h * 6) % 6, f = h * 6 - Math.floor(h * 6);
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  let r, gg, b;
  switch (i) {
    case 0: r = v; gg = t; b = p; break;
    case 1: r = q; gg = v; b = p; break;
    case 2: r = p; gg = v; b = t; break;
    case 3: r = p; gg = q; b = v; break;
    case 4: r = t; gg = p; b = v; break;
    default: r = v; gg = p; b = q; break;
  }
  const c = (x) => Math.max(0, Math.min(255, Math.floor(x * 255)));
  return (c(r) << 16) | (c(gg) << 8) | c(b);
}

// Approximation of vanilla's grass/foliage colormap (triangle lookup on temperature, downfall*temperature),
// fitted to the colormap corner/sample colors.
function triLookup(temp, downfall, cLush, cDry, cCold) {
  const t = Math.max(0, Math.min(1, temp));
  const d = Math.max(0, Math.min(1, downfall)) * t;
  const wC = 1 - t, wL = d, wD = t - d;
  let out = 0;
  for (let s = 16; s >= 0; s -= 8) {
    const v = wL * ((cLush >> s) & 255) + wD * ((cDry >> s) & 255) + wC * ((cCold >> s) & 255);
    out |= (Math.max(0, Math.min(255, Math.round(v))) << s);
  }
  return out;
}
export const grassColormap = (temp, downfall) => triLookup(temp, downfall, 0x47cd33, 0xbfb755, 0x80b497);
export const foliageColormap = (temp, downfall) => triLookup(temp, downfall, 0x1abf00, 0xaea42a, 0x60a17b);

const DEF_WATER = 0x3f76e4, DEF_FOG = 0x050533;
// name, temperature, downfall, precipitation, extra
const RAW = [
  ['ocean', 0.5, 0.5, 'rain', { cat: 'ocean' }],
  ['deep_ocean', 0.5, 0.5, 'rain', { cat: 'ocean', deep: true }],
  ['frozen_ocean', 0.0, 0.5, 'snow', { cat: 'ocean', water: 0x3938c9, frozen: true }],
  ['deep_frozen_ocean', 0.5, 0.5, 'rain', { cat: 'ocean', deep: true, water: 0x3938c9, frozen: true }],
  ['cold_ocean', 0.5, 0.5, 'rain', { cat: 'ocean', water: 0x3d57d6 }],
  ['deep_cold_ocean', 0.5, 0.5, 'rain', { cat: 'ocean', deep: true, water: 0x3d57d6 }],
  ['lukewarm_ocean', 0.5, 0.5, 'rain', { cat: 'ocean', water: 0x45adf2, fog: 0x041633 }],
  ['deep_lukewarm_ocean', 0.5, 0.5, 'rain', { cat: 'ocean', deep: true, water: 0x45adf2, fog: 0x041633 }],
  ['warm_ocean', 0.5, 0.5, 'rain', { cat: 'ocean', water: 0x43d5ee, fog: 0x041f33 }],
  ['river', 0.5, 0.5, 'rain', { cat: 'river' }],
  ['frozen_river', 0.0, 0.5, 'snow', { cat: 'river', water: 0x3938c9 }],
  ['beach', 0.8, 0.4, 'rain', { cat: 'beach' }],
  ['snowy_beach', 0.05, 0.3, 'snow', { cat: 'beach', water: 0x3d57d6 }],
  ['stony_shore', 0.2, 0.3, 'rain', { cat: 'beach' }],
  ['plains', 0.8, 0.4, 'rain', {}],
  ['sunflower_plains', 0.8, 0.4, 'rain', {}],
  ['snowy_plains', 0.0, 0.5, 'snow', {}],
  ['ice_spikes', 0.0, 0.5, 'snow', {}],
  ['desert', 2.0, 0.0, 'none', {}],
  ['swamp', 0.8, 0.9, 'rain', { water: 0x617b64, fog: 0x232317, grass: 0x6a7039, foliage: 0x6a7039 }],
  ['forest', 0.7, 0.8, 'rain', {}],
  ['flower_forest', 0.7, 0.8, 'rain', {}],
  ['birch_forest', 0.6, 0.6, 'rain', {}],
  ['old_growth_birch_forest', 0.6, 0.6, 'rain', {}],
  ['dark_forest', 0.7, 0.8, 'rain', { darkForest: true }],
  ['taiga', 0.25, 0.8, 'rain', {}],
  ['snowy_taiga', -0.5, 0.4, 'snow', { water: 0x3d57d6 }],
  ['old_growth_pine_taiga', 0.3, 0.8, 'rain', {}],
  ['old_growth_spruce_taiga', 0.25, 0.8, 'rain', {}],
  ['jungle', 0.95, 0.9, 'rain', {}],
  ['sparse_jungle', 0.95, 0.8, 'rain', {}],
  ['savanna', 2.0, 0.0, 'none', {}],
  ['savanna_plateau', 2.0, 0.0, 'none', {}],
  ['windswept_savanna', 2.0, 0.0, 'none', {}],
  ['windswept_hills', 0.2, 0.3, 'rain', {}],
  ['windswept_gravelly_hills', 0.2, 0.3, 'rain', {}],
  ['windswept_forest', 0.2, 0.3, 'rain', {}],
  ['meadow', 0.5, 0.8, 'rain', { water: 0x0e4ecf }],
  ['cherry_grove', 0.5, 0.8, 'rain', { water: 0x5db7ef, fog: 0x5db7ef, grass: 0xb6db61, foliage: 0xb6db61 }],
  ['grove', -0.2, 0.8, 'snow', {}],
  ['snowy_slopes', -0.3, 0.9, 'snow', {}],
  ['frozen_peaks', -0.7, 0.9, 'snow', {}],
  ['jagged_peaks', -0.7, 0.9, 'snow', {}],
  ['stony_peaks', 1.0, 0.3, 'rain', {}],
  ['badlands', 2.0, 0.0, 'none', { grass: 0x90814d, foliage: 0x9e814d }],
  ['eroded_badlands', 2.0, 0.0, 'none', { grass: 0x90814d, foliage: 0x9e814d }],
  ['wooded_badlands', 2.0, 0.0, 'none', { grass: 0x90814d, foliage: 0x9e814d }],
  ['mushroom_fields', 0.9, 1.0, 'rain', {}],
];

// Exact vanilla colormap results for each biome's temperature/downfall (the fitted triangle above is only approximate).
const EXACT_GRASS = {
  ocean: 0x8eb971, deep_ocean: 0x8eb971, deep_frozen_ocean: 0x8eb971, cold_ocean: 0x8eb971, deep_cold_ocean: 0x8eb971, lukewarm_ocean: 0x8eb971,
  deep_lukewarm_ocean: 0x8eb971, warm_ocean: 0x8eb971, river: 0x8eb971, frozen_ocean: 0x80b497, frozen_river: 0x80b497,
  beach: 0x91bd59, snowy_beach: 0x83b593, stony_shore: 0x8ab689, plains: 0x91bd59, sunflower_plains: 0x91bd59,
  snowy_plains: 0x80b497, ice_spikes: 0x80b497, desert: 0xbfb755, forest: 0x79c05a, flower_forest: 0x79c05a,
  birch_forest: 0x88bb67, old_growth_birch_forest: 0x88bb67, dark_forest: 0x79c05a, taiga: 0x86b783, snowy_taiga: 0x80b497,
  old_growth_pine_taiga: 0x86b87f, old_growth_spruce_taiga: 0x86b783, jungle: 0x59c93c, sparse_jungle: 0x64c73f,
  savanna: 0xbfb755, savanna_plateau: 0xbfb755, windswept_savanna: 0xbfb755, windswept_hills: 0x8ab689,
  windswept_gravelly_hills: 0x8ab689, windswept_forest: 0x8ab689, meadow: 0x83bb6d, grove: 0x80b497, snowy_slopes: 0x80b497,
  frozen_peaks: 0x80b497, jagged_peaks: 0x80b497, stony_peaks: 0x9abe4b, mushroom_fields: 0x55c93f,
};
const EXACT_FOLIAGE = {
  ocean: 0x71a74d, deep_ocean: 0x71a74d, deep_frozen_ocean: 0x71a74d, cold_ocean: 0x71a74d, deep_cold_ocean: 0x71a74d, lukewarm_ocean: 0x71a74d,
  deep_lukewarm_ocean: 0x71a74d, warm_ocean: 0x71a74d, river: 0x71a74d, frozen_ocean: 0x60a17b, frozen_river: 0x60a17b,
  beach: 0x77ab2f, snowy_beach: 0x64a278, stony_shore: 0x6da36b, plains: 0x77ab2f, sunflower_plains: 0x77ab2f,
  snowy_plains: 0x60a17b, ice_spikes: 0x60a17b, desert: 0xaea42a, forest: 0x59ae30, flower_forest: 0x59ae30,
  birch_forest: 0x6ba941, old_growth_birch_forest: 0x6ba941, dark_forest: 0x59ae30, taiga: 0x68a464, snowy_taiga: 0x60a17b,
  old_growth_pine_taiga: 0x68a55f, old_growth_spruce_taiga: 0x68a464, jungle: 0x30bb0b, sparse_jungle: 0x3eb80f,
  savanna: 0xaea42a, savanna_plateau: 0xaea42a, windswept_savanna: 0xaea42a, windswept_hills: 0x6da36b,
  windswept_gravelly_hills: 0x6da36b, windswept_forest: 0x6da36b, meadow: 0x63a948, grove: 0x60a17b, snowy_slopes: 0x60a17b,
  frozen_peaks: 0x60a17b, jagged_peaks: 0x60a17b, stony_peaks: 0x82ac1e, mushroom_fields: 0x2bbb0f,
};

const title = (n) => n.split('_').map(s => s[0].toUpperCase() + s.slice(1)).join(' ');

export const BIOMES = RAW.map(([name, temperature, downfall, precipitation, x], id) => {
  let grass = x.grass ?? EXACT_GRASS[name] ?? grassColormap(temperature, downfall);
  const foliage = x.foliage ?? EXACT_FOLIAGE[name] ?? foliageColormap(temperature, downfall);
  if (x.darkForest) grass = (((grass & 0xfefefe) + 0x28340a) >> 1);   // vanilla dark forest grass modifier
  return {
    id, name, displayName: title(name), temperature, downfall, precipitation,
    waterColor: x.water ?? DEF_WATER, waterFogColor: x.fog ?? DEF_FOG,
    skyColor: skyColorFor(temperature), fogColor: 0xc0d8ff,
    grassColor: grass, foliageColor: foliage,
    category: x.cat || 'land', deep: !!x.deep, frozen: !!x.frozen,
  };
});

export const B = Object.create(null);
for (const b of BIOMES) B[b.name] = b.id;

// Convenience arrays for renderers: index by biome id
export const BIOME_COLORS = {
  grass: BIOMES.map(b => b.grassColor), foliage: BIOMES.map(b => b.foliageColor), water: BIOMES.map(b => b.waterColor),
  sky: BIOMES.map(b => b.skyColor), fog: BIOMES.map(b => b.fogColor), waterFog: BIOMES.map(b => b.waterFogColor),
};

// ---- Multi-noise biome table ---------------------------------------------------------------------------
const _ = -1;
const OCEANS = [
  [B.deep_frozen_ocean, B.deep_cold_ocean, B.deep_ocean, B.deep_lukewarm_ocean, B.warm_ocean],
  [B.frozen_ocean, B.cold_ocean, B.ocean, B.lukewarm_ocean, B.warm_ocean],
];
const MIDDLE = [
  [B.snowy_plains, B.snowy_plains, B.snowy_plains, B.snowy_taiga, B.taiga],
  [B.plains, B.plains, B.forest, B.taiga, B.old_growth_spruce_taiga],
  [B.flower_forest, B.plains, B.forest, B.birch_forest, B.dark_forest],
  [B.savanna, B.savanna, B.forest, B.jungle, B.jungle],
  [B.desert, B.desert, B.desert, B.desert, B.desert],
];
const MIDDLE_V = [
  [B.ice_spikes, _, B.snowy_taiga, _, _],
  [_, _, _, _, B.old_growth_pine_taiga],
  [B.sunflower_plains, _, _, B.old_growth_birch_forest, _],
  [_, _, B.plains, B.sparse_jungle, B.jungle /* bamboo_jungle */],
  [_, _, _, _, _],
];
const PLATEAU = [
  [B.snowy_plains, B.snowy_plains, B.snowy_plains, B.snowy_taiga, B.snowy_taiga],
  [B.meadow, B.meadow, B.forest, B.taiga, B.old_growth_spruce_taiga],
  [B.meadow, B.meadow, B.meadow, B.meadow, B.dark_forest],
  [B.savanna_plateau, B.savanna_plateau, B.forest, B.forest, B.jungle],
  [B.badlands, B.badlands, B.badlands, B.wooded_badlands, B.wooded_badlands],
];
const PLATEAU_V = [
  [B.ice_spikes, _, _, _, _],
  [B.cherry_grove, _, B.meadow, B.meadow, B.old_growth_pine_taiga],
  [B.cherry_grove, B.cherry_grove, B.forest, B.birch_forest, _],
  [_, _, _, _, _],
  [B.eroded_badlands, B.eroded_badlands, _, _, _],
];
const SHATTERED = [
  [B.windswept_gravelly_hills, B.windswept_gravelly_hills, B.windswept_hills, B.windswept_forest, B.windswept_forest],
  [B.windswept_gravelly_hills, B.windswept_gravelly_hills, B.windswept_hills, B.windswept_forest, B.windswept_forest],
  [B.windswept_hills, B.windswept_hills, B.windswept_hills, B.windswept_forest, B.windswept_forest],
  [_, _, _, _, _],
  [_, _, _, _, _],
];

const middle = (t, h, v) => (v && MIDDLE_V[t][h] >= 0) ? MIDDLE_V[t][h] : MIDDLE[t][h];
const badlands = (h, v) => h < 2 ? (v ? B.eroded_badlands : B.badlands) : h < 3 ? B.badlands : B.wooded_badlands;
const midOrBad = (t, h, v) => t === 4 ? badlands(h, v) : middle(t, h, v);
const plateau = (t, h, v) => (v && PLATEAU_V[t][h] >= 0) ? PLATEAU_V[t][h] : PLATEAU[t][h];
const slope = (t, h, v) => t >= 3 ? plateau(t, h, v) : (h <= 1 ? B.snowy_slopes : B.grove);
const midOrBadOrSlope = (t, h, v) => t === 0 ? slope(t, h, v) : midOrBad(t, h, v);
const peak = (t, h, v) => t <= 2 ? (v ? B.frozen_peaks : B.jagged_peaks) : t === 3 ? B.stony_peaks : badlands(h, v);
const shattered = (t, h, v) => SHATTERED[t][h] >= 0 ? SHATTERED[t][h] : middle(t, h, v);
const windswept = (t, h, v, fb) => (t > 1 && h < 4 && v) ? B.windswept_savanna : fb;
const beach = (t) => t === 0 ? B.snowy_beach : t === 4 ? B.desert : B.beach;
const shatteredCoast = (t, h, v) => windswept(t, h, v, v ? middle(t, h, v) : beach(t));
const swampy = (t, h, v) => t === 0 ? middle(t, h, v) : B.swamp; // mangrove_swamp -> swamp

// ci: 0 coast, 1 near inland, 2 mid inland, 3 far inland
function peaksSlice(t, h, ci, e, v) {
  switch (e) {
    case 0: return peak(t, h, v);
    case 1: return ci <= 1 ? midOrBadOrSlope(t, h, v) : peak(t, h, v);
    case 2: return ci <= 1 ? middle(t, h, v) : plateau(t, h, v);
    case 3: return ci <= 1 ? middle(t, h, v) : ci === 2 ? midOrBad(t, h, v) : plateau(t, h, v);
    case 4: return middle(t, h, v);
    case 5: return ci <= 1 ? windswept(t, h, v, shattered(t, h, v)) : shattered(t, h, v);
    default: return middle(t, h, v);
  }
}
function highSlice(t, h, ci, e, v) {
  switch (e) {
    case 0: return ci === 0 ? middle(t, h, v) : ci === 1 ? slope(t, h, v) : peak(t, h, v);
    case 1: return ci === 0 ? middle(t, h, v) : ci === 1 ? midOrBadOrSlope(t, h, v) : slope(t, h, v);
    case 2: return ci <= 1 ? middle(t, h, v) : plateau(t, h, v);
    case 3: return ci <= 1 ? middle(t, h, v) : ci === 2 ? midOrBad(t, h, v) : plateau(t, h, v);
    case 4: return middle(t, h, v);
    case 5: return ci <= 1 ? windswept(t, h, v, middle(t, h, v)) : shattered(t, h, v);
    default: return middle(t, h, v);
  }
}
function midSlice(t, h, ci, e, v) {
  if (ci === 0 && e <= 2) return B.stony_shore;
  switch (e) {
    case 0: return slope(t, h, v);
    case 1: return ci <= 2 ? midOrBadOrSlope(t, h, v) : (t === 0 ? slope(t, h, v) : plateau(t, h, v));
    case 2: return ci === 1 ? middle(t, h, v) : ci === 2 ? midOrBad(t, h, v) : plateau(t, h, v);
    case 3: return ci <= 1 ? middle(t, h, v) : midOrBad(t, h, v);
    case 4: return (!v && ci === 0) ? beach(t) : middle(t, h, v);
    case 5: return ci === 0 ? shatteredCoast(t, h, v) : ci === 1 ? windswept(t, h, v, middle(t, h, v)) : shattered(t, h, v);
    default: return ci === 0 ? (v ? middle(t, h, v) : beach(t)) : swampy(t, h, v);
  }
}
function lowSlice(t, h, ci, e, v) {
  if (ci === 0 && e <= 2) return B.stony_shore;
  switch (e) {
    case 0: case 1: return ci === 1 ? midOrBad(t, h, v) : midOrBadOrSlope(t, h, v);
    case 2: return ci === 1 ? middle(t, h, v) : midOrBad(t, h, v);
    case 3: return ci === 0 ? beach(t) : ci === 1 ? middle(t, h, v) : midOrBad(t, h, v);
    case 4: return ci === 0 ? beach(t) : middle(t, h, v);
    case 5: return ci === 0 ? shatteredCoast(t, h, v) : ci === 1 ? windswept(t, h, v, middle(t, h, v)) : middle(t, h, v);
    default: return ci === 0 ? beach(t) : swampy(t, h, v);
  }
}
function valleySlice(t, h, ci, e, v) {
  const river = t === 0 ? B.frozen_river : B.river;
  if (e <= 1) return ci <= 1 ? river : midOrBad(t, h, v);
  if (e <= 5) return river;
  return ci === 0 ? river : (t === 0 ? B.frozen_river : B.swamp);
}

// Climate values in vanilla's [-1, 1]-ish ranges -> biome id
export function pickBiome(T, H, C, E, Wd) {
  if (C < -1.05) return B.mushroom_fields;
  const t = T < -0.45 ? 0 : T < -0.15 ? 1 : T < 0.2 ? 2 : T < 0.55 ? 3 : 4;
  if (C < -0.455) return OCEANS[0][t];
  if (C < -0.19) return OCEANS[1][t];
  const h = H < -0.35 ? 0 : H < -0.1 ? 1 : H < 0.1 ? 2 : H < 0.3 ? 3 : 4;
  const e = E < -0.78 ? 0 : E < -0.375 ? 1 : E < -0.2225 ? 2 : E < 0.05 ? 3 : E < 0.45 ? 4 : E < 0.55 ? 5 : 6;
  const ci = C < -0.11 ? 0 : C < 0.03 ? 1 : C < 0.3 ? 2 : 3;
  const v = Wd >= -0.05;
  const a = Math.abs(Wd);
  if (a < 0.05) return valleySlice(t, h, ci, e, v);
  if (a < 0.26666668) return lowSlice(t, h, ci, e, v);
  if (a < 0.4) return midSlice(t, h, ci, e, v);
  if (a < 0.56666666) return highSlice(t, h, ci, e, v);
  if (a < 0.7666667) return peaksSlice(t, h, ci, e, v);
  if (a < 0.93333334) return highSlice(t, h, ci, e, v);
  return midSlice(t, h, ci, e, v);
}

// Biome classification helpers (by id)
const S = (...names) => { const a = new Uint8Array(BIOMES.length); for (const n of names) a[B[n]] = 1; return a; };
export const IS_OCEAN = S('ocean', 'deep_ocean', 'frozen_ocean', 'deep_frozen_ocean', 'cold_ocean', 'deep_cold_ocean', 'lukewarm_ocean', 'deep_lukewarm_ocean', 'warm_ocean');
export const IS_RIVER = S('river', 'frozen_river');
export const IS_BEACH = S('beach', 'snowy_beach', 'stony_shore');
export const IS_BADLANDS = S('badlands', 'eroded_badlands', 'wooded_badlands');
export const IS_MOUNTAIN = S('jagged_peaks', 'frozen_peaks', 'stony_peaks', 'snowy_slopes', 'grove', 'meadow', 'cherry_grove', 'windswept_hills', 'windswept_gravelly_hills', 'windswept_forest');
