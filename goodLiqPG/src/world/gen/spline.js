// Cubic splines and the overworld terrain-shaping splines (offset / factor / jaggedness),
// modelled on vanilla's TerrainProvider. Inputs: [continentalness, erosion, weirdness(ridges), peaksAndValleys].
export const C = 0, E = 1, W = 2, PV = 3;

class Spline {
  constructor(coord, points) {
    this.c = coord;
    this.locs = new Float64Array(points.map(p => p[0]));
    this.vals = points.map(p => p[1]);
    this.ders = new Float64Array(points.map(p => p[2] || 0));
  }
}
const S = (c, pts) => new Spline(c, pts);

export function evalSpline(s, inp) {
  if (typeof s === 'number') return s;
  const f = inp[s.c];
  const locs = s.locs, n = locs.length;
  let i = -1;
  while (i + 1 < n && locs[i + 1] <= f) i++;
  if (i < 0) {
    const v = evalSpline(s.vals[0], inp), d = s.ders[0];
    return d === 0 ? v : v + d * (f - locs[0]);
  }
  if (i === n - 1) {
    const v = evalSpline(s.vals[n - 1], inp), d = s.ders[n - 1];
    return d === 0 ? v : v + d * (f - locs[n - 1]);
  }
  const g = locs[i], h = locs[i + 1];
  const k = (f - g) / (h - g);
  const l = s.ders[i], m = s.ders[i + 1];
  const a = evalSpline(s.vals[i], inp), b = evalSpline(s.vals[i + 1], inp);
  const p = l * (h - g) - (b - a);
  const q = -m * (h - g) + (b - a);
  return a + k * (b - a) + k * (1 - k) * (p + k * (q - p));
}

const lerp = (t, a, b) => a + t * (b - a);
export const peaksAndValleys = (w) => -(Math.abs(Math.abs(w) - 0.6666667) - 0.33333334) * 3;

function mountainContinentalness(f, g, h) {
  const k = 1 - (1 - g) * 0.5, l = 0.5 * (1 - g);
  const n = (f + 1.17) * 0.46082947 * k - l;
  return f < h ? Math.max(n, -0.2222) : Math.max(n, 0);
}
function ridgeZeroPoint(f) {
  const i = 1 - (1 - f) * 0.5, j = 0.5 * (1 - f);
  return j / (0.46082947 * i) - 1.17;
}
const slope = (f, g, h, i) => (g - f) / (i - h);

function mountainRidge(f, bl) {
  const pts = [];
  const i = mountainContinentalness(-1, f, -0.7);
  const k = mountainContinentalness(1, f, -0.7);
  const l = ridgeZeroPoint(f);
  if (-0.65 < l && l < 1) {
    const n = mountainContinentalness(-0.65, f, -0.7);
    const p = mountainContinentalness(-0.75, f, -0.7);
    const q = slope(i, p, -1, -0.75);
    pts.push([-1, i, q], [-0.75, p], [-0.65, n]);
    const r = mountainContinentalness(l, f, -0.7);
    const s = slope(r, k, l, 1);
    pts.push([l - 0.01, r], [l, r, s], [1, k, s]);
  } else {
    const n = slope(i, k, -1, 1);
    if (bl) pts.push([-1, Math.max(0.2, i)], [0, lerp(0.5, i, k), n]);
    else pts.push([-1, i, n]);
    pts.push([1, k, n]);
  }
  return S(PV, pts);
}

function ridgeSpline(f, g, h, i, j, k) {
  const l = Math.max(0.5 * (g - f), k);
  const m = 5 * (h - g);
  return S(PV, [[-1, f, l], [-0.4, g, Math.min(l, m)], [0, h, m], [0.4, i, 2 * (i - h)], [1, j, 0.7 * (j - i)]]);
}

function erosionOffset(f, g, h, i, j, k, bl, bl2) {
  const s1 = mountainRidge(lerp(i, 0.6, 1.5), bl2);
  const s2 = mountainRidge(lerp(i, 0.6, 1.0), bl2);
  const s3 = mountainRidge(i, bl2);
  const s4 = ridgeSpline(f - 0.15, 0.5 * i, 0.5 * i, 0.5 * i, 0.6 * i, 0.5);
  const s5 = ridgeSpline(f, j * i, g * i, 0.5 * i, 0.6 * i, 0.5);
  const s6 = ridgeSpline(f, j, j, g, h, 0.5);
  const s7 = ridgeSpline(f, j, j, g, h, 0.5);
  const s8 = S(PV, [[-1, f], [-0.4, s6], [0, h + 0.07]]);
  const s9 = ridgeSpline(-0.02, k, k, g, h, 0);
  const pts = [[-0.85, s1], [-0.7, s2], [-0.4, s3], [-0.35, s4], [-0.1, s5], [0.2, s6]];
  if (bl) pts.push([0.4, s7], [0.45, s8], [0.55, s8], [0.58, s7]);
  pts.push([0.7, s9]);
  return S(E, pts);
}

export function overworldOffset() {
  const s1 = erosionOffset(-0.15, 0, 0, 0.1, 0, -0.03, false, false);
  const s2 = erosionOffset(-0.1, 0.03, 0.1, 0.1, 0.01, -0.03, false, false);
  const s3 = erosionOffset(-0.1, 0.03, 0.1, 0.7, 0.01, -0.03, true, true);
  const s4 = erosionOffset(-0.05, 0.03, 0.1, 1.0, 0.01, 0.01, true, true);
  return S(C, [[-1.1, 0.044], [-1.02, -0.2222], [-0.51, -0.2222], [-0.44, -0.12], [-0.18, -0.12],
    [-0.16, s1], [-0.15, s1], [-0.1, s2], [0.25, s3], [1.0, s4]]);
}

function erosionFactor(f, bl) {
  const sp = S(W, [[-0.2, 6.3], [0.2, f]]);
  const pts = [[-0.6, sp], [-0.5, S(W, [[-0.05, 6.3], [0.05, 2.67]])], [-0.35, sp], [-0.25, sp],
    [-0.1, S(W, [[-0.05, 2.67], [0.05, 6.3]])], [0.03, sp]];
  if (bl) {
    const sp2 = S(W, [[0, f], [0.1, 0.625]]);
    const sp3 = S(PV, [[-0.9, f], [-0.69, sp2]]);
    pts.push([0.35, f], [0.45, sp3], [0.55, sp3], [0.62, f]);
  } else {
    const sp2 = S(PV, [[-0.7, sp], [-0.15, 1.37]]);
    const sp3 = S(PV, [[0.45, sp], [0.7, 1.56]]);
    pts.push([0.05, sp3], [0.4, sp3], [0.45, sp2], [0.55, sp2], [0.58, f]);
  }
  return S(E, pts);
}

export function overworldFactor() {
  return S(C, [[-0.19, 3.95], [-0.15, erosionFactor(6.25, true)], [-0.1, erosionFactor(5.47, true)],
    [0.03, erosionFactor(5.08, true)], [0.06, erosionFactor(4.69, false)]]);
}

function weirdJag(f) { return S(W, [[-0.01, 0.63 * f], [0.01, 0.3 * f]]); }
function ridgeJag(f, g) {
  const h = peaksAndValleys(0.4), i = peaksAndValleys(0.56666666), j = (h + i) / 2;
  return S(PV, [[h, 0], [j, g > 0 ? weirdJag(g) : 0], [1, f > 0 ? weirdJag(f) : 0]]);
}
function erosionJag(f, g, h, i) {
  const s = ridgeJag(f, h), s2 = ridgeJag(g, i);
  return S(E, [[-1, s], [-0.78, s2], [-0.5775, s2], [-0.375, 0]]);
}
export function overworldJaggedness() {
  return S(C, [[-0.11, 0], [0.03, erosionJag(1, 0.5, 0, 0)], [0.65, erosionJag(1, 1, 1, 0)]]);
}
