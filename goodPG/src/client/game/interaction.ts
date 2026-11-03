// Interacción con el mundo: minar y romper, colocar (reglas compartidas), usar bloques (puertas,
// camas, tartas, compostadores), comer y beber, arco, escudo, cubos, azada, polvo de hueso, tallar
// calabazas, lanzar huevos, pescar, animales (dar de comer, esquilar, ordeñar), ponerse armadura,
// recoger y tirar objetos.
import { KNOCKBACK } from '../../shared/enchantments'; // el golpe con Empuje también corta la carrera
import { isShulkerBox } from '../../shared/blocks'; // Fase 8.6
import { stackToWire } from '../../shared/protocol';
import { isBundle, bundleEmpty } from '../../shared/bundles'; // Fase 6.5 (remate)
import { raycast, type RayHit } from './raycast';
import { netherGoodsUse } from './netherGoodsUse'; // Fase 8.5
import { endAfterEat, itemCooldown, endFrameUse, endThrow, isEndThrowable, endEggPunch } from './endClient'; // Fase 8.6
import type { ClientEntity } from './ClientEntities';
import { breakTime } from './mining';
import { planPlacement, partnerOf, toggleEdits, isUsable, canFertilize } from '../../shared/placement';
import { LILY_PAD, CAVE_VINES, BLOCK_NEEDS_SUPPORT, AIR, BLOCKS, BLOCK_RENDER, BLOCK_SOLID, BLOCK_REPLACEABLE, BLOCK_FLUID, BLOCK_FLUID_LEVEL, BLOCK_HARDNESS, WATER, LAVA, CACTUS, SUGAR_CANE, R_CROSS, R_TORCH, BEDROCK, CRAFTING_TABLE, GRASS, DIRT, SAND, RED_SAND, isContainer, BLOCK_COLLIDE, BLOCK_WALL, blockCollisionBoxes, isBed, familyBase, isCrop, isCake, FARMLAND, PUMPKIN, COMPOSTER, CARVED_PUMPKIN, orientedFor, isSign, STONECUTTER,
  isCampfire, stateProps } from '../../shared/blocks';
import {
  ITEMS, ARROW, BUCKET, WATER_BUCKET, LAVA_BUCKET, BONE_MEAL, SHEARS, EGG, BREED_FOOD, isValidItem, itemForBlock, maxStack,
  SNOWBALL, EMPTY_MAP, FILLED_MAP, type ItemStack,
} from '../../shared/items';
import { mapKeyAt } from '../../shared/maps';
import { COMPOSTER_READY, canCompost, composterLevel } from '../../shared/composting';
import { variantSmelts } from '../../shared/containers';
import { attackCooldown } from '../../shared/combat';
import { MOBS, ENT_ITEM, ENT_ARROW, ENT_DISPLAY, MOB_ENDERMAN, MOB_SHEEP, MOB_COW } from '../../shared/mobs';
import { EF_BABY, EF_SHEARED, EF_PICKABLE, type ServerMsg } from '../../shared/protocol';
import { REACH_CREATIVE, REACH_SURVIVAL, SOIL, SAPLINGS, type Mining, type Use } from './gameTypes';
import type { ArmorSource } from './Survival';
import { OFFHAND, HOTBAR } from './Inventory';
import type { Game } from './Game';
// Fase 6 (acuáticos): cubos con criatura.
import { MOB_BUCKETS, mobInBucket } from '../../shared/aquaticMobs';
import { MOB_DOLPHIN } from '../../shared/aquaticMobs'; // Fase 7.5 (océano)
import { COD, SALMON } from '../../shared/items'; // Fase 7.5 (océano)
import { companionUse } from '../../shared/companions'; // Fase 6 (gólems/domesticar)
import { useOnBeeHome, faunaCanInteract, faunaAfterEat } from './faunaInteraction'; // Fase 6 (fauna)
import { critterCanInteract } from './critterInteraction'; // Fase 7.5 (fauna)
import { afterDrinkOminous } from './raidClient'; // Fase 6 (asaltos)
import { useAxeOnWood } from './woodInteraction'; // Fase 6.5 (maderas)
import { canAddCandle } from '../../shared/blocks'; // Fase 6.5 (colores)
import { useOnCopper } from './copperInteraction'; // Fase 6.5 (cobre)
import { decorUse, decorAfterEat } from './decorInteraction'; // Fase 6.5 (decoración)
import { leashUse } from './leashInteraction'; // Fase 6.5 (remate)
import { cauldronClick } from './cauldronInteraction'; // Fase 6.5 (calderos)
import { equipmentUse, equipmentHold, equipmentRelease, EQUIPMENT_WEARLESS } from './equipmentInteraction'; // Fase 6.5 (equipo)
import { ENT_TRIDENT } from '../../shared/equipment';
import { TRIDENT } from '../../shared/items';
import { MOB_ALLAY } from '../../shared/allay'; // Fase 7.5 (mansión)
import { allayCanInteract } from './allayClient';
import { SWEET_BERRY_BUSH, isWaterlogged } from '../../shared/blocks'; // Fase 6.5 (océano y plantas)
import { CARTOGRAPHY_TABLE } from '../../shared/blocks'; // Fase 7.6: mesa de cartografía
import { withWater, emptyAfterPlayerBreak } from '../../shared/blocks'; // Fase 7: anegar con el cubo y el hielo que deja agua
import { levelIn } from '../../shared/enchantEffects';
import { SILK_TOUCH } from '../../shared/enchantments';
import { materialsUse } from './materialsInteraction'; // Fase 6.5 (materiales)
import { collectionUse } from './collectionInteraction'; // Fase 6.5 (colecciones)
import { potionUse, drinkPotion, hasArrows, takeArrow } from './potionClient'; // Fase 7 (pociones)
import { TIPPED_ARROW, SPECTRAL_ARROW } from '../../shared/items';
import { SPECTRAL_ARROW_TYPE } from '../../shared/potions'; // Fase 8.3: la flecha espectral
import { isVehicleType } from '../../shared/vehicles'; // Fase 7 (transporte)
import { EXPERIENCE_BOTTLE } from '../../shared/items'; // Fase 7 (encantamientos)
import { INFINITY, enchLevel } from '../../shared/enchantments';
import { redstoneUse } from './redstoneClient'; // Fase 7 (redstone)
import { dimensionDef } from '../../shared/dimensions'; // Fase 8 (dimensiones)

/** Herramientas que no se gastan al picar ni al golpear (sólo con su propio uso). */
const WEARLESS: ReadonlySet<string> = new Set(['bow', 'shield', 'fishing_rod', ...EQUIPMENT_WEARLESS]); // Fase 6.5 (equipo)

export class Interaction {
  constructor(private g: Game) {}

  placeCooldown = 0;
  breakDelay = 0;
  /** Momento (ms) del último golpe o manotazo al aire: de ahí sale la carga del siguiente ataque. */
  lastSwing = 0;
  mining: Mining | null = null;
  use: Use | null = null;
  pickupAsk = new Map<number, number>();
  pendingOpen: [number, number, number] | null = null;
  /** Usos de objetos sobre criaturas a la espera de respuesta del servidor. */
  interactQ = 0;
  pendingInteract = new Map<number, { slot: number; item: number }>();
  /** Armadura para Survival: la del inventario, avisando cuando se rompe una pieza. */
  readonly armor: ArmorSource = {
    armorPoints: () => this.g.inv.armorPoints(),
    armorToughness: () => this.g.inv.armorToughness(),
    wearArmor: (amount) => {
      const broken = this.g.inv.wearArmor(amount);
      if (broken > 0) {
        this.g.audio.playBreak('metal', [this.g.player.x, this.g.player.eyeY, this.g.player.z]);
        this.g.ui.toast('¡Se rompió la armadura!');
      }
      return broken;
    },
    protect: (damage, cause) => this.g.enchant.protect(damage, cause), // Fase 7 (encantamientos)
  };
  onPicked(s: ItemStack): void {
    if (!s || !isValidItem(s.id)) return;
    const rest = this.g.inv.add({
      id: s.id, count: Math.max(1, Math.min(64, s.count | 0)), dmg: s.dmg, ...(s.bag ? { bag: s.bag } : {}),
      ...(s.data ? { data: s.data } : {}), // Fase 6.5 (libros y estandartes)
    });
    if (rest) this.throwStack(rest, false);
    this.g.audio.playPickup();
  }

  /** Tira una pila al suelo hacia donde mira el jugador (Q o fuera de la ventana del inventario). */
  throwStack(s: ItemStack, strong: boolean): void {
    const p = this.g.player;
    const cp = Math.cos(p.pitch);
    const d = [-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp];
    const k = strong ? 4.5 : 3;
    const pos: [number, number, number] = [p.x + d[0] * 0.4, p.eyeY - 0.3, p.z + d[2] * 0.4];
    const v: [number, number, number] = [d[0] * k + p.vx * 0.5, d[1] * k + 1.8, d[2] * k + p.vz * 0.5];
    this.g.net?.send({ t: 'drop', items: [s], p: pos, v });
  }

  interact(dt: number, target: ClientEntity | null, dir: number[]): void {
    const input = this.g.input;
    const hit = this.g.hit;
    // --- Botón izquierdo: atacar o minar ---
    if (target) {
      this.mining = null;
      if (input.mousePressed[0]) this.attack(target);
    } else if (hit && input.mouseDown[0]) {
      if (this.g.creative) {
        if (input.mousePressed[0] || this.breakDelay <= 0) {
          this.breakBlock(hit);
          this.breakDelay = 0.25;
        }
      } else if (!(input.mousePressed[0] && endEggPunch(this.g, hit))) this.mineStep(dt, hit, input.mousePressed[0]); // Fase 8.6: el huevo salta
    } else {
      this.mining = null;
      if (input.mousePressed[0]) {
        this.g.swing(true);
        this.resetAttack();
      }
    }

    // --- Botón central: coger el bloque que se mira ---
    if (input.mousePressed[1] && hit) this.pickBlock(hit);

    // --- Botón derecho: usar, colocar, abrir ---
    const held = this.g.heldStack;
    const def = held ? ITEMS[held.id] : undefined;
    if (this.use) {
      const u = this.use;
      const stillHeld = (u.slot === OFFHAND || this.g.selected === u.slot) && this.g.inv.get(u.slot)?.id === u.item;
      if (!input.mouseDown[2] || !stillHeld) {
        if (u.kind === 'bow') this.releaseBow(dir);
        equipmentRelease(this.g, u, dir, stillHeld); // Fase 6.5 (equipo): lanzar el tridente
        this.use = null;
      } else {
        u.t += dt;
        equipmentHold(this.g, this, u); // Fase 6.5 (equipo): la ballesta se carga
        if (u.kind === 'eat') {
          u.soundT -= dt;
          if (u.soundT <= 0) {
            u.soundT = 0.22;
            // Fase 7 (pociones): las pociones y la leche se beben a tragos.
            if (ITEMS[u.item]?.drink) this.g.audio.playPotionSfx('drink', null);
            else this.g.audio.playEat();
          }
          if (u.t >= 1.6) this.finishEating();
        }
      }
      return;
    }
    const pressed = input.mousePressed[2];
    if (!pressed && !(input.mouseDown[2] && this.placeCooldown <= 0)) return;
    this.placeCooldown = 0.2;
    // Fase 6.5 (decoración): marcos, cuadros, macetas, campanas, huevos generadores y catalejo.
    if (decorUse(this.g, this, pressed, hit, target, held)) return;
    // Fase 6.5 (calderos): cubos y estandartes sobre un caldero.
    if (cauldronClick(this.g, pressed, hit, held)) return;
    // Fase 6.5 (remate): etiquetas y correas.
    if (leashUse(this.g, this, pressed, hit, target, held)) return;
    // Fase 6.5 (libros y estandartes): telar, atril y libros en la mano.
    if (this.g.books.use(pressed, hit, target, held)) return;
    // Fase 7 (encantamientos): mesa de encantamientos, yunque y afiladora.
    if (!target && this.g.enchant.use(pressed, hit)) return;
    // Fase 6.5 (equipo): mechero, ballesta, tridente, cuerno, cohetes, caña con zanahoria y armaduras de animales.
    if (equipmentUse(this.g, this, pressed, hit, target, held)) return;
    // Fase 6 (aldeanos): clic derecho sobre un aldeano abre el comercio.
    if (pressed && target && this.g.trading.canTrade(target)) {
      this.g.trading.open(target);
      return;
    }
    // Fase 6 (monturas): poner la silla o montarse.
    if (pressed && target && this.g.riding.onUse(target, held?.id ?? 0)) return;
    // Fase 7 (transporte): subirse, abrir el cofre o echar carbón; poner barcas y vagonetas.
    if (pressed && target && this.g.vehicles.onUse(target, held)) return;
    if (this.g.vehicles.place(this, pressed, target ? null : hit, held, dir)) return;
    // Criatura delante: dar de comer, esquilar u ordeñar (Fase 6: domesticar y sentar, también con la mano vacía).
    if (pressed && target && this.canInteract(target, held?.id ?? 0)) {
      this.interactEntity(target, held?.id ?? 0, undefined, target.type === MOB_ALLAY && held ? held : undefined); // Fase 7.5: al alay, la pila entera
      return;
    }
    // Fase 6 (fauna): cosechar un nido o colmena llenos con tijeras o un frasco.
    if (pressed && hit && held && useOnBeeHome(this.g, this, hit, held)) return;
    // Fase 6.5 (maderas): descortezar troncos con el hacha.
    if (pressed && hit && held && useAxeOnWood(this.g, this, hit, held)) return;
    // Fase 6.5 (cobre): encerar con panal o raspar con un hacha.
    if (pressed && hit && held && useOnCopper(this.g, this, hit, held)) return;
    // Fase 6.5 (materiales): caminos y suelos, tartas con vela, nieve polvo y huevos de rana.
    if (materialsUse(this.g, this, pressed, hit, held, dir)) return;
    // Fase 7 (redstone): palancas, botones, repetidores, comparadores, sensores, bloques musicales y polvo.
    if (redstoneUse(this.g, pressed, hit, held)) return;
    // Fase 8.5 (lo que da el Nether): el nexo de reaparición y la magnetita (la brújula magnetizada).
    if (netherGoodsUse(this.g, pressed, hit, held)) return;
    // Fase 8.6 (el End): el ojo de ender en un marco del portal del End.
    if (endFrameUse(this.g, pressed, hit, held)) return;
    // Abrir contenedores y la mesa de trabajo (agachado se coloca encima).
    if (pressed && hit && !this.g.player.sneaking) {
      // Fase 6.5 (colores): con la misma vela en la mano se añade otra en vez de encenderla o apagarla.
      if (isUsable(hit.id) && !(held && canAddCandle(held.id, hit.id))) {
        this.useBlock(hit);
        return;
      }
      if (isContainer(hit.id)) {
        this.pendingOpen = [hit.x, hit.y, hit.z];
        this.g.net?.send({ t: 'open', x: hit.x, y: hit.y, z: hit.z });
        this.g.swing(true);
        return;
      }
      if (hit.id === CRAFTING_TABLE || familyBase(hit.id) === STONECUTTER || hit.id === CARTOGRAPHY_TABLE) {
        this.g.openScreen(hit.id === CRAFTING_TABLE ? 'table' : hit.id === CARTOGRAPHY_TABLE ? 'cartography' : 'stonecutter', null); // Fase 7.6
        this.g.audio.playUi('open');
        return;
      }
      // Comida cruda sobre una fogata encendida: a asar.
      if (isCampfire(hit.id) && held && this.cookOnCampfire(hit, held.id)) return; // Fase 8.5: también la de almas
    }
    // Fase 6.5 (colecciones): tocadiscos, cabezas (colocar o ponérsela) y marco brillante.
    if (collectionUse(this.g, this, pressed, hit, held)) return;
    // Fase 7 (pociones): lanzar arrojadizas y persistentes y llenar frascos en el agua.
    if (potionUse(this.g, this, pressed, held, dir)) return;
    // Si la mano principal no hace nada con el clic derecho, lo usa la secundaria.
    if (!this.mainHandUses(held, hit)) {
      this.useOffhand(pressed, hit);
      return;
    }
    if (!held || !def) return;
    // Zanahorias y patatas se plantan en tierra de cultivo; si no, se comen.
    if (def.block !== undefined && hit && isCrop(def.block) && this.placeBlock(hit, def.block)) return;
    // Bayas luminosas bajo un techo: se plantan; si no, se comen.
    if (def.block === CAVE_VINES && hit && pressed && this.placeBlock(hit, CAVE_VINES)) return;
    // Fase 6.5 (océano y plantas): bayas dulces en la hierba: se plantan; si no, se comen.
    if (def.block === SWEET_BERRY_BUSH && hit && pressed && this.placeBlock(hit, SWEET_BERRY_BUSH)) return;
    if (held.id === SHEARS && hit?.id === PUMPKIN) {
      if (pressed) this.carve(hit);
      return;
    }
    if (def.tool?.kind === 'hoe') {
      if (pressed && hit) this.till(hit);
      return;
    }
    // Fase 8.6: lanzar el ojo de ender (hacia la fortaleza) o la perla de ender (con su segundo de espera).
    if (isEndThrowable(held.id)) {
      if (pressed) endThrow(this.g, held.id, dir);
      return;
    }
    if (held.id === EGG || held.id === SNOWBALL || held.id === EXPERIENCE_BOTTLE) { // Fase 7: botella con experiencia
      if (pressed) this.throwEgg(dir, held.id);
      return;
    }
    // Fase 6.5 (remate): usar un saco lo vacía delante del jugador.
    if (isBundle(held.id)) {
      if (pressed && held.bag?.length) {
        for (const s of bundleEmpty(held)) this.throwStack(s, false);
        this.g.inv.changed();
        this.g.audio.playPickup();
        this.g.swing(false);
      }
      return;
    }
    if (held.id === EMPTY_MAP) {
      if (pressed) this.fillMap();
      return;
    }
    if (def.tool?.kind === 'fishing_rod') {
      if (pressed) this.castRod(dir);
      return;
    }
    if (held.id === BONE_MEAL) {
      if (pressed && hit) this.boneMeal(hit);
      return;
    }
    if (def.food || def.drink) {
      if (pressed && itemCooldown(held.id) <= 0 && (def.drink || def.food?.always || this.g.survival.food < 20 || this.g.creative)) this.use = { kind: 'eat', t: 0, slot: this.g.selected, item: held.id, soundT: 0.3 }; // Fase 8.6: en espera, no
      return;
    }
    if (def.armor) {
      if (pressed) this.equipHeld();
      return;
    }
    if (def.tool?.kind === 'shield') {
      if (pressed) this.use = { kind: 'block', t: 0, slot: this.g.selected, item: held.id, soundT: 0 };
      return;
    }
    if (def.tool?.kind === 'bow') {
      if (pressed && (this.g.creative || hasArrows(this.g))) this.use = { kind: 'bow', t: 0, slot: this.g.selected, item: held.id, soundT: 0 };
      return;
    }
    if (held.id === BUCKET) {
      if (pressed) this.fillBucket(dir);
      return;
    }
    if (held.id === WATER_BUCKET || held.id === LAVA_BUCKET) {
      if (pressed && hit) this.emptyBucket(hit, held.id === WATER_BUCKET ? WATER : LAVA);
      return;
    }
    // Fase 6 (acuáticos): cubo con criatura: se vacía el agua y sale la criatura (el servidor la crea).
    if (mobInBucket(held.id)) {
      if (pressed && hit && this.pourFluid(hit, WATER, held.id) && !this.g.creative) this.g.inv.set(this.g.selected, { id: BUCKET, count: 1 });
      return;
    }
    // Agua y lava como bloque (inventario creativo): se ponen igual que con un cubo, sin gastarlo.
    if (def.block === WATER || def.block === LAVA) {
      if (pressed && hit) this.pourFluid(hit, def.block);
      return;
    }
    // El nenúfar se pone sobre el agua: el rayo se detiene en la primera fuente.
    if (held.id === LILY_PAD) {
      const p = this.g.player, world = this.g.world!;
      const wet = raycast(p.x, p.eyeY, p.z, dir[0], dir[1], dir[2], this.g.creative ? REACH_CREATIVE : REACH_SURVIVAL, (x, y, z) => world.getBlock(x, y, z), true);
      if (pressed && wet) this.placeBlock(wet, LILY_PAD);
      return;
    }
    if (def.block !== undefined && hit) this.placeBlock(hit, def.block);
  }

  /**
   * Clic central: pone en la mano el objeto del bloque que se mira. Si ya está en la barra, lo
   * selecciona; en creativo lo crea; en supervivencia lo trae de la mochila (a un hueco libre de la
   * barra o cambiándolo por el de la mano).
   */
  pickBlock(hit: RayHit): void {
    const item = itemForBlock(hit.id);
    if (!item) return;
    const inv = this.g.inv;
    const bar = inv.slots.slice(0, HOTBAR);
    const inBar = bar.findIndex((s) => s?.id === item);
    if (inBar >= 0) {
      this.g.selectSlot(inBar);
      return;
    }
    const empty = bar.findIndex((s) => !s);
    const target = inv.slots[this.g.selected] && empty >= 0 ? empty : this.g.selected;
    if (this.g.creative) inv.set(target, { id: item, count: maxStack(item) });
    else {
      const k = inv.slots.findIndex((s, i) => i >= HOTBAR && s?.id === item);
      if (k < 0) return;
      const tmp = inv.slots[target];
      inv.slots[target] = inv.slots[k];
      inv.slots[k] = tmp;
      inv.changed();
    }
    this.g.selectSlot(target);
    this.g.refreshHotbar(true);
  }

  /** ¿Tiene la mano principal algo que hacer con el clic derecho? */
  private mainHandUses(held: ItemStack | null, hit: RayHit | null): boolean {
    if (!held) return false;
    const def = ITEMS[held.id];
    if (!def) return false;
    if (def.block !== undefined || def.drink || def.armor) return true;
    if (isBundle(held.id)) return !!held.bag?.length; // Fase 6.5 (remate)
    if (def.food) return def.food.always || this.g.survival.food < 20 || this.g.creative;
    const kind = def.tool?.kind;
    if (kind === 'hoe' || kind === 'shield' || kind === 'bow' || kind === 'fishing_rod') return true;
    if (held.id === SHEARS) return hit?.id === PUMPKIN;
    return held.id === EGG || held.id === SNOWBALL || held.id === EMPTY_MAP || held.id === BONE_MEAL || held.id === BUCKET ||
      held.id === EXPERIENCE_BOTTLE || // Fase 7 (encantamientos)
      isEndThrowable(held.id); // Fase 8.6: el ojo y la perla de ender
  }

  /** Mano secundaria: cubrirse con el escudo, comer o colocar un bloque (antorchas…). */
  private useOffhand(pressed: boolean, hit: RayHit | null): void {
    const off = this.g.inv.offhand;
    const def = off ? ITEMS[off.id] : undefined;
    if (!off || !def) return;
    if (def.tool?.kind === 'shield') {
      if (pressed) this.use = { kind: 'block', t: 0, slot: OFFHAND, item: off.id, soundT: 0 };
    } else if (def.food || def.drink) {
      if (pressed && (def.drink || def.food?.always || this.g.survival.food < 20 || this.g.creative)) {
        this.use = { kind: 'eat', t: 0, slot: OFFHAND, item: off.id, soundT: 0.3 };
      }
    } else if (def.block !== undefined && def.block !== WATER && def.block !== LAVA && hit) {
      this.placeBlock(hit, def.block, OFFHAND);
    }
  }

  /** ¿Cubierto con el escudo? (como en Minecraft, tarda un cuarto de segundo en subir). */
  get blocking(): boolean {
    return this.use?.kind === 'block' && this.use.t >= 0.25;
  }

  /**
   * Golpe recibido con el escudo levantado: si viene de frente (el empuje apunta hacia atrás), el
   * escudo se lo come entero y se desgasta. Devuelve true si lo bloqueó.
   */
  blockHit(amount: number, k: [number, number, number]): boolean {
    if (!this.blocking) return false;
    const p = this.g.player;
    const kl = Math.hypot(k[0], k[2]);
    if (kl < 1e-3) return false;
    // El atacante está en sentido contrario al empuje; se bloquea lo que llega por delante.
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    if (fx * (-k[0] / kl) + fz * (-k[2] / kl) <= 0) return false;
    this.g.audio.playBlockHit('wood', [p.x, p.eyeY, p.z]);
    p.impulse(k[0] * 0.3, 0, k[2] * 0.3);
    // Desgaste de Minecraft: golpes de 3 o más gastan 1 + daño (en la mano que lo lleve).
    if (amount >= 3) this.wearSlot(this.use!.slot, 1 + Math.floor(amount));
    return true;
  }

  /** Clic derecho con una pieza de armadura: se la pone (intercambia con la puesta; en creativo no se gasta). */
  equipHeld(): void {
    const held = this.g.heldStack;
    const def = held ? ITEMS[held.id]?.armor : undefined;
    if (!held || !def) return;
    if (this.g.enchant.bound(def.slot)) return; // Fase 7 (encantamientos): Maldición de ligamiento
    if (this.g.creative) this.g.inv.equip(held);
    else this.g.inv.equipFromSlot(this.g.selected, true);
    const p = this.g.player;
    this.g.audio.playPlace(def.material === 'leather' || def.material === 'elytra' ? 'wool' : 'metal', [p.x, p.eyeY, p.z]);
    this.g.swing(true);
  }

  /** Clic derecho en puertas, trampillas y portillos (se abren al momento) o en una cama. */
  useBlock(hit: RayHit): void {
    const world = this.g.world!;
    const yaw = this.g.player.yaw;
    const level = composterLevel(hit.id);
    if (level >= 0) {
      this.compost(hit, level);
      return;
    }
    if (isSign(hit.id)) {
      this.g.openSignEditor(hit.x, hit.y, hit.z);
      return;
    }
    if (isCake(hit.id)) {
      // Una porción: 2 de hambre y 0,4 de saturación (sólo con hambre, salvo en creativo).
      if (!this.g.creative && this.g.survival.food >= 20) return;
      this.g.survival.eat(2, 0.4);
      this.g.audio.playEat();
    }
    if (!isBed(hit.id)) {
      const edits = toggleEdits((x, y, z) => world.getBlock(x, y, z), hit.x, hit.y, hit.z, yaw);
      if (edits) for (const [x, y, z, id] of edits) world.setBlock(x, y, z, id);
      this.g.audio.playPlace(BLOCKS[hit.id].sound, [hit.x + 0.5, hit.y + 0.5, hit.z + 0.5]);
    }
    this.g.net?.send({ t: 'use', x: hit.x, y: hit.y, z: hit.z, yaw });
    this.g.swing(true);
  }

  mineStep(dt: number, hit: RayHit, pressed: boolean): void {
    const m = this.mining;
    if (!m || m.x !== hit.x || m.y !== hit.y || m.z !== hit.z || m.id !== hit.id) {
      if (this.breakDelay > 0 && !pressed) return;
      this.mining = { x: hit.x, y: hit.y, z: hit.z, id: hit.id, progress: 0, hitT: 0 };
    }
    const cur = this.mining!;
    const p = this.g.player;
    const mb = this.g.enchant.miningBonus(); // Fase 7 (encantamientos): Eficiencia y Afinidad acuática
    const t = breakTime(hit.id, this.g.heldId, p.eyeInWater && !mb.aqua, p.onGround || p.inWater, mb.efficiency, this.g.statusEffects.miningSpeed); // Fase 7 (efectos)
    if (this.g.swingT < 0) this.g.swingT = 0;
    if (t === Infinity) return;
    if (t === 0) {
      if (pressed || this.breakDelay <= 0) {
        this.breakBlock(hit);
        this.breakDelay = 0.25;
      }
      this.mining = null;
      return;
    }
    cur.progress += dt / t;
    cur.hitT -= dt;
    if (cur.hitT <= 0) {
      cur.hitT = 0.25;
      this.g.audio.playBlockHit(BLOCKS[hit.id].sound, [hit.x + 0.5, hit.y + 0.5, hit.z + 0.5]);
    }
    if (cur.progress >= 1) {
      this.breakBlock(hit);
      this.mining = null;
      this.breakDelay = 0.3;
    }
  }

  breakBlock(hit: RayHit): void {
    const world = this.g.world!;
    const { x, y, z, id } = hit;
    this.g.swing(false);
    if (id === BEDROCK || BLOCK_HARDNESS[id] < 0) return;
    // Fase 6.5: una planta anegada deja el agua; fase 7: el hielo roto en supervivencia, también.
    const silk = levelIn(this.g.enchant.held(), SILK_TOUCH) > 0;
    world.setBlock(x, y, z, emptyAfterPlayerBreak(id, world.getBlock(x, y - 1, z), !this.g.creative, silk));
    // La otra mitad de una puerta o de una cama cae con ella (el servidor lo confirma).
    const pp = partnerOf(x, y, z, id);
    if (pp && familyBase(world.getBlock(pp[0], pp[1], pp[2])) === familyBase(id)) world.setBlock(pp[0], pp[1], pp[2], AIR);
    this.g.net?.sendSet(x, y, z, AIR, this.g.heldId, this.g.enchant.held()); // Fase 7: Toque de seda y Fortuna
    this.g.audio.playBreak(BLOCKS[id].sound, [x + 0.5, y + 0.5, z + 0.5]);
    this.g.renderer.entities.spawnBreak(x, y, z, id, world.getLight(x, y + 1, z));
    if (!this.g.creative) {
      this.g.survival.addExhaustion(0.005);
      const tool = ITEMS[this.g.heldId]?.tool;
      if (tool && !WEARLESS.has(tool.kind) && BLOCK_HARDNESS[id] > 0) this.wearHeld(tool.kind === 'sword' ? 2 : 1);
    }
  }

  wearHeld(amount: number): void {
    this.wearSlot(this.g.selected, amount);
  }

  /** Desgasta lo que hay en una ranura (o en la mano secundaria). */
  wearSlot(slot: number, amount: number): void {
    if (this.g.creative) return;
    if (this.g.inv.wear(slot, amount)) {
      this.g.audio.playBreak('stone', [this.g.player.x, this.g.player.eyeY, this.g.player.z]);
      this.g.ui.toast('¡Se rompió la herramienta!');
    }
  }

  /** Carga del ataque (0..1) según el ritmo del arma en la mano. */
  attackCharge(): number {
    // Fase 7 (efectos): Prisa y Fatiga minera cambian el ritmo de la barra.
    return Math.min(1, (performance.now() - this.lastSwing) / 1000 / attackCooldown(this.g.heldId) * this.g.statusEffects.attackSpeed);
  }

  /** Golpear o dar un manotazo al aire vacía la barra de ataque. */
  resetAttack(): void {
    this.lastSwing = performance.now();
  }

  attack(e: ClientEntity): void {
    const p = this.g.player;
    // Crítico: cayendo y con la barra casi llena (el servidor lo vuelve a comprobar).
    const charged = this.attackCharge() > 0.9;
    const crit = !p.onGround && p.vy < -1 && !p.inWater && !p.flying && charged && !this.g.statusEffects.blind; // Fase 7: ciego, sin críticos
    // Golpe corriendo con la barra llena (el de empuje de Java): empuja más y corta la carrera.
    const sprintHit = charged && p.sprinting;
    // Fase 7 (encantamientos): la espada barre con el golpe cargado, en el suelo, sin correr ni crítico, y sin ir
    // más deprisa que andando (Player.isSweepAttack: velocidad horizontal < 2,5 × la de andar por tick).
    const slow = Math.hypot(p.vx, p.vz) < 5;
    const sw = charged && !crit && !sprintHit && p.onGround && slow && ITEMS[this.g.heldId]?.tool?.kind === 'sword' ? 1 : 0;
    this.resetAttack();
    const b = this.g.statusEffects.melee;
    const k = this.g.statusEffects.attackSpeed; // Fase 7 (efectos): ritmo de ataque
    this.g.net?.send({
      t: 'attack', e: e.id, item: this.g.heldId, crit, ...(b ? { b } : {}), ...this.g.enchant.heldField(), ...(sw ? { sw } : {}), ...(k !== 1 ? { k } : {}),
      ...(sprintHit ? { sp: 1 as const } : {}),
    });
    // Player.causeExtraKnockback: tras un golpe con empuje extra (corriendo o con Empuje), frena y deja de correr.
    if (sprintHit || this.g.enchant.held().some(([id]) => id === KNOCKBACK)) {
      if (sprintHit) this.g.audio.playKnockbackHit([e.x, e.y + 1, e.z]);
      p.vx *= 0.6;
      p.vz *= 0.6;
      p.sprinting = false;
    }
    this.g.swing(false);
    this.g.net?.send({ t: 'swing' });
    if (crit) this.g.renderer.entities.spawnCrit(e.x, e.y + 1, e.z, 10);
    if (this.g.enchant.magicHit()) this.g.renderer.entities.pfx.magic(e.x, e.y + 1, e.z, 8, 0.3); // Fase 7
    if (!this.g.creative) {
      this.g.survival.addExhaustion(0.1);
      const tool = ITEMS[this.g.heldId]?.tool;
      if (tool && !WEARLESS.has(tool.kind) && !isVehicleType(e.type)) this.wearHeld(tool.kind === 'sword' ? 1 : 2); // Fase 7: las barcas no gastan
    }
  }

  finishEating(): void {
    const u = this.use!;
    const def = ITEMS[u.item];
    const food = def?.food;
    this.use = null;
    if (drinkPotion(this.g, this, u.slot, u.item)) return; // Fase 7 (pociones)
    if (def?.drink) {
      // Cubo de leche: quita todos los efectos y queda el cubo vacío.
      this.g.statusEffects.clear(this.g.survival);
      this.g.audio.playBurp();
      if (!this.g.creative) this.g.inv.set(u.slot, { id: BUCKET, count: 1 });
      return;
    }
    if (!food) return;
    this.g.survival.eat(food.hunger, food.saturation);
    // Efectos de la comida (carne podrida, pollo crudo, ojo de araña, manzana dorada).
    for (const [id, secs, amp, chance] of food.effects ?? []) {
      if (Math.random() < chance) this.g.statusEffects.add(id, secs, amp, this.g.survival);
    }
    this.g.audio.playBurp();
    const eatenDmg = this.g.inv.get(u.slot)?.dmg ?? 0; // Fase 6.5 (decoración): flor del estofado sospechoso
    if (!this.g.creative) this.g.inv.consume(u.slot, 1);
    faunaAfterEat(this.g, this, u.item, u.slot); // Fase 6 (fauna): miel
    decorAfterEat(this.g, this, u.item, u.slot, eatenDmg); // Fase 6.5 (decoración): cuenco y estofado sospechoso
    afterDrinkOminous(this.g, u.item); // Fase 6 (asaltos): Mal presagio
    endAfterEat(this.g, u.item); // Fase 8.6: la fruta de coro teletransporta
  }

  releaseBow(dir: number[]): void {
    const u = this.use;
    this.use = null;
    if (!u || u.kind !== 'bow') return;
    // Potencia como en Minecraft: f = (t² + 2t) / 3 con t en segundos (máx. 1).
    const t = Math.min(1, u.t);
    const f = Math.min(1, (t * t + 2 * t) / 3);
    if (f < 0.1) return;
    // Fase 7: la primera flecha que haya (normal o con efecto; con Infinidad las normales no se gastan) y
    // Poder, Retroceso, Fuego e Infinidad del arco.
    const en = this.g.enchant.heldField();
    const ap = takeArrow(this.g, enchLevel(this.g.heldStack, INFINITY) > 0);
    if (ap === null) return;
    this.wearHeld(1);
    const p = this.g.player;
    this.g.net?.send({ t: 'shoot', p: [p.x + dir[0] * 0.3, p.eyeY - 0.1, p.z + dir[2] * 0.3], d: [dir[0], dir[1], dir[2]], f, ...en, ...(ap !== -1 ? { ap } : {}) }); // Fase 8.3: −2 la espectral
    this.g.swing(false);
  }

  fillBucket(dir: number[]): void {
    const world = this.g.world!;
    const p = this.g.player;
    const hit = raycast(p.x, p.eyeY, p.z, dir[0], dir[1], dir[2], this.g.creative ? REACH_CREATIVE : REACH_SURVIVAL, (x, y, z) => world.getBlock(x, y, z), true);
    if (!hit || !BLOCK_FLUID[hit.id] || BLOCK_FLUID_LEVEL[hit.id] !== 0 || isWaterlogged(hit.id)) return;
    const filled = BLOCK_FLUID[hit.id] === 1 ? WATER_BUCKET : LAVA_BUCKET;
    world.setBlock(hit.x, hit.y, hit.z, AIR);
    this.g.net?.sendSet(hit.x, hit.y, hit.z, AIR, BUCKET);
    this.g.audio.playSplash([hit.x + 0.5, hit.y + 0.5, hit.z + 0.5], 0.5);
    this.g.swing(false);
    if (this.g.creative) return;
    const s = this.g.heldStack!;
    if (s.count <= 1) this.g.inv.set(this.g.selected, { id: filled, count: 1 });
    else {
      this.g.inv.consume(this.g.selected, 1);
      const rest = this.g.inv.add({ id: filled, count: 1 });
      if (rest) this.throwStack(rest, true);
    }
  }

  /** Pone una fuente de agua o lava en la celda que toca (cubo o bloque de fluido). */
  private pourFluid(hit: RayHit, fluid: number, tool = 0): boolean {
    const world = this.g.world!;
    // Fase 8: en el Nether el agua se evapora (el cubo se vacía igual; el servidor hace el siseo y el humo).
    if (fluid === WATER && dimensionDef(world.dim).evaporatesWater) {
      const x = hit.x + hit.nx, y = hit.y + hit.ny, z = hit.z + hit.nz;
      this.g.net?.sendSet(x, y, z, WATER, tool);
      this.g.swing(false);
      return true;
    }
    // Sobre un bloque que se puede anegar (conducto, corales, pepinos de mar), el agua entra en su celda.
    const wet = fluid === WATER ? withWater(hit.id, true) : 0;
    if (wet) {
      world.setBlock(hit.x, hit.y, hit.z, wet);
      this.g.net?.sendSet(hit.x, hit.y, hit.z, WATER, tool);
      this.g.audio.playSplash([hit.x + 0.5, hit.y + 0.5, hit.z + 0.5], 0.4);
      this.g.swing(false);
      return true;
    }
    let x = hit.x + hit.nx, y = hit.y + hit.ny, z = hit.z + hit.nz;
    if (BLOCK_REPLACEABLE[hit.id] && !BLOCK_FLUID[hit.id]) [x, y, z] = [hit.x, hit.y, hit.z];
    const cur = world.getBlock(x, y, z);
    if (cur < 0 || !BLOCK_REPLACEABLE[cur]) return false;
    world.setBlock(x, y, z, fluid);
    this.g.net?.sendSet(x, y, z, fluid, tool);
    this.g.audio.playSplash([x + 0.5, y + 0.5, z + 0.5], 0.4);
    this.g.swing(false);
    return true;
  }

  emptyBucket(hit: RayHit, fluid: number): void {
    if (!this.pourFluid(hit, fluid)) return;
    if (!this.g.creative) this.g.inv.set(this.g.selected, { id: BUCKET, count: 1 });
  }

  /** ¿Chocaría el bloque `id` en (x, y, z) con el jugador, otros jugadores o criaturas? */
  blockedByBodies(x: number, y: number, z: number, id: number): boolean {
    const world = this.g.world!;
    const boxes = BLOCK_COLLIDE[id] === 1 ? [0, 0, 0, 1, 1, 1] : blockCollisionBoxes(id, x, y, z, world, []);
    const hits = (cx: number, cy: number, cz: number, hw: number, h: number) => {
      for (let i = 0; i + 5 < boxes.length; i += 6) {
        if (cx + hw > x + boxes[i] && cx - hw < x + boxes[i + 3] && cy + h > y + boxes[i + 1] && cy < y + boxes[i + 4] &&
          cz + hw > z + boxes[i + 2] && cz - hw < z + boxes[i + 5]) return true;
      }
      return false;
    };
    const p = this.g.player;
    if (hits(p.x, p.y, p.z, 0.3, 1.8)) return true;
    for (const rp of this.g.remote.values()) if (hits(rp.view.x, rp.view.y, rp.view.z, 0.3, 1.8)) return true;
    for (const e of this.g.ents.list.values()) {
      const def = MOBS[e.type];
      if (def && e.deathT < 0 && hits(e.x, e.y, e.z, def.width / 2, def.height)) return true;
    }
    return false;
  }

  placeBlock(hit: RayHit, base: number, slot = this.g.selected): boolean {
    const world = this.g.world!;
    const get = (x: number, y: number, z: number) => world.getBlock(x, y, z);
    const edits = planPlacement(get, hit, base, this.g.player.yaw, this.g.player.pitch); // Fase 7 (mecanismos): pitch
    if (!edits) return false;
    for (const [x, y, z, id] of edits) {
      if (BLOCK_COLLIDE[id] && this.blockedByBodies(x, y, z, id)) return false;
      // Plantas, antorchas de pie, cactus y caña necesitan apoyo.
      const r = BLOCK_RENDER[id];
      if ((r === R_CROSS || (r === R_TORCH && BLOCK_WALL[id] < 0) || id === CACTUS || id === SUGAR_CANE) && !BLOCK_NEEDS_SUPPORT[id]) {
        const under = world.getBlock(x, y - 1, z);
        if (SAPLINGS.has(id)) {
          if (!SOIL.has(under)) return false;
        } else if (id === CACTUS) {
          if (under !== CACTUS && under !== SAND && under !== RED_SAND) return false;
        } else {
          const okSame = id === SUGAR_CANE && under === id;
          if (!okSame && (under <= 0 || !BLOCK_SOLID[under] || BLOCK_RENDER[under] === R_CROSS)) return false;
        }
      }
    }
    for (const [x, y, z, id] of edits) world.setBlock(x, y, z, id);
    this.g.net?.send({
      t: 'place', x: hit.x, y: hit.y, z: hit.z, n: [hit.nx, hit.ny, hit.nz], p: [hit.px, hit.py, hit.pz], item: base,
      yaw: this.g.player.yaw, pi: Math.round(this.g.player.pitch * 1000) / 1000, // Fase 7 (mecanismos)
      ...this.g.books.placeExtras(this.g.inv.get(slot), edits), // Fase 6.5 (libros y estandartes): capas del estandarte
      ...(isShulkerBox(base) && this.g.inv.get(slot)?.bag ? { bx: stackToWire(this.g.inv.get(slot))! } : {}), // Fase 8.6: lo que lleva la caja
    });
    this.g.swing(false);
    const [x, y, z, id] = edits[0];
    this.g.audio.playPlace(BLOCKS[id].sound, [x + 0.5, y + 0.5, z + 0.5]);
    if (!this.g.creative) this.g.inv.consume(slot, 1);
    // Cartel recién puesto: a escribir.
    if (isSign(id)) this.g.openSignEditor(x, y, z);
    return true;
  }

  /**
   * Compostador: echar el objeto de la mano (se gasta aunque no suba de nivel; el servidor decide si
   * sube) o, si está listo, sacar el polvo de hueso.
   */
  compost(hit: RayHit, level: number): void {
    const item = this.g.heldId;
    if (level === COMPOSTER_READY) this.g.world!.setBlock(hit.x, hit.y, hit.z, COMPOSTER);
    else if (canCompost(level, item)) {
      if (!this.g.creative) this.g.inv.consume(this.g.selected, 1);
    } else return;
    this.g.net?.send({ t: 'use', x: hit.x, y: hit.y, z: hit.z, yaw: this.g.player.yaw, item });
    this.g.swing(true);
  }

  /** Poner comida cruda a asar en una fogata (caben cuatro: se cuentan las que ya se ven encima). */
  cookOnCampfire(hit: RayHit, item: number): boolean {
    if (!stateProps(hit.id)?.lit || !variantSmelts(1, item)) return false;
    let n = 0;
    for (const e of this.g.ents.list.values()) {
      if (e.type === ENT_DISPLAY && !e.gone && Math.floor(e.x) === hit.x && Math.floor(e.y) === hit.y && Math.floor(e.z) === hit.z) n++;
    }
    if (n >= 4) return false;
    this.g.net?.send({ t: 'use', x: hit.x, y: hit.y, z: hit.z, yaw: this.g.player.yaw, item });
    if (!this.g.creative) this.g.inv.consume(this.g.selected, 1);
    this.g.swing(true);
    return true;
  }

  /** Tijeras sobre una calabaza: se talla la cara que mira al jugador (las semillas las suelta el servidor). */
  carve(hit: RayHit): void {
    this.g.world!.setBlock(hit.x, hit.y, hit.z, orientedFor(CARVED_PUMPKIN, this.g.player.yaw));
    this.g.net?.send({ t: 'use', x: hit.x, y: hit.y, z: hit.z, yaw: this.g.player.yaw, item: SHEARS });
    this.g.swing(false);
    this.wearHeld(1);
  }

  /** Lanzar un huevo hacia donde se mira (1 de cada 8 da un pollito). */
  /** Mapa vacío: se convierte en el mapa de la zona en la que está el jugador. */
  fillMap(): void {
    const p = this.g.player;
    const map: ItemStack = { id: FILLED_MAP, count: 1, dmg: mapKeyAt(p.x, p.z) };
    if (!this.g.creative) this.g.inv.consume(this.g.selected, 1);
    if (!this.g.inv.get(this.g.selected)) this.g.inv.set(this.g.selected, map);
    else {
      const rest = this.g.inv.add(map);
      if (rest) this.throwStack(rest, false);
    }
    this.g.audio.playUi('open');
    this.g.swing(false);
  }

  throwEgg(dir: number[], item = EGG): void {
    const p = this.g.player;
    this.g.net?.send({ t: 'throw', p: [p.x + dir[0] * 0.3, p.eyeY - 0.1, p.z + dir[2] * 0.3], d: [dir[0], dir[1], dir[2]], item });
    if (!this.g.creative) this.g.inv.consume(this.g.selected, 1);
    this.g.swing(false);
  }

  /** Caña de pescar: lanza el flotador o lo recoge (el servidor responde con 'rod' y el desgaste). */
  castRod(dir: number[]): void {
    const p = this.g.player;
    this.g.net?.send({ t: 'fish', p: [p.x + dir[0] * 0.3, p.eyeY - 0.1, p.z + dir[2] * 0.3], d: [dir[0], dir[1], dir[2]], ...this.g.enchant.heldField() }); // Fase 7: Suerte marina y Atracción
    this.g.swing(false);
  }

  /** Azada: hierba o tierra con aire encima → tierra de cultivo. */
  till(hit: RayHit): void {
    const world = this.g.world!;
    if (hit.ny < 0 || (hit.id !== GRASS && hit.id !== DIRT) || world.getBlock(hit.x, hit.y + 1, hit.z) !== AIR) return;
    world.setBlock(hit.x, hit.y, hit.z, FARMLAND);
    this.g.net?.send({ t: 'use', x: hit.x, y: hit.y, z: hit.z, yaw: this.g.player.yaw, item: this.g.heldId });
    this.g.audio.playPlace('gravel', [hit.x + 0.5, hit.y + 1, hit.z + 0.5]);
    this.g.swing(false);
    this.wearHeld(1);
  }

  /** Polvo de hueso sobre un cultivo, un brote o la hierba (el servidor decide el resultado). */
  boneMeal(hit: RayHit): void {
    const world = this.g.world!;
    if (!canFertilize((x, y, z) => world.getBlock(x, y, z), hit.x, hit.y, hit.z, SAPLINGS, GRASS)) return;
    this.g.net?.send({ t: 'use', x: hit.x, y: hit.y, z: hit.z, yaw: this.g.player.yaw, item: BONE_MEAL });
    this.g.swing(false);
    if (!this.g.creative) this.g.inv.consume(this.g.selected, 1);
  }

  /** ¿Sirve el objeto con esta criatura? (comida para criar, tijeras con ovejas, cubo con vacas). */
  canInteract(e: ClientEntity, item: number): boolean {
    const def = MOBS[e.type];
    if (!def || def.hostile || e.deathT >= 0) return false;
    const baby = (e.flags & EF_BABY) !== 0;
    const allay = allayCanInteract(e, item); // Fase 7.5 (mansión)
    if (allay !== undefined) return allay;
    if (companionUse(e.type, e.flags, item)) return true; // Fase 6 (gólems/domesticar)
    const fauna = faunaCanInteract(e, item); // Fase 6 (fauna): cepillo
    if (fauna !== undefined) return fauna;
    const critter = critterCanInteract(e, item); // Fase 7.5 (fauna): champiñaca
    if (critter !== undefined) return critter;
    if (BREED_FOOD[def.key]?.includes(item)) return true;
    if (item === SHEARS) return e.type === MOB_SHEEP && !baby && !(e.flags & EF_SHEARED);
    if (item === BUCKET) return e.type === MOB_COW && !baby;
    if (item === WATER_BUCKET) return MOB_BUCKETS[e.type] !== undefined; // Fase 6 (acuáticos)
    if (e.type === MOB_DOLPHIN && (item === COD || item === SALMON)) return true; // Fase 7.5 (océano): lleva a los tesoros
    return false;
  }

  /** `name`: el nombre de la etiqueta (Fase 6.5). `st`: la pila entera (Fase 7.5: lo que se le da al alay). */
  interactEntity(e: ClientEntity, item: number, name?: string, st?: ItemStack): void {
    const q = ++this.interactQ;
    this.pendingInteract.set(q, { slot: this.g.selected, item });
    if (this.pendingInteract.size > 32) this.pendingInteract.delete(this.pendingInteract.keys().next().value!);
    this.g.net?.send({ t: 'interact', e: e.id, item, q, ...(name ? { n: name } : {}), ...(st ? { st } : {}) });
    this.g.swing(true);
  }

  /** Respuesta del servidor: gastar comida, desgastar las tijeras o cambiar el cubo por leche. */
  onInteractResult(msg: Extract<ServerMsg, { t: 'ires' }>): void {
    const p = this.pendingInteract.get(msg.q);
    this.pendingInteract.delete(msg.q);
    if (!p || !msg.ok) return;
    let slot = p.slot;
    // (Con la mano vacía no hay nada que buscar: lo que se recibe va a su ranura o a la primera libre.)
    if (p.item && this.g.inv.slots[slot]?.id !== p.item) slot = this.g.inv.slots.findIndex((st) => st?.id === p.item);
    if (slot < 0) return;
    if (msg.take && !this.g.creative) this.g.inv.consume(slot, msg.take);
    if (msg.wear && !this.g.creative && this.g.inv.wear(slot, msg.wear)) this.g.ui.toast('¡Se rompió la herramienta!');
    if (msg.give && isValidItem(msg.give.id)) {
      const give = { id: msg.give.id, count: Math.max(1, msg.give.count | 0), ...(msg.give.dmg ? { dmg: msg.give.dmg } : {}), ...(msg.give.data ? { data: msg.give.data } : {}) }; // Fase 6.5: con su desgaste y sus datos
      if (!this.g.inv.slots[slot]) this.g.inv.set(slot, give);
      else {
        const rest = this.g.inv.add(give);
        if (rest) this.throwStack(rest, false);
      }
    }
    this.g.inv.changed();
  }

  /** Q: tirar el objeto de la mano (con Ctrl, la pila entera). */
  dropHeld(all: boolean): void {
    const s = this.g.heldStack;
    if (!s || this.g.survival.dead) return;
    const n = all ? s.count : 1;
    this.throwStack({ ...s, count: n }, true);
    this.g.inv.consume(this.g.selected, n);
    this.g.swing(false);
  }

  /** Pide recoger los objetos que el jugador toca. */
  autoPickup(now: number): void {
    if (this.g.survival.dead || !this.g.net) return;
    const p = this.g.player;
    for (const e of this.g.ents.list.values()) {
      // Fase 6.5 (equipo): también los tridentes clavados.
      if ((e.type !== ENT_ITEM && e.type !== ENT_ARROW && e.type !== ENT_TRIDENT) || !(e.flags & EF_PICKABLE) || e.gone) continue;
      if (Math.abs(e.x - p.x) > 1.3 || Math.abs(e.z - p.z) > 1.3 || e.y < p.y - 0.8 || e.y > p.y + 2.3) continue;
      const id = e.type === ENT_ARROW ? (e.potion === SPECTRAL_ARROW_TYPE ? SPECTRAL_ARROW : (e.potion ?? -1) >= 0 ? TIPPED_ARROW : ARROW) : e.type === ENT_TRIDENT ? TRIDENT : e.item; // Fase 7: flechas con efecto; 8.3: espectral
      if (this.g.inv.room({ id, count: 1 }) <= 0) continue;
      const last = this.pickupAsk.get(e.id) ?? 0;
      if (now - last < 0.5) continue;
      this.pickupAsk.set(e.id, now);
      this.g.net.send({ t: 'pickup', e: e.id });
    }
    if (this.pickupAsk.size > 256) {
      for (const [id, t] of this.pickupAsk) if (now - t > 5) this.pickupAsk.delete(id);
    }
  }

  /** Mirar a un enderman lo enfada (el servidor decide). */
  checkEndermanLook(ex: number, ey: number, ez: number, dir: number[]): void {
    let any = false;
    for (const e of this.g.ents.list.values()) if (e.type === MOB_ENDERMAN) any = true;
    if (!any) return;
    const world = this.g.world!;
    const hit = this.g.ents.raycast(ex, ey, ez, dir[0], dir[1], dir[2], 64);
    if (!hit || hit.e.type !== MOB_ENDERMAN) return;
    const block = raycast(ex, ey, ez, dir[0], dir[1], dir[2], hit.dist, (x, y, z) => world.getBlock(x, y, z));
    if (block) return;
    this.g.net?.send({ t: 'look', e: hit.e.id });
  }
}
