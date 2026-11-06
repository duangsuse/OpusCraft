// Minecraft default bitmap font (recreation of vanilla ascii.png, codepoints 32..126).
// Each glyph is 8 rows tall: rows 0..6 hold caps/digits (baseline under row 6), row 7 is for descenders.
// Glyph width = row string length; advance = width + 1 (space: width 3 -> advance 4). Line height 9.
// Pure JS: measureText / getGlyph / textToImageData work without a DOM (Node-testable).

export const LINE_HEIGHT = 9;
export const GLYPH_HEIGHT = 8;

// vanilla chat formatting palette (§0..§f)
export const FORMAT_COLORS = {
  '0': 0x000000, '1': 0x0000AA, '2': 0x00AA00, '3': 0x00AAAA, '4': 0xAA0000, '5': 0xAA00AA, '6': 0xFFAA00, '7': 0xAAAAAA,
  '8': 0x555555, '9': 0x5555FF, 'a': 0x55FF55, 'b': 0x55FFFF, 'c': 0xFF5555, 'd': 0xFF55FF, 'e': 0xFFFF55, 'f': 0xFFFFFF,
};

// Glyph table. 8 rows each; '#' = ink, '.' = empty.
const G = {
  ' ': ['...', '...', '...', '...', '...', '...', '...', '...'],
  '!': ['#', '#', '#', '#', '#', '.', '#', '.'],
  '"': ['#.#', '#.#', '...', '...', '...', '...', '...', '...'],
  '#': ['.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.', '.....'],
  '$': ['..#..', '.####', '#....', '.###.', '....#', '####.', '..#..', '.....'],
  '%': ['#...#', '#..#.', '...#.', '..#..', '.#...', '.#..#', '#...#', '.....'],
  '&': ['..#..', '.#.#.', '..#..', '.##.#', '#..#.', '#..#.', '.##.#', '.....'],
  "'": ['#', '#', '.', '.', '.', '.', '.', '.'],
  '(': ['..##', '.#..', '#...', '#...', '#...', '.#..', '..##', '....'],
  ')': ['##..', '..#.', '...#', '...#', '...#', '..#.', '##..', '....'],
  '*': ['....', '....', '#..#', '.##.', '#..#', '....', '....', '....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....', '.....'],
  ',': ['.', '.', '.', '.', '.', '.', '#', '#'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....', '.....'],
  '.': ['.', '.', '.', '.', '.', '.', '#', '.'],
  '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....', '.....'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.', '.....'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '#####', '.....'],
  '2': ['.###.', '#...#', '....#', '..##.', '.#...', '#...#', '#####', '.....'],
  '3': ['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.', '.....'],
  '4': ['...##', '..#.#', '.#..#', '#...#', '#####', '....#', '....#', '.....'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.', '.....'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.', '.....'],
  '7': ['#####', '#...#', '....#', '...#.', '..#..', '..#..', '..#..', '.....'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.', '.....'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..', '.....'],
  ':': ['.', '.', '#', '.', '.', '.', '#', '.'],
  ';': ['.', '.', '#', '.', '.', '.', '#', '#'],
  '<': ['...#', '..#.', '.#..', '#...', '.#..', '..#.', '...#', '....'],
  '=': ['.....', '.....', '#####', '.....', '.....', '#####', '.....', '.....'],
  '>': ['#...', '.#..', '..#.', '...#', '..#.', '.#..', '#...', '....'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..', '.....'],
  '@': ['.####.', '#....#', '#.##.#', '#.##.#', '#.####', '#.....', '.####.', '......'],
  'A': ['.###.', '#...#', '#####', '#...#', '#...#', '#...#', '#...#', '.....'],
  'B': ['####.', '#...#', '####.', '#...#', '#...#', '#...#', '####.', '.....'],
  'C': ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.', '.....'],
  'D': ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.', '.....'],
  'E': ['#####', '#....', '###..', '#....', '#....', '#....', '#####', '.....'],
  'F': ['#####', '#....', '###..', '#....', '#....', '#....', '#....', '.....'],
  'G': ['.####', '#....', '#..##', '#...#', '#...#', '#...#', '.###.', '.....'],
  'H': ['#...#', '#...#', '#####', '#...#', '#...#', '#...#', '#...#', '.....'],
  'I': ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###', '...'],
  'J': ['....#', '....#', '....#', '....#', '....#', '#...#', '.###.', '.....'],
  'K': ['#...#', '#..#.', '###..', '#..#.', '#...#', '#...#', '#...#', '.....'],
  'L': ['#....', '#....', '#....', '#....', '#....', '#....', '#####', '.....'],
  'M': ['#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#', '#...#', '.....'],
  'N': ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#', '.....'],
  'O': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.', '.....'],
  'P': ['####.', '#...#', '####.', '#....', '#....', '#....', '#....', '.....'],
  'Q': ['.###.', '#...#', '#...#', '#...#', '#...#', '#..#.', '.##.#', '.....'],
  'R': ['####.', '#...#', '####.', '#...#', '#...#', '#...#', '#...#', '.....'],
  'S': ['.####', '#....', '.###.', '....#', '....#', '#...#', '.###.', '.....'],
  'T': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..', '.....'],
  'U': ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.', '.....'],
  'V': ['#...#', '#...#', '#...#', '#...#', '.#.#.', '.#.#.', '..#..', '.....'],
  'W': ['#...#', '#...#', '#...#', '#...#', '#.#.#', '##.##', '#...#', '.....'],
  'X': ['#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#', '#...#', '.....'],
  'Y': ['#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..', '..#..', '.....'],
  'Z': ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####', '.....'],
  '[': ['###', '#..', '#..', '#..', '#..', '#..', '###', '...'],
  '\\': ['#....', '.#...', '.#...', '..#..', '...#.', '...#.', '....#', '.....'],
  ']': ['###', '..#', '..#', '..#', '..#', '..#', '###', '...'],
  '^': ['..#..', '.#.#.', '#...#', '.....', '.....', '.....', '.....', '.....'],
  '_': ['.....', '.....', '.....', '.....', '.....', '.....', '.....', '#####'],
  '`': ['#.', '.#', '..', '..', '..', '..', '..', '..'],
  'a': ['.....', '.....', '.###.', '....#', '.####', '#...#', '.####', '.....'],
  'b': ['#....', '#....', '#.##.', '##..#', '#...#', '#...#', '####.', '.....'],
  'c': ['.....', '.....', '.###.', '#...#', '#....', '#...#', '.###.', '.....'],
  'd': ['....#', '....#', '.##.#', '#..##', '#...#', '#...#', '.####', '.....'],
  'e': ['.....', '.....', '.###.', '#...#', '#####', '#....', '.####', '.....'],
  'f': ['..##', '.#..', '####', '.#..', '.#..', '.#..', '.#..', '....'],
  'g': ['.....', '.....', '.####', '#...#', '#...#', '.####', '....#', '####.'],
  'h': ['#....', '#....', '#.##.', '##..#', '#...#', '#...#', '#...#', '.....'],
  'i': ['#', '.', '#', '#', '#', '#', '#', '.'],
  'j': ['....#', '.....', '....#', '....#', '....#', '#...#', '#...#', '.###.'],
  'k': ['#...', '#...', '#..#', '#.#.', '##..', '#.#.', '#..#', '....'],
  'l': ['#.', '#.', '#.', '#.', '#.', '#.', '.#', '..'],
  'm': ['.....', '.....', '##.#.', '#.#.#', '#.#.#', '#...#', '#...#', '.....'],
  'n': ['.....', '.....', '####.', '#...#', '#...#', '#...#', '#...#', '.....'],
  'o': ['.....', '.....', '.###.', '#...#', '#...#', '#...#', '.###.', '.....'],
  'p': ['.....', '.....', '#.##.', '##..#', '#...#', '####.', '#....', '#....'],
  'q': ['.....', '.....', '.##.#', '#..##', '#...#', '.####', '....#', '....#'],
  'r': ['.....', '.....', '#.##.', '##..#', '#....', '#....', '#....', '.....'],
  's': ['.....', '.....', '.####', '#....', '.###.', '....#', '####.', '.....'],
  't': ['...', '.#.', '###', '.#.', '.#.', '.#.', '..#', '...'],
  'u': ['.....', '.....', '#...#', '#...#', '#...#', '#...#', '.####', '.....'],
  'v': ['.....', '.....', '#...#', '#...#', '#...#', '.#.#.', '..#..', '.....'],
  'w': ['.....', '.....', '#...#', '#...#', '#.#.#', '#.#.#', '.####', '.....'],
  'x': ['.....', '.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '.....'],
  'y': ['.....', '.....', '#...#', '#...#', '#...#', '.####', '....#', '####.'],
  'z': ['.....', '.....', '#####', '...#.', '..#..', '.#...', '#####', '.....'],
  '{': ['..##', '.#..', '.#..', '#...', '.#..', '.#..', '..##', '....'],
  '|': ['#', '#', '#', '#', '#', '#', '#', '#'],
  '}': ['##..', '..#.', '..#.', '...#', '..#.', '..#.', '##..', '....'],
  '~': ['.##..#', '#..##.', '......', '......', '......', '......', '......', '......'],
};
// hollow box drawn for characters outside the table (like vanilla's missing glyph)
const MISSING = { w: 5, rows: ['#####', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '#####'] };

const GLYPHS = new Map();
for (const ch in G) GLYPHS.set(ch, { w: G[ch][0].length, rows: G[ch] });

// Precomputed horizontal ink runs per row for fast fillRect rendering: [[row, x0, len], ...]
const RUNS = new Map();
function runsOf(g) {
  let r = RUNS.get(g);
  if (r) return r;
  r = [];
  g.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== '#') continue;
      let e = x; while (e < row.length && row[e] === '#') e++;
      r.push([y, x, e - x]); x = e;
    }
  });
  RUNS.set(g, r);
  return r;
}

export function getGlyph(ch) {
  return GLYPHS.get(ch) || MISSING;
}

// Advance width (font pixels) of a single character.
export function charAdvance(ch, bold = false) {
  return getGlyph(ch).w + 1 + (bold ? 1 : 0);
}

function parseColor(c, fallback = 0xFFFFFF) {
  if (c == null) return fallback;
  if (typeof c === 'number') return c & 0xFFFFFF;
  let s = String(c).trim();
  if (s[0] === '#') s = s.slice(1);
  if (s.length === 3 || s.length === 4) s = s.slice(0, 3).split('').map(h => h + h).join('');
  const v = parseInt(s.slice(0, 6), 16);
  return Number.isFinite(v) ? v : fallback;
}
const hex6 = v => '#' + (v & 0xFFFFFF).toString(16).padStart(6, '0');
export const shadowColorOf = rgb => (rgb & 0xFCFCFC) >> 2;

// Walk a string, interpreting § codes. Calls fn(ch, x, style) for each visible glyph, with x in font pixels.
// Returns the total advance (font pixels) of the longest line and the number of lines.
function layout(str, baseColor, fn) {
  str = String(str ?? '');
  const st = { color: baseColor, bold: false, strike: false, underline: false, italic: false, obf: false };
  let x = 0, line = 0, maxW = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '§') {
      const code = (str[i + 1] || '').toLowerCase();
      i++;
      if (code in FORMAT_COLORS) { st.color = FORMAT_COLORS[code]; st.bold = st.strike = st.underline = st.italic = st.obf = false; }
      else if (code === 'l') st.bold = true;
      else if (code === 'm') st.strike = true;
      else if (code === 'n') st.underline = true;
      else if (code === 'o') st.italic = true;
      else if (code === 'k') st.obf = true;
      else if (code === 'r') { st.color = baseColor; st.bold = st.strike = st.underline = st.italic = st.obf = false; }
      continue;
    }
    if (ch === '\n') { maxW = Math.max(maxW, x); x = 0; line++; continue; }
    let g = getGlyph(ch);
    if (st.obf && ch !== ' ') g = obfuscate(g);
    const adv = g.w + 1 + (st.bold ? 1 : 0);
    if (fn) fn(g, x, line, adv, st);
    x += adv;
  }
  maxW = Math.max(maxW, x);
  return { w: maxW, lines: line + 1 };
}

let OBF_BY_W = null;
function obfuscate(g) {
  if (!OBF_BY_W) {
    OBF_BY_W = new Map();
    for (const gl of GLYPHS.values()) { if (!OBF_BY_W.has(gl.w)) OBF_BY_W.set(gl.w, []); OBF_BY_W.get(gl.w).push(gl); }
  }
  const list = OBF_BY_W.get(g.w) || [g];
  return list[(Math.random() * list.length) | 0];
}

// Width in font pixels (formatting codes skipped). Matches vanilla getWidth (includes the trailing 1px spacing).
export function measureText(str) {
  return layout(str, 0xFFFFFF, null).w;
}

// Generic rasterizer used by drawText (canvas) and textToImageData (buffer).
// rect(x, y, w, h, rgb) receives coordinates already scaled.
function render(str, x0, y0, opts, rect) {
  const scale = Math.max(1, Math.round(opts.scale || 1));
  const base = parseColor(opts.color, 0xFFFFFF);
  const shadow = opts.shadow !== false;
  const pass = (dx, dy, isShadow) => {
    layout(str, base, (g, x, line, adv, st) => {
      const rgb = isShadow ? shadowColorOf(st.color) : st.color;
      const gx = x0 + (x + dx) * scale, gy = y0 + (line * LINE_HEIGHT + dy) * scale;
      const runs = runsOf(g);
      for (let b = 0; b <= (st.bold ? 1 : 0); b++) {
        for (const [ry, rx, len] of runs) {
          const sk = st.italic ? Math.round((GLYPH_HEIGHT - 1 - ry) * 0.25 * scale) : 0; // crude italic slant
          rect(gx + (rx + b) * scale + sk, gy + ry * scale, len * scale, scale, rgb);
        }
      }
      if (st.strike) rect(gx - (x > 0 ? scale : 0), gy + Math.round(3.5 * scale), adv * scale + (x > 0 ? scale : 0), scale, rgb);
      if (st.underline) rect(gx - (x > 0 ? scale : 0), gy + 8 * scale, adv * scale + (x > 0 ? scale : 0), scale, rgb);
    });
  };
  if (shadow) pass(1, 1, true);
  pass(0, 0, false);
}

// Draw text onto a CanvasRenderingContext2D with integer-scaled fillRects.
// opts: { color: '#ffffff', shadow: true, scale: 1 }
export function drawText(ctx, str, x, y, opts = {}) {
  x = Math.round(x); y = Math.round(y);
  let cur = -1;
  render(str, x, y, opts, (rx, ry, w, h, rgb) => {
    if (rgb !== cur) { ctx.fillStyle = hex6(rgb); cur = rgb; }
    ctx.fillRect(rx, ry, w, h);
  });
  return measureText(str) * Math.max(1, Math.round(opts.scale || 1));
}

// Draw text horizontally centered on cx (vanilla drawCenteredString: x = cx - width/2).
export function drawTextCentered(ctx, str, cx, y, opts = {}) {
  const s = Math.max(1, Math.round(opts.scale || 1));
  return drawText(ctx, str, Math.round(cx - (measureText(str) * s) / 2), y, opts);
}

// Pure-JS rasterization to RGBA. Returns { w, h, data } sized to fit the text and its shadow.
// opts: { color, shadow:true, scale:1, background: optional [r,g,b,a] fill }
export function textToImageData(str, opts = {}) {
  const scale = Math.max(1, Math.round(opts.scale || 1));
  const m = layout(str, 0xFFFFFF, null);
  const w = Math.max(1, m.w * scale), h = m.lines * LINE_HEIGHT * scale;
  const data = new Uint8ClampedArray(w * h * 4);
  if (opts.background) for (let i = 0; i < w * h; i++) data.set(opts.background, i * 4);
  const alpha = opts.alpha == null ? 255 : Math.round(opts.alpha * 255);
  render(str, 0, 0, opts, (rx, ry, rw, rh, rgb) => {
    const r = rgb >> 16 & 255, g = rgb >> 8 & 255, b = rgb & 255;
    for (let yy = Math.max(0, ry); yy < Math.min(h, ry + rh); yy++) {
      for (let xx = Math.max(0, rx); xx < Math.min(w, rx + rw); xx++) {
        const i = (yy * w + xx) * 4;
        data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = alpha;
      }
    }
  });
  return { w, h, data };
}

// Draw text directly into an RGBA buffer {w,h,data} at (x,y) (alpha-blended). Useful for baking sprites.
export function drawTextToBuffer(img, str, x, y, opts = {}) {
  const t = textToImageData(str, opts);
  for (let yy = 0; yy < t.h; yy++) for (let xx = 0; xx < t.w; xx++) {
    const si = (yy * t.w + xx) * 4, a = t.data[si + 3];
    const tx = x + xx, ty = y + yy;
    if (!a || tx < 0 || ty < 0 || tx >= img.w || ty >= img.h) continue;
    const di = (ty * img.w + tx) * 4, k = a / 255;
    for (let c = 0; c < 3; c++) img.data[di + c] = t.data[si + c] * k + img.data[di + c] * (1 - k);
    img.data[di + 3] = Math.max(img.data[di + 3], a);
  }
  return t.w;
}
