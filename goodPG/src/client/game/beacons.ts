// Fase 8.5 (lo que da el Nether): los faros que ve el cliente. Se descubren al mallar cada columna (se buscan en sus
// bloques) y cada medio segundo se repasa su pirámide y su haz, como hace Java en el cliente; lo que dice el
// servidor es qué efectos se eligieron en cada uno. Dan el haz que se dibuja, el nivel para su pantalla y los
// sonidos de encenderse, apagarse y el zumbido de cerca.
import { BEACON } from '../../shared/blocks';
import { beaconActive, type BeamSegment } from '../../shared/beacon';
import { indexY } from '../../shared/constants';
import type { Column } from '../world/World';
import type { Game } from './Game';

interface Beacon {
  x: number;
  y: number;
  z: number;
  level: number;
  segments: BeamSegment[] | null;
  /** Encendido (nivel ≥ 1 y el haz llega arriba) y desde cuándo (para que el haz crezca al encenderse). */
  active: boolean;
  since: number;
}

/** Un haz para dibujar. */
export interface BeaconBeam {
  x: number;
  y: number;
  z: number;
  segments: BeamSegment[];
  /** Segundos desde que se encendió (el haz sube). */
  age: number;
}

export class Beacons {
  /** Faros de cada columna (clave de la columna). */
  private byColumn = new Map<string, Beacon[]>();
  /** Efectos elegidos de cada faro («x,y,z» → [principal, secundario]). */
  readonly effects = new Map<string, [number, number]>();
  private timer = 0;
  private hum = 0;
  private time = 0;

  constructor(private g: Game) {}

  /** Una columna se malló: sus faros (conserva el estado de los que ya se conocían). */
  onColumn(col: Column): void {
    const blocks = col.blocks;
    if (!blocks) return;
    const old = this.byColumn.get(col.key) ?? [];
    const found: Beacon[] = [];
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i] !== BEACON) continue;
      const x = col.cx * 16 + (i & 15), z = col.cz * 16 + ((i >> 4) & 15), y = indexY(i);
      found.push(old.find((b) => b.x === x && b.y === y && b.z === z) ?? { x, y, z, level: -1, segments: null, active: false, since: -100 });
    }
    if (found.length) this.byColumn.set(col.key, found);
    else this.byColumn.delete(col.key);
  }

  /** Cambio de dimensión: se olvida todo. */
  reset(): void {
    this.byColumn.clear();
    this.effects.clear();
  }

  /** Lo que dice el servidor de un faro. */
  onServer(x: number, y: number, z: number, p: number, s: number): void {
    this.effects.set(`${x},${y},${z}`, [p, s]);
  }

  /** Nivel del faro de (x, y, z) según su pirámide (0 si no lo hay). */
  levelAt(x: number, y: number, z: number): number {
    const w = this.g.world;
    return w ? beaconActive((a, b, c) => w.getBlock(a, b, c), x, y, z).level : 0;
  }

  update(dt: number): void {
    const g = this.g, w = g.world;
    if (!w) return;
    this.time += dt;
    this.timer -= dt;
    const get = (a: number, b: number, c: number) => w.getBlock(a, b, c);
    const p = g.player;
    if (this.timer <= 0) {
      this.timer = 0.5;
      for (const [key, list] of this.byColumn) {
        if (!w.columns.has(key)) {
          this.byColumn.delete(key);
          continue;
        }
        for (const b of list) {
          const { level, segments } = beaconActive(get, b.x, b.y, b.z);
          const active = level > 0 && !!segments;
          const first = b.level < 0; // recién visto: sin sonido ni haz que crece
          b.level = level;
          b.segments = segments;
          if (active === b.active) continue;
          b.active = active;
          b.since = first ? -100 : this.time;
          if (first) continue;
          if (Math.hypot(b.x - p.x, b.y - p.y, b.z - p.z) < 32) g.audio.playEnchantSfx(active ? 'beacon_activate' : 'beacon_deactivate', [b.x + 0.5, b.y + 0.5, b.z + 0.5]);
        }
      }
    }
    // Zumbido de los encendidos cercanos (cada 4 s, como el ambiente del faro).
    this.hum -= dt;
    if (this.hum <= 0) {
      this.hum = 4;
      for (const list of this.byColumn.values()) {
        for (const b of list) {
          if (b.active && Math.hypot(b.x - p.x, b.y - p.y, b.z - p.z) < 16) g.audio.playEnchantSfx('beacon_ambient', [b.x + 0.5, b.y + 0.5, b.z + 0.5]);
        }
      }
    }
  }

  /** Haces de los faros encendidos para el renderizador. */
  beams(): BeaconBeam[] {
    const out: BeaconBeam[] = [];
    for (const list of this.byColumn.values()) {
      for (const b of list) if (b.active && b.segments) out.push({ x: b.x, y: b.y, z: b.z, segments: b.segments, age: this.time - b.since });
    }
    return out;
  }
}
