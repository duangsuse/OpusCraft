// Efectos de partículas con nombre: cada uno sabe cuántas partículas crea, con qué sprite, color,
// física y vida. Los usan los efectos del juego (golpes, humo, corazones…) y los emisores ambientales
// (hojas y pétalos que caen, antorchas, goteo, luciérnagas, lluvia…).
import { ParticleSystem, PF, SPRITE } from './ParticleSystem';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

export class ParticleFx {
  constructor(readonly ps: ParticleSystem) {}

  /** Trozos de un bloque que se rompe (capa de su textura). */
  chips(x: number, y: number, z: number, layer: number, light: number, n = 30): void {
    for (let i = 0; i < n; i++) {
      const px = x + 0.1 + Math.random() * 0.8, py = y + 0.1 + Math.random() * 0.8, pz = z + 0.1 + Math.random() * 0.8;
      this.ps.spawn({
        x: px, y: py, z: pz, vx: (px - x - 0.5) * 3.2 + rnd(-0.5, 0.5), vy: rnd(1.4, 4), vz: (pz - z - 0.5) * 3.2 + rnd(-0.5, 0.5),
        life: rnd(0.7, 1.4), size: rnd(0.07, 0.15), sprite: layer, uv: Math.floor(Math.random() * 16), grav: 19, drag: 0.3,
        light, flags: PF.BLOCK | PF.COLLIDE | PF.BOUNCE, a: 1,
      });
    }
  }

  /** Humo o polvo: nubecillas que suben, crecen, giran y se las lleva el viento. gray 0 negro … 1 blanco. */
  smoke(x: number, y: number, z: number, n: number, spread: number, gray: number, size: number, up = 1.2): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * spread;
      const g = Math.max(0.03, Math.min(1, gray + rnd(-0.08, 0.08)));
      const lin = g * g;
      this.ps.spawn({
        x: x + Math.cos(a) * r, y: y + rnd(-0.5, 0.5) * spread, z: z + Math.sin(a) * r,
        vx: Math.cos(a) * r * 1.6, vy: up * rnd(0.5, 1.4), vz: Math.sin(a) * r * 1.6,
        life: rnd(0.9, 2.1), size: size * rnd(0.7, 1.3), size1: size * rnd(1.8, 2.8), sprite: SPRITE.smoke + Math.floor(Math.random() * 4),
        r: lin, g: lin, b: lin * 1.03, a: 0.7, grav: -0.5 * up, drag: 1.6, wind: 0.5, rot: Math.random() * 6.3, spin: rnd(-0.8, 0.8),
        flags: PF.FADE_IN,
      });
    }
  }

  /** Llama (criaturas que arden, antorchas, hornos): sube, se encoge y parpadea. */
  flame(x: number, y: number, z: number, size = 1): void {
    this.ps.spawn({
      x, y, z, vx: rnd(-0.15, 0.15), vy: rnd(0.5, 1.1), vz: rnd(-0.15, 0.15), life: rnd(0.35, 0.7),
      size: rnd(0.14, 0.24) * size, size1: 0.04 * size, sprite: SPRITE.flame, frames: 4, r: 4, g: 2.6, b: 1.6, a: 1,
      drag: 1, flags: PF.EMISSIVE,
    });
  }

  /** Corazones (animales enamorados, domesticados, crías). */
  hearts(x: number, y: number, z: number, n: number, spread = 0.4): void {
    for (let i = 0; i < n; i++) {
      this.ps.spawn({
        x: x + rnd(-1, 1) * spread, y: y + rnd(-0.5, 0.5) * spread, z: z + rnd(-1, 1) * spread,
        vx: rnd(-0.15, 0.15), vy: rnd(0.35, 0.7), vz: rnd(-0.15, 0.15), life: rnd(1, 1.6), size: rnd(0.2, 0.28),
        sprite: SPRITE.heart, r: 1.25, g: 1.25, b: 1.25, drag: 0.6, light: 0xff, flags: PF.BRIGHT | PF.FADE_IN,
      });
    }
  }

  /** Destellos (polvo de hueso, aldeano contento, magia). Por defecto verdes. */
  sparkles(x: number, y: number, z: number, n: number, spread = 0.5, color: [number, number, number] = [0.45, 1.6, 0.55]): void {
    for (let i = 0; i < n; i++) {
      this.ps.spawn({
        x: x + rnd(-1, 1) * spread, y: y + rnd(-0.5, 0.5) * spread, z: z + rnd(-1, 1) * spread,
        vx: rnd(-0.1, 0.1), vy: rnd(0.2, 0.55), vz: rnd(-0.1, 0.1), life: rnd(0.8, 1.5), size: rnd(0.1, 0.18), size1: 0.03,
        sprite: pick([SPRITE.twinkle, SPRITE.star]), r: color[0], g: color[1], b: color[2], drag: 0.8, rot: Math.random() * 3,
        spin: rnd(-2, 2), flags: PF.EMISSIVE | PF.FADE_IN | PF.BLINK,
      });
    }
  }

  /** Chispas de golpe crítico: estrellas que saltan y caen. */
  crit(x: number, y: number, z: number, n: number): void {
    for (let i = 0; i < n; i++) {
      this.ps.spawn({
        x, y, z, vx: rnd(-6, 6), vy: rnd(0.5, 5), vz: rnd(-6, 6), life: rnd(0.35, 0.7), size: rnd(0.06, 0.1),
        sprite: SPRITE.spark, r: 3, g: 2.6, b: 1.6, grav: 12, drag: 2.5, flags: PF.EMISSIVE | PF.STRETCH,
      });
    }
  }

  /** Pétalo de cerezo que cae meciéndose y se posa en el suelo. */
  petal(x: number, y: number, z: number): void {
    this.ps.spawn({
      x, y, z, vx: rnd(-0.2, 0.2), vy: -0.3, vz: rnd(-0.2, 0.2), life: rnd(9, 14), size: rnd(0.13, 0.19),
      sprite: SPRITE.petal + (Math.random() < 0.5 ? 0 : 1), r: 1.35, g: 1.25, b: 1.3, grav: 1.2, drag: 2.4, wind: 0.9,
      rot: Math.random() * 6.3, spin: rnd(-2, 2),
      flags: PF.COLLIDE | PF.FLUTTER | PF.REST | PF.FADE_IN,
    });
  }

  /** Hoja que cae (del color de su árbol) y se posa. */
  leaf(x: number, y: number, z: number, r: number, g: number, b: number): void {
    this.ps.spawn({
      x, y, z, vx: rnd(-0.2, 0.2), vy: -0.3, vz: rnd(-0.2, 0.2), life: rnd(8, 12), size: rnd(0.13, 0.19),
      sprite: SPRITE.leaf + Math.floor(Math.random() * 4), r, g, b, grav: 1.5, drag: 2.2, wind: 0.8, rot: Math.random() * 6.3,
      spin: rnd(-2, 2), flags: PF.COLLIDE | PF.FLUTTER | PF.REST | PF.FADE_IN,
    });
  }

  /** Gota que se forma bajo un techo mojado (o de lava) y cae hasta salpicar. */
  drip(x: number, y: number, z: number, lava: boolean): void {
    this.ps.spawn({
      x, y, z, life: rnd(2.5, 3.5), size: 0.07, sprite: SPRITE.drop, grav: 16, drag: 0.2,
      ...(lava ? { r: 3.2, g: 1.1, b: 0.25 } : { r: 0.45, g: 0.62, b: 1.1 }), a: 0.95,
      flags: PF.HANG | PF.SPLASH | (lava ? PF.EMISSIVE : 0),
    });
  }

  /** Salpicadura (agua o, con `emissive`, lava). */
  splash(x: number, y: number, z: number, n: number, emissive = false): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = rnd(0.8, 2.6);
      this.ps.spawn({
        x: x + rnd(-0.3, 0.3), y, z: z + rnd(-0.3, 0.3), vx: Math.cos(a) * s, vy: rnd(2, 4.5), vz: Math.sin(a) * s,
        life: rnd(0.35, 0.7), size: rnd(0.04, 0.08), sprite: SPRITE.spark,
        ...(emissive ? { r: 3.2, g: 1.2, b: 0.3 } : { r: 0.7, g: 0.82, b: 1 }), a: 0.9, grav: 20, drag: 0.4,
        flags: PF.STRETCH | PF.COLLIDE | (emissive ? PF.EMISSIVE : 0),
      });
    }
  }

  /** Burbujas que suben (bajo el agua) y revientan en la superficie. */
  bubbles(x: number, y: number, z: number, n: number, spread = 0.3): void {
    for (let i = 0; i < n; i++) {
      this.ps.spawn({
        x: x + rnd(-1, 1) * spread, y: y + rnd(-0.5, 0.5) * spread, z: z + rnd(-1, 1) * spread, vx: rnd(-0.2, 0.2),
        vy: rnd(0.8, 1.6), vz: rnd(-0.2, 0.2), life: rnd(1.2, 2.5), size: rnd(0.06, 0.12), sprite: SPRITE.bubble,
        r: 0.9, g: 0.95, b: 1, a: 0.85, drag: 0.8, flags: PF.BUBBLE | PF.DRIFT,
      });
    }
  }

  /** Fase 8.5: burbuja de una columna que sube (rápida y recta) o del remolino de una que baja (gira y se hunde). */
  bubbleColumn(x: number, y: number, z: number, down: boolean): void {
    if (down) {
      const a = Math.random() * Math.PI * 2;
      this.ps.spawn({
        x: x + Math.cos(a) * 0.3, y, z: z + Math.sin(a) * 0.3, vx: -Math.sin(a) * 1.2, vy: rnd(-2.2, -1.2), vz: Math.cos(a) * 1.2,
        life: rnd(0.8, 1.4), size: rnd(0.04, 0.08), sprite: SPRITE.bubble, r: 0.85, g: 0.92, b: 1, a: 0.8, drag: 0.4, flags: PF.BUBBLE,
      });
      return;
    }
    this.ps.spawn({
      x: x + rnd(-0.35, 0.35), y, z: z + rnd(-0.35, 0.35), vx: rnd(-0.1, 0.1), vy: rnd(3.5, 5.5), vz: rnd(-0.1, 0.1),
      life: rnd(0.7, 1.4), size: rnd(0.06, 0.13), sprite: SPRITE.bubble, r: 0.9, g: 0.96, b: 1, a: 0.9, drag: 0.2, flags: PF.BUBBLE | PF.DRIFT,
    });
  }

  /** Brasa que salta de la lava o de un fuego. */
  ember(x: number, y: number, z: number): void {
    this.ps.spawn({
      x, y, z, vx: rnd(-1, 1), vy: rnd(3, 5.5), vz: rnd(-1, 1), life: rnd(1, 1.8), size: rnd(0.05, 0.09), size1: 0.02,
      sprite: SPRITE.spark, r: 4, g: 1.5, b: 0.35, grav: 9, drag: 0.4, flags: PF.EMISSIVE | PF.STRETCH | PF.COLLIDE,
    });
  }

  /** Fase 8 (entorno del Nether): pavesa que sube despacio del mar de lava, oscila con el aire caliente y se apaga. */
  heatEmber(x: number, y: number, z: number): void {
    const hot = Math.random();
    this.ps.spawn({
      x, y, z, vx: rnd(-0.25, 0.25), vy: rnd(0.35, 0.9), vz: rnd(-0.25, 0.25), life: rnd(4, 8), size: rnd(0.03, 0.06), size1: 0.01,
      sprite: SPRITE.glow, r: 3 + hot * 1.5, g: 0.9 + hot * 0.8, b: 0.15 + hot * 0.2, drag: 0.35, wind: 0.25,
      flags: PF.EMISSIVE | PF.DRIFT | PF.BLINK | PF.FADE_IN,
    });
  }

  /** Fase 8.5: mota violeta que sube del remolino del nexo de reaparición cargado. */
  anchorMote(x: number, y: number, z: number): void {
    this.ps.spawn({
      x, y, z, vx: rnd(-0.12, 0.12), vy: rnd(0.4, 1.1), vz: rnd(-0.12, 0.12), life: rnd(1.4, 2.8), size: rnd(0.04, 0.08), size1: 0.01,
      sprite: SPRITE.glow, r: 1.7, g: 0.55, b: 2.8, drag: 0.6, flags: PF.EMISSIVE | PF.DRIFT | PF.FADE_IN,
    });
  }

  /** Fase 8.6: mota de polvo del vacío del End: violeta, flota y deriva; con el destello, brilla más. */
  endMote(x: number, y: number, z: number, flash: number): void {
    this.ps.spawn({
      x, y, z, vx: rnd(-0.08, 0.08), vy: rnd(-0.04, 0.1), vz: rnd(-0.08, 0.08), life: rnd(4, 9), size: rnd(0.025, 0.05), size1: 0.01,
      sprite: SPRITE.glow, r: 0.9 + flash * 1.4, g: 0.55 + flash * 0.6, b: 1.4 + flash * 1.6, a: 0.7, drag: 0.8, wind: 0.1,
      flags: PF.EMISSIVE | PF.DRIFT | PF.FADE_IN | PF.BLINK,
    });
  }

  /**
   * Fase 8.6: partícula de portal (PortalParticle): nace desplazada (dx, dy, dz) de su punto y vuelve hacia él
   * mientras sube un poco y se apaga; violeta de brillo variable (0,9·f, 0,3·f, f).
   */
  portal(x: number, y: number, z: number, dx: number, dy: number, dz: number): void {
    const f = rnd(0.4, 1);
    const life = rnd(1.6, 2.4);
    this.ps.spawn({
      x: x + dx, y: y + dy + 0.6, z: z + dz, vx: -dx / life * 1.4, vy: (-dy - 0.6) / life * 1.4, vz: -dz / life * 1.4, life,
      size: rnd(0.05, 0.08), size1: 0.015, sprite: SPRITE.glow, r: 1.9 * f, g: 0.6 * f, b: 2.4 * f, drag: 0.9,
      flags: PF.EMISSIVE | PF.FADE_IN,
    });
  }

  /**
   * Fase 8.6: chispa de vara del End (EndRodParticle): blanca y encendida, flota y se apaga hacia un tono crema en unos
   * 3 s (la estela de la bala del shulker y la luz de las varas).
   */
  endRod(x: number, y: number, z: number, vx: number, vy: number, vz: number): void {
    this.ps.spawn({
      x, y, z, vx, vy, vz, life: rnd(3, 3.6), size: rnd(0.05, 0.08), size1: 0.01, sprite: SPRITE.glow, r: 2.4, g: 2.3, b: 2.1,
      r1: 1.9, g1: 1.7, b1: 1.5, drag: 1.8, flags: PF.EMISSIVE | PF.BLINK,
    });
  }

  /** Fase 8.6: bocanada del aliento del dragón: una llama violeta que sale disparada y se abre (DRAGON_BREATH). */
  dragonBreath(x: number, y: number, z: number, vx: number, vy: number, vz: number): void {
    const life = rnd(0.8, 1.6);
    this.ps.spawn({
      x, y, z, vx, vy, vz, life, size: rnd(0.12, 0.22), size1: rnd(0.35, 0.6), sprite: SPRITE.glow, r: 2.2, g: 0.7, b: 2.8, r1: 0.9, g1: 0.2, b1: 1.4,
      a: 0.9, drag: 1.6, grav: -0.4, flags: PF.EMISSIVE | PF.FADE_IN,
    });
  }

  /** Fase 8.6: el resplandor de la bola de fuego del dragón (dura un instante: se renueva cada frame). */
  dragonOrb(x: number, y: number, z: number): void {
    this.ps.spawn({
      x, y, z, life: 0.12, size: rnd(0.55, 0.7), size1: 0.4, sprite: SPRITE.glow, r: 2.4, g: 0.8, b: 3.0, a: 0.9, flags: PF.EMISSIVE,
    });
    this.ps.spawn({
      x: x + rnd(-0.3, 0.3), y: y + rnd(-0.3, 0.3), z: z + rnd(-0.3, 0.3), vx: rnd(-0.4, 0.4), vy: rnd(-0.2, 0.6), vz: rnd(-0.4, 0.4), life: rnd(0.5, 1),
      size: rnd(0.08, 0.14), size1: 0.02, sprite: SPRITE.glow, r: 1.8, g: 0.5, b: 2.6, drag: 1, flags: PF.EMISSIVE,
    });
  }

  /** Espora flotante (micelio, cuevas frondosas…). */
  spore(x: number, y: number, z: number, r: number, g: number, b: number, emissive = false): void {
    this.ps.spawn({
      x, y, z, vx: rnd(-0.1, 0.1), vy: rnd(-0.05, 0.12), vz: rnd(-0.1, 0.1), life: rnd(3, 6), size: rnd(0.035, 0.06),
      sprite: SPRITE.dust, r, g, b, a: 0.8, drag: 1, wind: 0.15, flags: PF.DRIFT | PF.FADE_IN | (emissive ? PF.EMISSIVE : 0),
    });
  }

  /** Luciérnaga: punto de luz amarillo verdoso que ronda y parpadea. */
  firefly(x: number, y: number, z: number): void {
    this.ps.spawn({
      x, y, z, vx: rnd(-0.3, 0.3), vy: rnd(-0.1, 0.2), vz: rnd(-0.3, 0.3), life: rnd(6, 11), size: rnd(0.09, 0.14),
      sprite: SPRITE.glow, r: 1.9, g: 2.6, b: 0.5, drag: 0.5, flags: PF.EMISSIVE | PF.DRIFT | PF.BLINK | PF.FADE_IN | PF.COLLIDE,
    });
  }

  /** Salpicadura de lluvia sobre el suelo. */
  rainSplash(x: number, y: number, z: number): void {
    this.ps.spawn({
      x, y, z, life: rnd(0.15, 0.3), size: rnd(0.08, 0.14), size1: 0.18, sprite: SPRITE.splash, r: 0.75, g: 0.85, b: 1, a: 0.55,
    });
    if (Math.random() < 0.5) this.splash(x, y, z, 1);
  }

  /** Explosión: fogonazo, bolas de humo que se oscurecen, chispas y humo que queda flotando. */
  explosion(x: number, y: number, z: number, power: number): void {
    this.ps.spawn({ x, y, z, life: 0.25, size: power * 1.6, size1: power * 2.4, sprite: SPRITE.glow, r: 6, g: 4, b: 2.2, flags: PF.EMISSIVE });
    for (let i = 0; i < 14 + power * 6; i++) {
      const a = Math.random() * Math.PI * 2, e = rnd(-0.6, 1), s = rnd(1.5, 4.5) * (power / 3);
      this.ps.spawn({
        x: x + Math.cos(a) * rnd(0, power * 0.4), y: y + rnd(-0.3, 0.6) * power * 0.3, z: z + Math.sin(a) * rnd(0, power * 0.4),
        vx: Math.cos(a) * s, vy: e * s * 0.8 + 1, vz: Math.sin(a) * s, life: rnd(1.2, 2.6),
        size: rnd(0.5, 0.9) * (power / 3), size1: rnd(1.6, 2.6) * (power / 3), sprite: SPRITE.smoke + Math.floor(Math.random() * 4),
        r: 0.55, g: 0.52, b: 0.5, r1: 0.18, g1: 0.17, b1: 0.17, a: 0.85, grav: -0.6, drag: 1.8, wind: 0.4,
        rot: Math.random() * 6.3, spin: rnd(-0.6, 0.6),
      });
    }
    for (let i = 0; i < 24 + power * 4; i++) {
      this.ps.spawn({
        x, y, z, vx: rnd(-9, 9), vy: rnd(1, 9), vz: rnd(-9, 9), life: rnd(0.4, 1), size: rnd(0.06, 0.11), sprite: SPRITE.spark,
        r: 4, g: 2.2, b: 0.8, grav: 14, drag: 1.4, flags: PF.EMISSIVE | PF.STRETCH | PF.COLLIDE | PF.BOUNCE,
      });
    }
  }

  /** Columna de humo de una fogata. */
  campfireSmoke(x: number, y: number, z: number): void {
    this.ps.spawn({
      x: x + rnd(-0.2, 0.2), y, z: z + rnd(-0.2, 0.2), vx: rnd(-0.05, 0.05), vy: rnd(1, 1.5), vz: rnd(-0.05, 0.05),
      life: rnd(4, 7), size: rnd(0.35, 0.5), size1: rnd(1.4, 2), sprite: SPRITE.smoke + Math.floor(Math.random() * 4),
      r: 0.55, g: 0.55, b: 0.57, a: 0.45, grav: -0.15, drag: 0.35, wind: 0.35, rot: Math.random() * 6.3, spin: rnd(-0.3, 0.3),
      flags: PF.FADE_IN,
    });
  }

  /** Antorcha: llamita en la punta y, a veces, una voluta de humo (Fase 6.5: verde en las de cobre). */
  torch(x: number, y: number, z: number, copper = false): void {
    this.ps.spawn({
      x, y, z, vy: rnd(0.05, 0.2), life: rnd(0.25, 0.45), size: rnd(0.07, 0.1), size1: 0.02, sprite: SPRITE.flame, frames: 4,
      ...(copper ? { r: 1.3, g: 4, b: 2 } : { r: 4, g: 2.4, b: 1.2 }), flags: PF.EMISSIVE,
    });
    if (Math.random() < 0.3) this.smoke(x, y + 0.05, z, 1, 0.02, 0.55, 0.06, 0.8);
  }

  /** Nubecilla oscura sobre la cabeza (aldeano enfadado o que dice que no). */
  angry(x: number, y: number, z: number): void {
    this.ps.spawn({ x, y, z, vy: 0.3, life: 1, size: 0.3, sprite: SPRITE.cloud, r: 1, g: 1, b: 1, drag: 1, flags: PF.FADE_IN });
  }

  /**
   * Fase 6.5 (cobre): destellos sobre las caras de un bloque de cobre al encerarlo (ámbar), quitarle
   * la cera (blancos) o rasparle el verdín (verde azulado, también cuando lo limpia un rayo).
   */
  copperFlakes(x: number, y: number, z: number, kind: 'wax' | 'unwax' | 'scrape'): void {
    const [r, g, b] = kind === 'wax' ? [1.7, 1.05, 0.3] : kind === 'unwax' ? [1.45, 1.45, 1.4] : [0.35, 1.35, 1.05];
    for (let i = 0; i < 18; i++) {
      // Un punto al azar de una de las seis caras, un pelo por fuera.
      const f = Math.floor(Math.random() * 6), ax = f >> 1, side = f & 1;
      const p = [Math.random(), Math.random(), Math.random()];
      p[ax] = side ? 1.06 : -0.06;
      const n = [0, 0, 0];
      n[ax] = side ? 1 : -1;
      this.ps.spawn({
        x: x + p[0], y: y + p[1], z: z + p[2], vx: n[0] * rnd(0.1, 0.4) + rnd(-0.1, 0.1), vy: n[1] * rnd(0.1, 0.4) + rnd(0, 0.25),
        vz: n[2] * rnd(0.1, 0.4) + rnd(-0.1, 0.1), life: rnd(0.6, 1.2), size: rnd(0.08, 0.14), size1: 0.02,
        sprite: pick([SPRITE.twinkle, SPRITE.star]), r, g, b, drag: 1.2, rot: Math.random() * 3, spin: rnd(-3, 3),
        flags: PF.EMISSIVE | PF.FADE_IN | PF.BLINK,
      });
    }
  }

  /**
   * Fase 7 (encantamientos): una runa que sale de la librería (x, y, z) y vuela, subiendo en arco, hasta
   * el libro de la mesa (tx, ty, tz), donde se apaga.
   */
  glyph(x: number, y: number, z: number, tx: number, ty: number, tz: number): void {
    const life = rnd(1.1, 1.6);
    const dx = tx - x, dy = ty - y, dz = tz - z;
    this.ps.spawn({
      x, y, z, vx: dx / life, vy: dy / life + 1.1, vz: dz / life, life, size: rnd(0.09, 0.13), size1: 0.05,
      sprite: SPRITE.glyph + Math.floor(Math.random() * 8), r: 1.4, g: 1.25, b: 1.9, r1: 0.8, g1: 0.55, b1: 1.6, a: 1,
      grav: 2.2, flags: PF.EMISSIVE | PF.FADE_IN,
    });
  }

  /** Fase 7 (encantamientos): chispas mágicas (golpe con un arma encantada, encantar algo). */
  magic(x: number, y: number, z: number, n: number, spread = 0.4): void {
    for (let i = 0; i < n; i++) {
      this.ps.spawn({
        x: x + rnd(-1, 1) * spread, y: y + rnd(-0.5, 0.5) * spread, z: z + rnd(-1, 1) * spread,
        vx: rnd(-3, 3), vy: rnd(0.5, 3.5), vz: rnd(-3, 3), life: rnd(0.4, 0.8), size: rnd(0.06, 0.1),
        sprite: SPRITE.spark, r: 0.9, g: 2.2, b: 2.6, grav: 8, drag: 2.5, flags: PF.EMISSIVE | PF.STRETCH,
      });
    }
  }

  /** Anillo que se expande (onda, aterrizaje fuerte). */
  ring(x: number, y: number, z: number, size: number, r = 1, g = 1, b = 1): void {
    this.ps.spawn({ x, y, z, life: 0.45, size: size * 0.3, size1: size, sprite: SPRITE.ring, r, g, b, a: 0.7 });
  }
}
