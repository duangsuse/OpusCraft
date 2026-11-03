// Fase 7 (mecanismos): los mecanismos del servidor juntos (lo que GameServer crea y avisa).
// - Pistones (pistons.ts), tolvas (hoppers.ts), dispensadores y soltadores (dispensers.ts), dinamita y
//   explosiones (tnt.ts) y las vagonetas con tolva y con dinamita (mechanismCarts.ts).
// - Observadores (aquí), como ObserverBlock de Java: la actualización de forma que llega por su cara (cualquier
//   cambio de estado del bloque que vigila, también uno que empieza o termina de moverse) programa un tick a los
//   2; en él se enciende 2 ticks (sin avisar: opción 2) y avisa al bloque de detrás y a los vecinos de ese.
// Se enganchan a la redstone con su API (docs/redstone.md): no tocan el motor.
import { OBSERVER, TNT, observerPowered, observerWith, facingOf, familyBase } from '../../blocks';
import { registerRedstone, FACE_X, FACE_Y, FACE_Z, UPDATE_CLIENTS, UPDATE_KNOWN_SHAPE, type RedstoneApi } from '../../redstone';
import { Pistons } from './pistons';
import { Hoppers } from './hoppers';
import { Dispensers } from './dispensers';
import { Explosives } from './tnt';
import { Inventories } from './inventories';
import { bindCarts } from './mechanismCarts';
import type { Redstone } from './redstone';
import type { BlockRules } from './blockRules';
import type { ContainerSystem } from './containerSystem';
import type { Composters } from './composters';
import type { Collections } from './collections';
import type { Shelves } from './shelves';
import type { Transport } from './vehicles';
import type { Fire } from './fire';
import type { ArmorStands } from './armorStands';
import type { ServerContext } from './context';

/** Duración del pulso del observador y su retardo (2 ticks de juego). */
const OBSERVER_TICKS = 2;

/** updateNeighborsInFront del observador: el bloque de detrás (su salida) y los vecinos de ese, menos él. */
function observerFront(api: RedstoneApi, x: number, y: number, z: number, id: number): void {
  const back = facingOf(id) ^ 1;
  const bx = x + FACE_X[back], by = y + FACE_Y[back], bz = z + FACE_Z[back];
  api.updateAt(bx, by, bz, x, y, z, id);
  api.updateNeighbors(bx, by, bz, back ^ 1, id);
}

registerRedstone(OBSERVER, {
  // Pulso: se enciende y a los 2 ticks se apaga (sin avisar al cambiar; avisa detrás).
  tick: (api, x, y, z, id) => {
    if (observerPowered(id)) api.setBlock(x, y, z, observerWith(id, false), UPDATE_CLIENTS);
    else {
      api.setBlock(x, y, z, observerWith(id, true), UPDATE_CLIENTS);
      api.schedule(x, y, z, OBSERVER_TICKS);
    }
    observerFront(api, x, y, z, id);
  },
  // updateShape: lo que cambia delante de su cara.
  shape: (api, x, y, z, id, face) => {
    if (face === facingOf(id) && !observerPowered(id) && !api.isScheduled(x, y, z)) api.schedule(x, y, z, OBSERVER_TICKS);
    return id;
  },
  // onPlace: uno puesto encendido (por un pistón, un comando…) se apaga sin avisar y avisa detrás.
  placed: (api, x, y, z, old, id) => {
    if (old >= 0 && !(old > 0 && familyBase(old) === OBSERVER) && observerPowered(id) && !api.isScheduled(x, y, z)) {
      const off = observerWith(id, false);
      api.setBlock(x, y, z, off, UPDATE_CLIENTS | UPDATE_KNOWN_SHAPE);
      observerFront(api, x, y, z, off);
    }
  },
  // onRemove: uno quitado a media señal avisa detrás de que se apaga.
  removed: (api, x, y, z, old, id) => {
    if (!(id > 0 && familyBase(id) === OBSERVER) && observerPowered(old) && api.isScheduled(x, y, z)) observerFront(api, x, y, z, observerWith(old, false));
  },
  // Guardado encendido: que se apague.
  changed: (api, x, y, z, old, id) => {
    if (old < 0 && observerPowered(id)) api.schedule(x, y, z, 1);
  },
});

export interface MechanismDeps {
  ctx: ServerContext;
  redstone: Redstone;
  rules: BlockRules;
  containers: ContainerSystem;
  composters: Composters;
  collections: Collections;
  shelves: Shelves;
  transport: Transport;
  fire: Fire;
  stands: ArmorStands;
  /** Polvo de hueso sobre el bloque (x, y, z) (el de la granja). */
  fertilize(x: number, y: number, z: number): boolean;
}

export class Mechanisms {
  readonly inventories: Inventories;
  readonly pistons: Pistons;
  readonly hoppers: Hoppers;
  readonly explosives: Explosives;
  readonly dispensers: Dispensers;

  constructor(private d: MechanismDeps) {
    const { ctx, redstone } = d;
    this.inventories = new Inventories(ctx, d.containers, d.composters, d.collections, d.shelves);
    this.pistons = new Pistons(ctx, redstone, d.rules);
    // Lo que se mueve no se pierde: se guarda ya asentado y, si el chunk se descarga, se asienta antes.
    ctx.world.savedInstead = () => this.pistons.settledCells();
    ctx.world.onChunkUnload = (c) => this.pistons.settleChunk(c.cx, c.cz);
    this.hoppers = new Hoppers(ctx, redstone, this.inventories);
    // Lo que cambia en un contenedor despierta a las tolvas que sacan de él o meten en él.
    const contentsChanged = d.containers.contentsChanged;
    d.containers.contentsChanged = (x, y, z) => {
      contentsChanged?.(x, y, z);
      this.hoppers.contentsChanged(x, y, z);
    };
    this.explosives = new Explosives(ctx, redstone, d.transport);
    this.dispensers = new Dispensers(ctx, redstone, this.inventories, this.explosives, d.fire, d.transport, d.stands, { fertilize: d.fertilize });
    bindCarts(d.transport, { inv: this.inventories, containers: d.containers, tnt: this.explosives });
    this.pistons.vehicleBody = (id) => {
      const v = d.transport.vehicleOf(id);
      return v?.cart ?? v?.boat;
    };
  }

  /** Cada cambio de bloque: pistones (base y cabeza). Los observadores van por las formas (el motor). */
  onBlockChanged(x: number, y: number, z: number, old: number, id: number): void {
    this.pistons.onBlockChanged(x, y, z, old, id);
  }

  /**
   * Cada tick (después de la redstone): se asienta lo que movieron los pistones, las tolvas mueven lo suyo
   * (y los comparadores se enteran en el acto, como en Minecraft) y explotan las vagonetas.
   */
  tick(): void {
    this.hoppers.itemsInside(); // (fase de entidades) lo que cae dentro de una tolva
    this.pistons.tick();
    this.hoppers.tick();
    this.d.redstone.flush();
    this.explosives.tick();
  }

  /** Un proyectil se clavó en (bx, by, bz): una flecha en llamas enciende la dinamita. */
  projectileHit(kind: string, bx: number, by: number, bz: number, fire: boolean): void {
    if (kind === 'arrow' && fire && this.d.ctx.world.getBlock(bx, by, bz) === TNT) this.explosives.prime(bx, by, bz);
  }

  /** El mechero (o el fuego) alcanza el bloque (x, y, z): si es dinamita, se enciende. */
  light(x: number, y: number, z: number): boolean {
    return this.d.ctx.world.getBlock(x, y, z) === TNT && this.explosives.prime(x, y, z);
  }
}
