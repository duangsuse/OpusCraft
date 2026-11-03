// Fase 6 (gólems/domesticar): construir gólems y poblar las aldeas.
// - Al colocar una calabaza tallada (o un farol de calabaza) se mira si corona un gólem, como en
//   Minecraft: dos bloques de nieve debajo → gólem de nieve; una T de cuatro bloques de hierro (dos
//   en la columna y dos brazos a los lados del de arriba) → gólem de hierro. Los bloques desaparecen
//   y aparece el gólem donde estaba el bloque de abajo.
// - La primera vez que un jugador se acerca a una aldea aparecen su gólem de hierro y unos gatos
//   junto al pozo (se apunta en el almacén para no repetirlo).
import { AIR, SNOW_BLOCK, IRON_BLOCK, CARVED_PUMPKIN, JACK_O_LANTERN, BLOCK_FLUID, familyBase } from '../../blocks';
import { MOBS, MOB_IRON_GOLEM, MOB_SNOW_GOLEM, MOB_CAT } from '../../mobs';
import { CAT_SKINS } from '../../companions';
import { locateStructure } from '../../world/structures';
import { standable } from '../pathfind';
import type { Entity } from '../entities';
import type { ServerStore } from '../store';
import type { ServerContext } from './context';

/** Distancia a una aldea (desde el pozo) a la que se puebla. */
const VILLAGE_NEAR = 64;
/** Gatos por aldea: [mín, máx]. */
const VILLAGE_CATS: [number, number] = [2, 3];

export class Golems {
  /** Calabazas colocadas en el último tick: [x, y, z]. */
  private pending: [number, number, number][] = [];

  constructor(private ctx: ServerContext, private store: ServerStore) {}

  onBlockChanged(x: number, y: number, z: number, id: number): void {
    const base = familyBase(id);
    if ((base === CARVED_PUMPKIN || base === JACK_O_LANTERN) && this.pending.length < 64) this.pending.push([x, y, z]);
  }

  tick(): void {
    if (this.pending.length) {
      const list = this.pending;
      this.pending = [];
      for (const [x, y, z] of list) this.tryBuild(x, y, z);
    }
    if (this.ctx.tickCount % 100 === 50) this.populateVillages();
  }

  /** ¿Corona la calabaza de (x, y, z) un gólem? Si es así, lo crea. */
  tryBuild(x: number, y: number, z: number): Entity | null {
    const w = this.ctx.world;
    const base = familyBase(w.getBlock(x, y, z));
    if (base !== CARVED_PUMPKIN && base !== JACK_O_LANTERN) return null;
    const at = (dx: number, dy: number, dz: number) => w.getBlock(x + dx, y + dy, z + dz);
    // Gólem de nieve: calabaza sobre dos bloques de nieve.
    if (at(0, -1, 0) === SNOW_BLOCK && at(0, -2, 0) === SNOW_BLOCK) {
      return this.assemble(x, y, z, [[0, 0, 0], [0, -1, 0], [0, -2, 0]], MOB_SNOW_GOLEM);
    }
    // Gólem de hierro: columna de dos bloques de hierro con brazos a los lados del de arriba (en X o en Z).
    if (at(0, -1, 0) === IRON_BLOCK && at(0, -2, 0) === IRON_BLOCK) {
      for (const [ax, az] of [[1, 0], [0, 1]]) {
        if (at(ax, -1, az) !== IRON_BLOCK || at(-ax, -1, -az) !== IRON_BLOCK) continue;
        return this.assemble(x, y, z, [[0, 0, 0], [0, -1, 0], [0, -2, 0], [ax, -1, az], [-ax, -1, -az]], MOB_IRON_GOLEM);
      }
    }
    return null;
  }

  private assemble(x: number, y: number, z: number, cells: number[][], type: number): Entity | null {
    const ctx = this.ctx;
    for (const [dx, dy, dz] of cells) ctx.world.setBlock(x + dx, y + dy, z + dz, AIR);
    const e = ctx.entities.spawnMob(type, x + 0.5, y - 2, z + 0.5);
    if (!e) return null;
    e.playerMade = true;
    e.yaw = e.bodyYaw;
    ctx.fx('golem_build', x + 0.5, y - 1, z + 0.5, type);
    return e;
  }

  // ------------------------------------------------------------------ aldeas

  /** Puebla las aldeas cercanas a los jugadores que aún no se habían poblado. */
  private populateVillages(): void {
    const ctx = this.ctx;
    for (const s of ctx.sessions()) {
      if (!s.joined) continue;
      const v = locateStructure(ctx.world.gen, 'village', s.p[0], s.p[2], 1);
      if (!v || Math.hypot(v[0] - s.p[0], v[2] - s.p[2]) > VILLAGE_NEAR) continue;
      this.populateVillage(v[0], v[1], v[2]);
    }
  }

  /** Gólem de hierro y gatos junto al pozo de la aldea (x, y, z); una sola vez por aldea. */
  populateVillage(x: number, y: number, z: number): boolean {
    const key = `aldea:${x},${z}`;
    if (this.store.getMeta(key)) return false;
    const w = this.ctx.world;
    // Hace falta el terreno alrededor del pozo.
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (!w.isLoaded(Math.floor(x / 16) + dx, Math.floor(z / 16) + dz)) return false;
    this.store.setMeta(key, '1');
    this.spawnNear(MOB_IRON_GOLEM, x, y, z);
    const [lo, hi] = VILLAGE_CATS;
    const n = lo + Math.floor(this.ctx.rand() * (hi - lo + 1));
    for (let i = 0; i < n; i++) {
      const cat = this.spawnNear(MOB_CAT, x, y, z);
      if (cat) cat.variant = Math.floor(this.ctx.rand() * CAT_SKINS.length);
    }
    return true;
  }

  /** Aparece una criatura en un hueco de pie a 3–10 bloques de (x, z), sobre el suelo. */
  private spawnNear(type: number, x: number, y: number, z: number): Entity | null {
    const w = this.ctx.world;
    const h = Math.ceil(MOBS[type].height);
    for (let attempt = 0; attempt < 24; attempt++) {
      const a = this.ctx.rand() * Math.PI * 2, r = 3 + this.ctx.rand() * 7;
      const bx = Math.floor(x + Math.cos(a) * r), bz = Math.floor(z + Math.sin(a) * r);
      const top = w.skyTop(bx, bz);
      if (Math.abs(top - y) > 8) continue;
      const by = top + 1;
      const floor = w.getBlock(bx, top, bz);
      if (floor <= 0 || BLOCK_FLUID[floor] || !standable(w, bx, by, bz, h)) continue;
      return this.ctx.entities.spawnMob(type, bx + 0.5, by, bz + 0.5);
    }
    return null;
  }
}
