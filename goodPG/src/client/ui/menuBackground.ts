// Fondo animado del menú: paisaje de bloques pixelado al atardecer con nubes a la deriva.

function makeNoise(seed: number): (x: number) => number {
  const vals: number[] = [];
  let s = seed >>> 0;
  for (let i = 0; i < 512; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    vals.push(s / 4294967296);
  }
  return (x: number) => {
    const i = Math.floor(x);
    const f = x - i;
    const a = vals[((i % 512) + 512) % 512];
    const b = vals[(((i + 1) % 512) + 512) % 512];
    const t = f * f * (3 - 2 * f);
    return a + (b - a) * t;
  };
}

export class MenuBackground {
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private running = false;
  private raf = 0;
  private scale = 4;
  private layers: HTMLCanvasElement | null = null;
  private clouds: { x: number; y: number; w: number; h: number; speed: number }[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d')!;
    window.addEventListener('resize', () => {
      if (this.running) this.build();
    });
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.build();
    let last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      this.draw(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private build(): void {
    const w = Math.ceil(window.innerWidth / this.scale);
    const h = Math.ceil(window.innerHeight / this.scale);
    this.canvas.width = w;
    this.canvas.height = h;
    const layer = document.createElement('canvas');
    layer.width = w;
    layer.height = h;
    const g = layer.getContext('2d')!;
    // Cielo.
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#1d2f5c');
    sky.addColorStop(0.45, '#4f5f9a');
    sky.addColorStop(0.7, '#d98a6a');
    sky.addColorStop(0.86, '#f4c07a');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    // Sol.
    const sx = w * 0.84, sy = h * 0.6;
    const glow = g.createRadialGradient(sx, sy, 2, sx, sy, h * 0.5);
    glow.addColorStop(0, 'rgba(255,236,190,0.95)');
    glow.addColorStop(0.08, 'rgba(255,214,150,0.55)');
    glow.addColorStop(1, 'rgba(255,170,120,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff4d6';
    const sr = Math.max(4, Math.round(h * 0.045));
    // Disco pixelado.
    for (let y = -sr; y <= sr; y++) {
      const half = Math.round(Math.sqrt(sr * sr - y * y));
      g.fillRect(Math.round(sx - half), Math.round(sy + y), half * 2, 1);
    }
    // Capas de montañas y colinas (de lejos a cerca).
    const bands = [
      { base: 0.7, amp: 0.22, freq: 0.035, col: '#6b5d86', top: '#8d7aa3', seed: 3, step: 3 },
      { base: 0.76, amp: 0.14, freq: 0.05, col: '#4b4d73', top: '#6d6a8f', seed: 7, step: 2 },
      { base: 0.83, amp: 0.08, freq: 0.07, col: '#2f4a3e', top: '#4f7a46', seed: 11, step: 2 },
      { base: 0.9, amp: 0.06, freq: 0.09, col: '#1f3526', top: '#3f6b33', seed: 19, step: 1 },
    ];
    for (const b of bands) {
      const n = makeNoise(b.seed);
      for (let x = 0; x < w; x += b.step) {
        const v = n(x * b.freq) * 0.7 + n(x * b.freq * 3 + 50) * 0.3;
        const top = Math.round((b.base - v * b.amp) * h);
        g.fillStyle = b.col;
        g.fillRect(x, top, b.step, h - top);
        g.fillStyle = b.top;
        g.fillRect(x, top, b.step, Math.max(1, b.step));
      }
    }
    // Árboles en la colina media.
    const tn = makeNoise(42);
    for (let x = 4; x < w; x += 7) {
      if (tn(x * 0.7) < 0.55) continue;
      const v = makeNoise(11)(x * 0.07) * 0.7 + makeNoise(11)(x * 0.21 + 50) * 0.3;
      const ground = Math.round((0.83 - v * 0.08) * h);
      const th = 3 + Math.floor(tn(x * 1.3) * 3);
      g.fillStyle = '#3a2a1c';
      g.fillRect(x, ground - th, 1, th);
      g.fillStyle = tn(x * 2.1) > 0.5 ? '#274f2c' : '#2f5d30';
      g.fillRect(x - 2, ground - th - 3, 5, 3);
      g.fillRect(x - 1, ground - th - 4, 3, 1);
    }
    this.layers = layer;
    // Nubes.
    this.clouds = [];
    const cn = makeNoise(99);
    for (let i = 0; i < 9; i++) {
      this.clouds.push({
        x: cn(i * 3.1) * w * 1.4 - w * 0.2,
        y: h * (0.12 + cn(i * 7.7) * 0.35),
        w: 14 + Math.round(cn(i * 5.3) * 26),
        h: 3 + Math.round(cn(i * 2.9) * 3),
        speed: 1.5 + cn(i * 9.1) * 2.5,
      });
    }
  }

  private draw(dt: number): void {
    if (!this.layers) return;
    const g = this.g;
    const w = this.canvas.width;
    g.drawImage(this.layers, 0, 0);
    for (const c of this.clouds) {
      c.x += c.speed * dt;
      if (c.x > w + 10) c.x = -c.w - 10;
      const x = Math.round(c.x), y = Math.round(c.y);
      g.fillStyle = 'rgba(255, 226, 214, 0.75)';
      g.fillRect(x, y, c.w, c.h);
      g.fillRect(x + 3, y - 2, c.w - 8, 2);
      g.fillStyle = 'rgba(214, 150, 150, 0.45)';
      g.fillRect(x, y + c.h - 1, c.w, 1);
    }
  }
}
