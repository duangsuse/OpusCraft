// Cofres (sencillos y dobles) y hornos (horno, ahumador y alto horno) compartidos: estado por
// posición, operaciones de los jugadores (clic, meter, sacar), hornos que funden solos, contenido
// que cae al romperlos y persistencia.
import {
  isContainer, isChest, isFurnace, furnaceVariant, isLitFurnace, furnaceWithLit, familyBase,
  stateProps, chestPartnerDir,
} from '../../blocks';
import { isDoubleChest, singleChestOf } from '../../blocks'; // Fase 7 (redstone): también los cofres trampa
import { DIR_X, DIR_Z } from '../../blockModels';
import { smeltXp } from '../../experience';
import type { ClientMsg, ServerMsg } from '../../protocol';
import type { ItemStack } from '../../items';
import {
  newContainer, clickSlot, insertStack, takeFromSlot, furnaceTick, containerToWire, containerFromWire, sanitizeStack,
  FURNACE_OUT, CHEST_SLOTS, DOUBLE_CHEST_SLOTS, type ContainerState, type ContainerWire, type FurnaceVariant,
} from '../../containers';
import type { ServerStore } from '../store';
import { LOOT_TABLES, rollLoot, scatterLoot } from '../../loot';
import type { StructureChest } from '../../world/structures';
import { posKey, keyX, keyY, keyZ } from '../posKey';
import type { ServerContext, Session } from './context';
// Fase 7 (pociones): el alambique alquímico destila solo y enseña sus frascos.
import { isBrewingStand, brewingStandMask, brewingStandWith } from '../../blocks';
import { brewTick, brewBottleMask, BREW_INGREDIENT, BREW_FUEL } from '../../brewing';
import { mechanismSlots } from '../../blocks'; // Fase 7 (mecanismos)
import { resolveStructureMaps } from '../../structureMaps'; // Fase 7.5 (océano)
import { isGuardedByPiglins } from '../../netherMobs'; // Fase 8.3 (criaturas del Nether)
import { isShulkerBox, isEnderChest, shulkerBoxFacing, shulkerBoxColor, familyBase as fb, BLOCK_COLLIDE } from '../../blocks'; // Fase 8.6
import { boxContents, packBox } from '../../containers';
import { stackFromWire } from '../../protocol';
import { SHIP_BREWING } from '../../world/endCity';
import { potionStack, PT_STRONG_HEALING } from '../../potions';
import { FACE_X, FACE_Y, FACE_Z } from '../../redstone/api';

/** Fase 8.6: el cofre de ender de un jugador desde lo guardado (27 huecos). */
export function enderFromWire(w: unknown): ContainerState {
  const c = newContainer('chest');
  if (Array.isArray(w)) w.slice(0, CHEST_SLOTS).forEach((x, i) => (c.slots[i] = sanitizeStack(stackFromWire(x))));
  return c;
}

/** Lo que ve un jugador: un contenedor o las dos mitades de un cofre doble (izquierda primero). */
interface View {
  parts: [number, ContainerState][];
  state: ContainerState;
}

export class ContainerSystem {
  private containers = new Map<number, ContainerState>();
  private dirty = new Set<number>();
  /**
   * Fase 7 (transporte): contenedores que no son bloques (barcas y vagonetas con cofre) en posiciones que
   * no existen en el mundo. container: su contenido (undefined si la posición no es de éstas; null si ya no
   * está o, con `s`, si está lejos del jugador); changed: se tocó.
   */
  virtual: { container(x: number, y: number, z: number, s?: Session): ContainerState | null | undefined; changed(x: number, y: number, z: number): void } | null = null;
  /** Fase 7 (redstone): cambió quién tiene abierto el contenedor de (x, y, z) (cofres trampa). */
  viewersChanged: ((x: number, y: number, z: number) => void) | null = null;
  /** Fase 7 (redstone): cambió el contenido del contenedor de (x, y, z) (comparadores). */
  contentsChanged: ((x: number, y: number, z: number) => void) | null = null;

  constructor(private ctx: ServerContext, store: ServerStore) {
    for (const [key, data] of store.loadContainers()) {
      try {
        const c = containerFromWire(JSON.parse(data) as ContainerWire);
        if (c) this.containers.set(key, c);
      } catch {
        /* ignorar */
      }
    }
  }

  /** Llena los cofres de una estructura con su botín (al generarse su chunk). */
  fillLoot(chests: StructureChest[]): void {
    const rand = () => this.ctx.rand();
    for (const ch of chests) {
      // Fase 8.6: el alambique del barco del End, con sus dos pociones de curación II.
      if (ch.table === SHIP_BREWING) {
        const k = posKey(ch.x, ch.y, ch.z);
        const c = newContainer('brewing');
        c.slots[0] = potionStack('drink', PT_STRONG_HEALING);
        c.slots[2] = potionStack('drink', PT_STRONG_HEALING);
        this.containers.set(k, c);
        this.dirty.add(k);
        continue;
      }
      const table = LOOT_TABLES[ch.table];
      if (!table) continue;
      const k = posKey(ch.x, ch.y, ch.z);
      const c = newContainer('chest');
      c.slots = scatterLoot(rollLoot(table, rand), CHEST_SLOTS, rand);
      resolveStructureMaps(c.slots, this.ctx.world.gen, ch.x, ch.z); // Fase 7.5 (océano): mapas del tesoro
      this.containers.set(k, c);
      this.dirty.add(k);
    }
  }

  get count(): number {
    return this.containers.size;
  }

  /** Fase 8.6: cajas de shulker recién rotas (posición → la caja y lo que tenía) hasta que se suelta su objeto. */
  private brokenBoxes = new Map<number, { id: number; slots: (ItemStack | null)[]; creative: boolean }>();
  /** Fase 8.6: ¿se está rompiendo sin soltar nada (un jugador en creativo)? (lo pone el servidor). */
  silentBreak: () => boolean = () => false;

  private containerAt(x: number, y: number, z: number): ContainerState | null {
    const id = this.ctx.world.getBlock(x, y, z);
    if (!isContainer(id) || isEnderChest(id)) return null; // Fase 8.6: el cofre de ender es de cada jugador
    const k = posKey(x, y, z);
    let c = this.containers.get(k);
    const size = mechanismSlots(id); // Fase 7 (mecanismos): tolva (5 huecos), dispensador y soltador (9)
    const kind = size || isChest(id) ? 'chest' : isBrewingStand(id) ? 'brewing' : 'furnace'; // Fase 7 (pociones)
    if (!c || c.kind !== kind || (size > 0 && c.slots.length !== size)) {
      c = newContainer(kind, size || undefined);
      this.containers.set(k, c);
    }
    if (isShulkerBox(id)) c.noBoxes = true; // Fase 8.6
    return c;
  }

  /** Pareja de una mitad de cofre doble: [x, y, z, lado de la mitad dada] o null. */
  private partnerOf(x: number, y: number, z: number): [number, number, number, number] | null {
    const id = this.ctx.world.getBlock(x, y, z);
    if (!isDoubleChest(id)) return null; // Fase 7 (redstone): también los cofres trampa
    const st = stateProps(id)!;
    const d = chestPartnerDir(st.facing, st.side);
    const px = x + DIR_X[d], pz = z + DIR_Z[d];
    return familyBase(this.ctx.world.getBlock(px, y, pz)) === familyBase(id) ? [px, y, pz, st.side] : null;
  }

  /** Lo que se ve al abrir (x, y, z): el contenedor o el cofre grande (Fase 8.6: o el cofre de ender de `s`). */
  private viewAt(x: number, y: number, z: number, s?: Session): View | null {
    const vc = this.virtual?.container(x, y, z); // Fase 7 (transporte)
    if (vc !== undefined) return vc ? { parts: [[posKey(x, y, z), vc]], state: vc } : null;
    if (isEnderChest(this.ctx.world.getBlock(x, y, z))) {
      if (!s) return null;
      s.ender ??= newContainer('chest');
      return { parts: [[posKey(x, y, z), s.ender]], state: s.ender };
    }
    const c = this.containerAt(x, y, z);
    if (!c) return null;
    const k = posKey(x, y, z);
    const p = this.partnerOf(x, y, z);
    const other = p ? this.containerAt(p[0], p[1], p[2]) : null;
    if (!p || !other || c.slots.length !== CHEST_SLOTS || other.slots.length !== CHEST_SLOTS) return { parts: [[k, c]], state: c };
    const pk = posKey(p[0], p[1], p[2]);
    const parts: [number, ContainerState][] = p[3] === 0 ? [[k, c], [pk, other]] : [[pk, other], [k, c]];
    const state = newContainer('chest', DOUBLE_CHEST_SLOTS);
    state.slots = [...parts[0][1].slots, ...parts[1][1].slots];
    return { parts, state };
  }

  /** Reparte en las mitades lo que cambió en la vista combinada. */
  private commit(v: View): void {
    if (v.parts.length === 1) return;
    v.parts[0][1].slots = v.state.slots.slice(0, CHEST_SLOTS);
    v.parts[1][1].slots = v.state.slots.slice(CHEST_SLOTS);
  }

  /** Contenedores destruidos: soltar su contenido y cerrar las ventanas abiertas. */
  onBlockChanged(x: number, y: number, z: number, old: number, id: number): void {
    // Fase 8.6: la caja de shulker se lleva lo que tenía (se guarda hasta que caiga su objeto) y el cofre de ender
    // cierra la ventana de quien lo tuviera abierto.
    if ((isShulkerBox(old) && fb(old) !== fb(id)) || (isEnderChest(old) && !isEnderChest(id))) {
      const k = posKey(x, y, z);
      if (isShulkerBox(old)) {
        const c = this.containers.get(k);
        this.containers.delete(k);
        this.dirty.add(k);
        this.brokenBoxes.set(k, { id: fb(old), slots: c ? c.slots.slice() : [], creative: this.silentBreak() });
      }
      for (const s of this.ctx.sessions()) {
        if (s.container !== k) continue;
        s.container = null;
        this.ctx.send(s, { t: 'cclose' });
      }
      return;
    }
    // Se rompe media cofre doble: la otra mitad vuelve a ser un cofre sencillo.
    if (isDoubleChest(old) && familyBase(id) !== familyBase(old)) {
      const st = stateProps(old)!;
      const d = chestPartnerDir(st.facing, st.side);
      const px = x + DIR_X[d], pz = z + DIR_Z[d];
      if (familyBase(this.ctx.world.getBlock(px, y, pz)) === familyBase(old)) this.ctx.world.setBlock(px, y, pz, singleChestOf(old, st.facing));
    }
    if (!isContainer(old) || isContainer(id)) return;
    const k = posKey(x, y, z);
    const c = this.containers.get(k);
    if (!c) return;
    this.containers.delete(k);
    this.dirty.add(k);
    this.ctx.entities.dropStacks(c.slots.filter((s): s is ItemStack => !!s), x + 0.5, y + 0.5, z + 0.5);
    for (const s of this.ctx.sessions()) {
      if (s.container === null) continue;
      if (s.container === k || this.viewKeys(s.container).includes(k)) {
        s.container = null;
        this.ctx.send(s, { t: 'cclose' });
      }
    }
  }

  /** Posiciones que forman la vista abierta en `k`. */
  private viewKeys(k: number): number[] {
    const p = this.partnerOf(keyX(k), keyY(k), keyZ(k));
    return p ? [k, posKey(p[0], p[1], p[2])] : [k];
  }

  /** Envía la vista a quien la tenga abierta (o sólo a `only`). */
  private sendView(k: number, only?: Session): void {
    for (const s of only ? [only] : this.ctx.sessions()) {
      if (s.container === null || !this.viewKeys(s.container).includes(k)) continue;
      const x = keyX(s.container), y = keyY(s.container), z = keyZ(s.container);
      const v = this.viewAt(x, y, z, s);
      if (!v) continue;
      const msg: ServerMsg = { t: 'cont', x, y, z, c: containerToWire(v.state) };
      this.ctx.send(s, msg);
    }
  }

  onOpen(s: Session, msg: Extract<ClientMsg, { t: 'open' }>): void {
    const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z);
    if (![x, y, z].every(Number.isInteger)) return;
    // Fase 7 (transporte): el cofre de una barca o vagoneta mira la distancia a la entidad.
    const vc = this.virtual?.container(x, y, z, s);
    if (vc === undefined ? !this.ctx.reachOk(s, x, y, z, 8) : !vc) {
      if (vc === null) this.ctx.send(s, { t: 'cclose' });
      return;
    }
    if (!this.viewAt(x, y, z, s) || !this.lidFree(x, y, z)) {
      this.ctx.send(s, { t: 'cclose' });
      return;
    }
    const k = posKey(x, y, z);
    if (s.container !== null && s.container !== k) this.close(s); // Fase 7 (redstone)
    s.container = k;
    this.notifyViewers(k); // Fase 7 (redstone)
    this.sendView(k, s);
    // Fase 8.3: abrir un cofre, un barril o una caja de shulker (o el cofre de una vagoneta) delante de los piglins los enfada.
    if (vc || isGuardedByPiglins(this.ctx.world.getBlock(x, y, z))) this.ctx.entities.mobs.nether.piglins.angerNearby(s.id, s.p[0], s.p[1], s.p[2], true);
  }

  onOp(s: Session, msg: Extract<ClientMsg, { t: 'cclick' | 'cput' | 'ctake' }>): void {
    const ctx = this.ctx;
    const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z);
    const q = Number(msg.q) || 0;
    if (![x, y, z].every(Number.isInteger)) return;
    const k = posKey(x, y, z);
    const v = s.container === k && ctx.allow(s, 1) ? this.viewAt(x, y, z, s) : null;
    if (!v) {
      // Contenedor cerrado o destruido: devolver al jugador lo que ofrecía.
      if (msg.t === 'cclick') ctx.send(s, { t: 'cres', q, cur: sanitizeStack(msg.cur) });
      else if (msg.t === 'cput') ctx.send(s, { t: 'cres', q, give: sanitizeStack(msg.stack) });
      else ctx.send(s, { t: 'cres', q, give: null });
      ctx.send(s, { t: 'cclose' });
      return;
    }
    const c = v.state;
    // Lo que había en la salida del horno (para dar la experiencia de lo que se saque).
    const out = c.kind === 'furnace' ? c.slots[FURNACE_OUT] : null;
    const before = out ? { id: out.id, count: out.count } : null;
    if (msg.t === 'cclick') {
      const slot = Number(msg.slot), btn = Number(msg.btn) === 1 ? 1 : 0;
      const cur = sanitizeStack(msg.cur);
      const res = Number.isInteger(slot) ? clickSlot(c, slot, btn, cur) : cur;
      ctx.send(s, { t: 'cres', q, cur: res });
    } else if (msg.t === 'cput') {
      ctx.send(s, { t: 'cres', q, give: insertStack(c, sanitizeStack(msg.stack)) });
    } else {
      const slot = Number(msg.slot), max = Math.max(0, Math.min(64, Number(msg.max) | 0));
      ctx.send(s, { t: 'cres', q, give: Number.isInteger(slot) && slot >= 0 && slot < c.slots.length ? takeFromSlot(c, slot, max) : null });
    }
    this.commit(v);
    if (before) this.smeltReward(s, before.id, before.count - (c.slots[FURNACE_OUT]?.count ?? 0));
    if (this.virtual?.container(x, y, z) !== undefined) this.virtual.changed(x, y, z); // Fase 7 (transporte)
    else if (v.state === s.ender) s.saveDirty = true; // Fase 8.6: el cofre de ender va con el jugador
    else {
      for (const [pk] of v.parts) {
        this.dirty.add(pk);
        this.contentsChanged?.(keyX(pk), keyY(pk), keyZ(pk)); // Fase 7 (redstone)
      }
    }
    this.sendView(k);
  }

  /**
   * Fase 8.6 (ShulkerBoxBlock.canOpen): la caja de shulker sólo se abre si la tapa tiene sitio (la mitad del bloque de
   * delante de la tapa, sin nada que choque).
   */
  private lidFree(x: number, y: number, z: number): boolean {
    const id = this.ctx.world.getBlock(x, y, z);
    if (!isShulkerBox(id)) return true;
    const f = shulkerBoxFacing(id);
    const n = this.ctx.world.getBlock(x + FACE_X[f], y + FACE_Y[f], z + FACE_Z[f]);
    return n <= 0 || !BLOCK_COLLIDE[n];
  }

  /** Fase 8.6: la caja de shulker que cae donde se rompió una se lleva dentro lo que tenía. */
  decorateDrops(stacks: ItemStack[], x: number, y: number, z: number): ItemStack[] {
    if (this.brokenBoxes.size === 0) return stacks;
    const k = posKey(Math.floor(x), Math.floor(y), Math.floor(z));
    const b = this.brokenBoxes.get(k);
    if (!b) return stacks;
    const i = stacks.findIndex((s) => s && s.count === 1 && !s.bag && fb(s.id) === b.id);
    if (i < 0) return stacks;
    this.brokenBoxes.delete(k);
    const out = stacks.slice();
    const packed = packBox(b.id, b.slots);
    out[i] = { ...stacks[i], ...(packed.bag ? { bag: packed.bag } : {}), ...(packed.data ? { data: { ...(stacks[i].data ?? {}), ...packed.data } } : {}) };
    return out;
  }

  /**
   * Fase 8.6: al final del tick, las cajas rotas que no soltaron nada (en creativo, o por una explosión que no las
   * soltó) caen igual con lo suyo; en creativo, sólo si llevaban algo (ShulkerBoxBlock.playerWillDestroy).
   */
  endTick(): void {
    for (const [k, b] of this.brokenBoxes) {
      if (b.creative && !b.slots.some(Boolean)) continue;
      this.ctx.entities.dropStacks([packBox(b.id, b.slots)], keyX(k) + 0.5, keyY(k) + 0.5, keyZ(k) + 0.5);
    }
    this.brokenBoxes.clear();
  }

  /** Fase 8.6: se puso una caja de shulker con cosas dentro: lo suyo, a su contenedor. */
  fillPlacedBox(x: number, y: number, z: number, stack: ItemStack | null): void {
    if (!stack || !isShulkerBox(this.ctx.world.getBlock(x, y, z)) || shulkerBoxColor(stack.id) !== shulkerBoxColor(this.ctx.world.getBlock(x, y, z))) return;
    const slots = boxContents(stack);
    if (!slots.some(Boolean)) return;
    const c = this.containerAt(x, y, z);
    if (!c) return;
    c.slots = slots;
    const k = posKey(x, y, z);
    this.dirty.add(k);
    this.contentsChanged?.(x, y, z);
  }

  /** El jugador sacó `taken` objetos fundidos: orbes de experiencia a sus pies. */
  private smeltReward(s: Session, item: number, taken: number): void {
    if (taken <= 0) return;
    const xp = smeltXp(item, taken, () => this.ctx.rand());
    if (xp > 0) this.ctx.entities.xp.spawn(xp, s.p[0], s.p[1] + 0.5, s.p[2]);
  }

  /** Hornos: funden, se encienden y se apagan (cambian de bloque conservando la orientación). */
  tickFurnaces(dt: number): void {
    const w = this.ctx.world;
    for (const [k, c] of this.containers) {
      if (c.kind === 'brewing') this.tickBrewing(k, c, dt); // Fase 7 (pociones)
      if (c.kind !== 'furnace') continue;
      const x = keyX(k), y = keyY(k), z = keyZ(k);
      const id = w.getBlock(x, y, z);
      if (id < 0 || !isFurnace(id)) continue;
      const active = c.burn > 0 || c.slots[0] !== null;
      if (!active) continue;
      const res = furnaceTick(c, dt, furnaceVariant(id) as FurnaceVariant);
      if (res.changed) {
        this.dirty.add(k);
        this.contentsChanged?.(x, y, z); // Fase 7 (redstone)
      }
      if (res.lit !== isLitFurnace(id)) w.setBlock(x, y, z, furnaceWithLit(id, res.lit));
      if (res.changed || c.burn > 0) this.sendView(k);
    }
  }

  /**
   * Fase 7 (pociones): el alambique destila (con combustible e ingrediente), avisa al acabar y el bloque
   * enseña los frascos que tiene dentro.
   */
  private tickBrewing(k: number, c: ContainerState, dt: number): void {
    const w = this.ctx.world;
    const x = keyX(k), y = keyY(k), z = keyZ(k);
    const id = w.getBlock(x, y, z);
    if (id < 0 || !isBrewingStand(id)) return;
    if (c.cook > 0 || c.slots[BREW_INGREDIENT] || (c.burn <= 0 && c.slots[BREW_FUEL])) {
      const res = brewTick(c, dt);
      if (res.changed) {
        this.dirty.add(k);
        this.contentsChanged?.(x, y, z); // Fase 7 (redstone)
      }
      if (res.done) this.ctx.fx('brew_done', x + 0.5, y + 0.6, z + 0.5);
      if (res.changed || c.cook > 0) this.sendView(k);
    }
    const mask = brewBottleMask(c);
    if (brewingStandMask(id) !== mask) w.setBlock(x, y, z, brewingStandWith(mask));
  }

  // ------------------------------------------------------------------ Fase 7 (redstone)

  /** El jugador cierra el contenedor que tenía abierto (o se va). */
  close(s: Session): void {
    const k = s.container;
    if (k === null) return;
    s.container = null;
    this.notifyViewers(k);
  }

  private notifyViewers(k: number): void {
    if (this.viewersChanged) for (const vk of this.viewKeys(k)) this.viewersChanged(keyX(vk), keyY(vk), keyZ(vk));
  }

  /** Jugadores que tienen abierto el contenedor de (x, y, z) (los dos lados de un cofre doble cuentan). */
  viewers(x: number, y: number, z: number): number {
    const k = posKey(x, y, z);
    let n = 0;
    for (const s of this.ctx.sessions()) if (s.joined && s.container !== null && this.viewKeys(s.container).includes(k)) n++;
    return n;
  }

  /** Casillas que ve un comparador en (x, y, z): las del contenedor o las del cofre doble entero. */
  slotsAt(x: number, y: number, z: number): readonly (ItemStack | null)[] | null {
    return this.viewAt(x, y, z)?.state.slots ?? null;
  }

  /**
   * Fase 7 (mecanismos): contenido del contenedor de bloque de (x, y, z) (el cofre doble entero) para las
   * tolvas, los soltadores y los dispensadores, que lo cambian directamente; `done` guarda el cambio, avisa
   * a los comparadores y lo enseña a quien lo tenga abierto. null si no hay contenedor.
   */
  access(x: number, y: number, z: number): { state: ContainerState; done(): void } | null {
    const v = this.viewAt(x, y, z);
    if (!v) return null;
    const virtual = this.virtual?.container(x, y, z) !== undefined; // barcas y vagonetas con cofre o tolva
    return {
      state: v.state,
      done: () => {
        if (virtual) this.virtual!.changed(x, y, z);
        else {
          this.commit(v);
          for (const [pk] of v.parts) {
            this.dirty.add(pk);
            this.contentsChanged?.(keyX(pk), keyY(pk), keyZ(pk));
          }
        }
        this.sendView(posKey(x, y, z));
      },
    };
  }

  /** Guarda los contenedores que cambiaron. */
  flush(store: ServerStore): void {
    for (const k of this.dirty) {
      const c = this.containers.get(k);
      store.saveContainer(k, c ? JSON.stringify(containerToWire(c)) : null);
    }
    this.dirty.clear();
  }
}
