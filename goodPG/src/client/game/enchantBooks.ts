// Fase 7 (encantamientos): el libro que flota sobre cada mesa de encantamientos. Sube y baja despacio,
// se vuelve hacia el jugador más cercano y se abre cuando está a menos de 3 bloques (pasando hojas de
// vez en cuando); si no hay nadie cerca, se cierra y gira solo. Se dibuja con cajas (tapas, hojas y la
// hoja que pasa) como los demás objetos del mundo.
import { mat4 } from 'gl-matrix';
import { ENCHANTING_TABLE } from '../../shared/blocks';
import type { ItemDraw, ItemRenderer } from '../render/ItemRenderer';
import type { Game } from './Game';

interface Book {
  x: number;
  y: number;
  z: number;
  /** Giro actual y apertura (0 cerrado … 1 abierto). */
  yaw: number;
  open: number;
  /** Hoja que pasa (0..1, avanza cuando está abierto) y su dirección. */
  flip: number;
  flipDir: number;
  t: number;
}

/** Alcance de la búsqueda de mesas alrededor del jugador (horizontal y vertical). */
const SCAN_R = 12;
const SCAN_H = 6;
const PX = 1 / 16;

export class EnchantBooks {
  private books = new Map<string, Book>();
  private scanT = 0;

  constructor(private g: Game) {}

  /** Mesas cerca del jugador (posición de cada una). */
  get tables(): [number, number, number][] {
    return [...this.books.values()].map((b) => [b.x, b.y, b.z]);
  }

  update(dt: number): void {
    const g = this.g, world = g.world;
    if (!world) return;
    const p = g.player;
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 1;
      const seen = new Set<string>();
      const px = Math.floor(p.x), py = Math.floor(p.y), pz = Math.floor(p.z);
      for (let y = py - SCAN_H; y <= py + SCAN_H; y++) {
        for (let z = pz - SCAN_R; z <= pz + SCAN_R; z++) {
          for (let x = px - SCAN_R; x <= px + SCAN_R; x++) {
            if (world.getBlock(x, y, z) !== ENCHANTING_TABLE) continue;
            const k = `${x},${y},${z}`;
            seen.add(k);
            if (!this.books.has(k)) this.books.set(k, { x, y, z, yaw: Math.random() * 6.28, open: 0, flip: 0, flipDir: 1, t: Math.random() * 10 });
          }
        }
      }
      for (const k of this.books.keys()) if (!seen.has(k)) this.books.delete(k);
    }
    // Quien esté más cerca (yo o los demás jugadores).
    const others = [...g.remote.values()].map((r) => r.view);
    for (const b of this.books.values()) {
      if (world.getBlock(b.x, b.y, b.z) !== ENCHANTING_TABLE) continue;
      b.t += dt;
      const cx = b.x + 0.5, cz = b.z + 0.5;
      let best = Infinity, tx = 0, tz = 0;
      for (const v of [{ x: p.x, y: p.y, z: p.z }, ...others]) {
        const d = Math.hypot(v.x - cx, v.y - b.y, v.z - cz);
        if (d < best) {
          best = d;
          tx = v.x;
          tz = v.z;
        }
      }
      const near = best < 3;
      const want = near ? Math.atan2(tx - cx, tz - cz) : b.yaw + dt * 0.4;
      let dy = want - b.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      b.yaw += dy * Math.min(1, dt * (near ? 6 : 2));
      b.open += ((near ? 1 : 0) - b.open) * Math.min(1, dt * 4);
      // Hojas: una cada poco rato mientras está abierto.
      if (b.open > 0.6) {
        b.flip += dt * 1.6 * b.flipDir;
        if (b.flip > 1 || b.flip < 0) {
          b.flip = b.flip > 1 ? 0 : 1;
          if (Math.random() < 0.3) b.flipDir = -b.flipDir;
        }
      } else b.flip = 0;
    }
  }

  /** Cajas del libro de cada mesa, relativas a la cámara. */
  draws(items: ItemRenderer, camX: number, camY: number, camZ: number, lightOf: (x: number, y: number, z: number) => [number, number]): ItemDraw[] {
    const out: ItemDraw[] = [];
    if (this.books.size === 0) return out;
    const cover = items.textureCube('enchanting_book_cover'), pages = items.textureCube('enchanting_book_pages');
    for (const b of this.books.values()) {
      const cx = b.x + 0.5, cy = b.y + 0.75 + 0.1 + Math.sin(b.t * 1.6) * 0.04, cz = b.z + 0.5;
      if (Math.hypot(cx - camX, cy - camY, cz - camZ) > 48) continue;
      const light = lightOf(cx, cy, cz);
      const base = mat4.create();
      mat4.translate(base, base, [cx - camX, cy - camY, cz - camZ]);
      mat4.rotateY(base, base, b.yaw);
      // Inclinado hacia atrás, con las hojas hacia quien mira.
      mat4.rotateX(base, base, -0.35 - 0.25 * b.open);
      // Ángulo de cada tapa respecto al lomo: cerrado, las dos juntas detrás; abierto, en una V poco
      // profunda con las hojas hacia delante.
      const a = (Math.PI / 2 - 0.06) * (1 - b.open) + 0.3 * b.open;
      const part = (angle: number, x0: number, x1: number, zc: number, depth: number, model: typeof cover) => {
        const m = mat4.clone(base);
        mat4.rotateY(m, m, angle);
        mat4.translate(m, m, [(x0 + x1) / 2, 0, zc]);
        mat4.scale(m, m, [Math.abs(x1 - x0), 10 * PX, depth]);
        out.push({ model, m, light });
      };
      // Tapas (6 px de ancho, medio de grueso) y el taco de hojas de cada lado.
      part(-a, -6 * PX, 0, -0.25 * PX, 0.5 * PX, cover);
      part(a, 0, 6 * PX, -0.25 * PX, 0.5 * PX, cover);
      part(-a, -5 * PX, 0, 0.6 * PX, 1.2 * PX, pages);
      part(a, 0, 5 * PX, 0.6 * PX, 1.2 * PX, pages);
      // La hoja que pasa de la derecha a la izquierda por delante (de a a -(π + a)).
      if (b.open > 0.6 && b.flip > 0 && b.flip < 1) part(a - (Math.PI + 2 * a) * b.flip, 0, 5 * PX, 1.3 * PX, 0.2 * PX, pages);
      // Lomo.
      const m = mat4.clone(base);
      mat4.translate(m, m, [0, 0, -0.6 * PX]);
      mat4.scale(m, m, [1 * PX, 10 * PX, 1 * PX]);
      out.push({ model: cover, m, light });
    }
    return out;
  }
}
