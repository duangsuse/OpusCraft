// World simulation extras: block entities, random ticks, precipitation, lightning, sapling growth, commands.
import { BLOCKS, ID, TYPE_MASK, META_SHIFT, mk, T_OPAQUE, T_SOLID, T_FLUID, WOODS } from '../world/blocks.js';
import { MIN_Y } from '../world/constants.js';
import { Inventory } from './inventory.js';
import { ITEMS, IID, fuelTime } from './items.js';
import { SMELTING } from './recipes.js';
import { WEATHER_TYPES } from './environment.js';

export const GameplayMixin = {
  // ---- block entities ----
  blockEntity(x, y, z, create = true) {
    const k = x + ',' + y + ',' + z;
    const w = this.world;
    let be = w.blockEntities.get(k);
    if (be && !(be.inv instanceof Inventory)) {
      const inv = new Inventory(be.type === 'furnace' ? 3 : 27);
      inv.load(be.inv);
      be.inv = inv;
    }
    if (!be && create) {
      const t = w.getBlock(x, y, z) & TYPE_MASK;
      if (t === ID.chest) be = { type: 'chest', inv: new Inventory(27) };
      else if (t === ID.furnace || t === ID.lit_furnace) be = { type: 'furnace', inv: new Inventory(3), burn: 0, burnMax: 0, cook: 0 };
      if (be) w.blockEntities.set(k, be);
    }
    if (be) { be.x = x; be.y = y; be.z = z; if (be.inv && !be._l) { be._l = true; be.inv.listeners.push(() => { const c = w.getChunk(x >> 4, z >> 4); if (c) c.modified = true; }); } }
    return be;
  },

  tickBlockEntities() {
    for (const [k, be] of this.world.blockEntities) {
      if (be.type !== 'furnace') continue;
      if (!(be.inv instanceof Inventory)) { const [x, y, z] = k.split(',').map(Number); this.blockEntity(x, y, z); }
      this.tickFurnace(be);
    }
  },
  tickFurnace(be) {
    const inv = be.inv;
    const input = inv.slots[0], fuel = inv.slots[1], out = inv.slots[2];
    const wasLit = be.burn > 0;
    if (be.burn > 0) be.burn--;
    const recipe = input ? SMELTING.get(input.id) : null;
    const canSmelt = recipe && (!out || (out.id === recipe.out && out.count < 64));
    if (be.burn === 0 && canSmelt && fuel) {
      const ft = fuelTime(fuel.id);
      if (ft > 0) {
        be.burn = be.burnMax = ft;
        if (ITEMS[fuel.id].name === 'lava_bucket') inv.slots[1] = { id: IID.bucket, count: 1 };
        else { fuel.count--; if (fuel.count <= 0) inv.slots[1] = null; }
        inv.changed();
      }
    }
    if (be.burn > 0 && canSmelt) {
      be.cook++;
      if (be.cook >= 200) {
        be.cook = 0;
        input.count--; if (input.count <= 0) inv.slots[0] = null;
        if (out) out.count++; else inv.slots[2] = { id: recipe.out, count: 1 };
        inv.changed();
      }
    } else if (be.cook > 0) be.cook = Math.max(0, be.cook - 2);
    const lit = be.burn > 0;
    if (lit !== wasLit) {
      const v = this.world.getBlock(be.x, be.y, be.z);
      const m = v >>> META_SHIFT;
      this.world.setBlock(be.x, be.y, be.z, mk(lit ? ID.lit_furnace : ID.furnace, m), 2);
    }
    if (lit && Math.random() < 0.1) {
      const f = (this.world.getBlock(be.x, be.y, be.z) >>> META_SHIFT) & 3;
      const d = [[0, -0.52], [0, 0.52], [-0.52, 0], [0.52, 0]][f];
      this.particles?.spawn('smoke', be.x + 0.5 + d[0], be.y + 0.2 + Math.random() * 0.4, be.z + 0.5 + d[1]);
      this.particles?.spawn('flame', be.x + 0.5 + d[0], be.y + 0.2 + Math.random() * 0.4, be.z + 0.5 + d[1]);
    }
  },

  // ---- random ticks (randomTickSpeed = 3) ----
  randomTicks() {
    const w = this.world, p = this.player;
    const pcx = Math.floor(p.pos[0]) >> 4, pcz = Math.floor(p.pos[2]) >> 4;
    const R = Math.min(8, this.settings.renderDistance);
    const rain = this.weather.rainLevel > 0.2;
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const c = w.getChunk(pcx + dx, pcz + dz);
      if (!c || c.state !== 2 || !c.mesh) continue;
      let maxYi = 0; for (let i = 0; i < 256; i += 17) if (c.heightmap[i] > maxYi) maxYi = c.heightmap[i];
      const secs = Math.min(24, (maxYi >> 4) + 2);
      for (let s = 0; s < secs; s++) for (let n = 0; n < 3; n++) {
        const r = Math.random() * 4096 | 0;
        const lx = r & 15, lz = (r >> 4) & 15, ly = (r >> 8) & 15;
        const yi = s * 16 + ly;
        const v = c.blocks[(yi * 16 + lz) * 16 + lx];
        if (!v) continue;
        this.randomTickBlock(c.cx * 16 + lx, yi + MIN_Y, c.cz * 16 + lz, v);
      }
      // precipitation tick (snow layers & ice in cold biomes)
      if (rain && Math.random() < 1 / 16) {
        const x = c.cx * 16 + (Math.random() * 16 | 0), z = c.cz * 16 + (Math.random() * 16 | 0);
        const b = this.biomes[w.biomeAt(x, z)] || {};
        const y = w.rainHeight(x, z);
        if (b.precipitation === 'snow' || (b.temperature ?? 0.8) < 0.15) {
          const top = w.getBlock(x, y, z) & TYPE_MASK;
          if (top === ID.water && ((w.getBlock(x, y, z) >>> META_SHIFT) === 0)) w.setBlock(x, y, z, ID.ice);
          else if (T_OPAQUE[top] && w.getBlock(x, y + 1, z) === 0) w.setBlock(x, y + 1, z, ID.snow);
          else if (top === ID.snow) { const m = w.getBlock(x, y, z) >>> META_SHIFT; if (m < 2) w.setBlock(x, y, z, mk(ID.snow, m + 1)); }
        }
      }
      // lightning
      if (this.weather.thunderLevel > 0.5 && Math.random() < 1 / 20000) {
        const x = c.cx * 16 + (Math.random() * 16 | 0), z = c.cz * 16 + (Math.random() * 16 | 0);
        this.lightning(x, w.rainHeight(x, z) + 1, z);
      }
    }
  },

  skyLightAt(x, y, z) { return this.world.getLight(x, y, z)[0]; },
  lightAt(x, y, z) { const l = this.world.getLight(x, y, z); return Math.max(l[1], l[0] - this.skyDarkenLevel()); },
  skyDarkenLevel() { const e = this.env; return e ? Math.round((1 - e.skyDarken) / 0.8 * 11) : 0; },

  randomTickBlock(x, y, z, v) {
    const w = this.world, t = v & TYPE_MASK, m = v >>> META_SHIFT;
    switch (t) {
      case ID.grass_block: {
        const above = w.getBlock(x, y + 1, z) & TYPE_MASK;
        if (T_OPAQUE[above] || (this.lightAt(x, y + 1, z) < 4 && w.getLight(x, y + 1, z)[0] < 4 && T_OPAQUE[above])) { w.setBlock(x, y, z, ID.dirt, 2); return; }
        if (this.lightAt(x, y + 1, z) >= 9) {
          for (let i = 0; i < 4; i++) {
            const nx = x + (Math.random() * 3 | 0) - 1, ny = y + (Math.random() * 5 | 0) - 3, nz = z + (Math.random() * 3 | 0) - 1;
            if ((w.getBlock(nx, ny, nz) & TYPE_MASK) === ID.dirt && !T_OPAQUE[w.getBlock(nx, ny + 1, nz) & TYPE_MASK] && !T_FLUID[w.getBlock(nx, ny + 1, nz) & TYPE_MASK] && w.getLight(nx, ny + 1, nz)[0] >= 4) w.setBlock(nx, ny, nz, ID.grass_block, 2);
          }
        }
        return;
      }
      case ID.farmland: {
        let wet = false;
        for (let dx = -4; dx <= 4 && !wet; dx++) for (let dz = -4; dz <= 4 && !wet; dz++) for (let dy = 0; dy <= 1; dy++) if (T_FLUID[w.getBlock(x + dx, y + dy, z + dz) & TYPE_MASK] === 1) { wet = true; break; }
        if (wet || this.weather.rainLevel > 0.2 && w.rainHeight(x, z) <= y) { if (m < 7) w.setBlock(x, y, z, mk(ID.farmland, 7), 2); }
        else if (m > 0) w.setBlock(x, y, z, mk(ID.farmland, m - 1), 2);
        else if ((w.getBlock(x, y + 1, z) & TYPE_MASK) !== ID.wheat) w.setBlock(x, y, z, ID.dirt);
        return;
      }
      case ID.wheat: {
        if (m < 7 && this.lightAt(x, y, z) >= 9) {
          const moist = (w.getBlock(x, y - 1, z) >>> META_SHIFT) > 0;
          const f = moist ? 4 : 2;
          if (Math.random() < 1 / (Math.floor(25 / f) + 1)) w.setBlock(x, y, z, mk(ID.wheat, m + 1), 2);
        }
        return;
      }
      case ID.sugar_cane: case ID.cactus: {
        if (w.getBlock(x, y + 1, z) !== 0) return;
        let h = 1; while ((w.getBlock(x, y - h, z) & TYPE_MASK) === t) h++;
        if (h >= 3) return;
        if (m >= 15) { w.setBlock(x, y + 1, z, t); w.setBlock(x, y, z, t, 2); }
        else w.setBlock(x, y, z, mk(t, m + 1), 0);
        return;
      }
      case ID.fire: {
        if (Math.random() < 0.3) w.setBlock(x, y, z, 0);
        else for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]]) {
          const n = w.getBlock(x + dx, y + dy, z + dz);
          if (BLOCKS[n & TYPE_MASK].flammable && Math.random() < 0.2) { w.setBlock(x + dx, y + dy, z + dz, Math.random() < 0.5 ? ID.fire : 0); }
        }
        if (this.weather.rainLevel > 0.5 && w.rainHeight(x, z) <= y) w.setBlock(x, y, z, 0);
        return;
      }
      case ID.snow: case ID.ice:
        if (w.getLight(x, y, z)[1] > 11) w.setBlock(x, y, z, t === ID.ice ? ID.water : 0);
        return;
    }
    const b = BLOCKS[t];
    if (b.name.endsWith('_sapling')) {
      if (this.lightAt(x, y + 1, z) >= 9 && Math.random() < 1 / 7) {
        if (m === 0) w.setBlock(x, y, z, mk(t, 1), 0); else this.growTree(x, y, z, b.name.replace('_sapling', ''));
      }
      return;
    }
    if (b.name.endsWith('_leaves') && !(m & 1)) {
      if (!this.logNearby(x, y, z)) {
        this.breakBlockNaturally(x, y, z, v, true);
      }
    }
  },

  logNearby(x, y, z) {
    const w = this.world;
    const seen = new Set([x + ',' + y + ',' + z]);
    let frontier = [[x, y, z]];
    for (let d = 0; d < 6; d++) {
      const next = [];
      for (const [a, b, c] of frontier) for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const k = (a + dx) + ',' + (b + dy) + ',' + (c + dz);
        if (seen.has(k)) continue; seen.add(k);
        const n = BLOCKS[w.getBlock(a + dx, b + dy, c + dz) & TYPE_MASK];
        if (n.name.endsWith('_log')) return true;
        if (n.name.endsWith('_leaves')) next.push([a + dx, b + dy, c + dz]);
      }
      frontier = next;
      if (!frontier.length) break;
    }
    return !this.world.isLoaded(x + 8, z + 8) || !this.world.isLoaded(x - 8, z - 8);
  },

  // simple vanilla-like tree shapes for saplings
  growTree(x, y, z, wood) {
    const w = this.world;
    const log = ID[wood + '_log'], leaves = ID[wood + '_leaves'];
    if (log === undefined) return false;
    const rnd = Math.random;
    let h = wood === 'spruce' ? 6 + (rnd() * 4 | 0) : wood === 'jungle' ? 5 + (rnd() * 7 | 0) : wood === 'birch' ? 5 + (rnd() * 3 | 0) : 4 + (rnd() * 3 | 0);
    for (let i = 1; i <= h + 1; i++) if (!(w.getBlock(x, y + i, z) === 0 || BLOCKS[w.getBlock(x, y + i, z) & TYPE_MASK].name.endsWith('leaves'))) return false;
    const setL = (a, b, c) => { const cur = w.getBlock(a, b, c); if (cur === 0 || BLOCKS[cur & TYPE_MASK].replaceable && !T_FLUID[cur & TYPE_MASK]) w.setBlock(a, b, c, leaves, 2); };
    if (wood === 'spruce') {
      let r = 0, maxR = 2 + (rnd() * 2 | 0);
      for (let dy = h; dy >= 2; dy--) {
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (Math.abs(dx) + Math.abs(dz) <= r * 1.5 && !(r > 0 && Math.abs(dx) === r && Math.abs(dz) === r)) setL(x + dx, y + dy, z + dz);
        r = r >= maxR ? 1 : r + 1;
      }
      setL(x, y + h + 1, z);
    } else if (wood === 'cherry' || wood === 'acacia') {
      const ox = rnd() < 0.5 ? 1 : -1;
      for (let dy = h - 1; dy <= h; dy++) for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
        if (dx * dx + dz * dz > (dy === h ? 5 : 11)) continue;
        setL(x + dx + (dy === h ? 0 : 0), y + dy, z + dz);
      }
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (dx * dx + dz * dz <= 4) setL(x + dx, y + h + 1, z + dz);
      void ox;
    } else {
      for (let dy = h - 3; dy <= h; dy++) {
        const r = dy >= h - 1 ? 1 : 2;
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
          if (Math.abs(dx) === r && Math.abs(dz) === r && (dy === h || rnd() < 0.5)) continue;
          setL(x + dx, y + dy, z + dz);
        }
      }
    }
    for (let i = 0; i < h; i++) w.setBlock(x, y + i, z, log, i === 0 ? 3 : 2);
    if ((w.getBlock(x, y - 1, z) & TYPE_MASK) === ID.grass_block) w.setBlock(x, y - 1, z, ID.dirt, 2);
    return true;
  },

  boneMeal(x, y, z) {
    const w = this.world, v = w.getBlock(x, y, z), t = v & TYPE_MASK, m = v >>> META_SHIFT;
    const b = BLOCKS[t];
    const fx = () => { for (let i = 0; i < 8; i++) this.particles?.spawn('heart', x + Math.random(), y + Math.random() + 0.5, z + Math.random()); };
    if (t === ID.wheat && m < 7) { w.setBlock(x, y, z, mk(ID.wheat, Math.min(7, m + 2 + (Math.random() * 3 | 0)))); fx(); return true; }
    if (b.name.endsWith('_sapling')) { if (Math.random() < 0.45) this.growTree(x, y, z, b.name.replace('_sapling', '')); fx(); return true; }
    if (t === ID.grass_block) {
      for (let i = 0; i < 64; i++) {
        let nx = x, ny = y + 1, nz = z;
        for (let j = 0; j < i / 16; j++) { nx += (Math.random() * 3 | 0) - 1; ny += ((Math.random() * 3 | 0) - 1) * (Math.random() * 3 | 0) / 2 | 0; nz += (Math.random() * 3 | 0) - 1; }
        if ((w.getBlock(nx, ny - 1, nz) & TYPE_MASK) === ID.grass_block && w.getBlock(nx, ny, nz) === 0) {
          const r = Math.random();
          w.setBlock(nx, ny, nz, r < 0.85 ? ID.short_grass : r < 0.93 ? ID.dandelion : ID.poppy);
        }
      }
      fx(); return true;
    }
    if (t === ID.short_grass && w.getBlock(x, y + 1, z) === 0) { w.setBlock(x, y + 1, z, mk(ID.tall_grass, 1), 2); w.setBlock(x, y, z, ID.tall_grass); fx(); return true; }
    return false;
  },

  lightning(x, y, z) {
    this.weather.flash = 2;
    this.lightningBolts = this.lightningBolts || [];
    this.lightningBolts.push({ x, y, z, life: 6, seed: Math.random() * 1e9 | 0 });
    const d = Math.hypot(x - this.player.pos[0], z - this.player.pos[2]);
    this.audio?.thunder?.(d);
    this.audio?.play('random.explode', { x, y, z, volume: 2, pitch: 0.5 + Math.random() * 0.2 });
    const w = this.world;
    if (w.getBlock(x, y, z) === 0 && T_SOLID[w.getBlock(x, y - 1, z) & TYPE_MASK] && Math.random() < 0.5) w.setBlock(x, y, z, ID.fire);
    // damage nearby entities
    for (const e of [this.player, ...this.entities]) {
      if (Math.hypot(e.pos[0] - x, e.pos[1] - y, e.pos[2] - z) < 3) { if (e === this.player) this.player.damage(5, 'lightning'); else e.hurt?.(this, 5, null); }
    }
  },

  // ---- chat commands ----
  runCommand(text) {
    const args = text.slice(1).trim().split(/\s+/);
    const cmd = args.shift().toLowerCase();
    const p = this.player, w = this.world;
    const say = (s) => this.hud.addChat(s);
    const num = (s, base) => s === undefined ? base : s.startsWith('~') ? base + (Number(s.slice(1)) || 0) : Number(s);
    switch (cmd) {
      case 'time': {
        const v = { day: 1000, noon: 6000, sunset: 12000, night: 13000, midnight: 18000, sunrise: 23000 }[args[1]] ?? Number(args[1]);
        if (args[0] === 'set' && !isNaN(v)) { w.time = ((v % 24000) + 24000) % 24000; say(`Set the time to ${v}`); }
        else if (args[0] === 'add' && !isNaN(v)) { w.time = (w.time + v) % 24000; say(`Added ${v} to the time`); }
        else if (args[0] === 'query') say(`The time is ${Math.floor(w.time)}`);
        else say('§cUsage: /time <set|add|query> <value>');
        return;
      }
      case 'weather': {
        const t = args[0];
        if (this.weather.set(t, args[1] ? Number(args[1]) * 20 : undefined)) { this.weather.cur = { ...this.weather.target, ...(args[2] === 'now' ? {} : this.weather.cur) }; say(`Set the weather to ${t}`); }
        else say(`§cUnknown weather. Types: ${WEATHER_TYPES.join(', ')}`);
        return;
      }
      case 'gamemode': {
        const m = { 0: 'survival', 1: 'creative', 3: 'spectator', s: 'survival', c: 'creative', sp: 'spectator' }[args[0]] || args[0];
        if (['survival', 'creative', 'adventure', 'spectator'].includes(m)) { p.setGamemode(m); say(`Set own game mode to ${m[0].toUpperCase() + m.slice(1)} Mode`); }
        else say('§cUsage: /gamemode <survival|creative|spectator>');
        return;
      }
      case 'tp': case 'teleport': {
        const x = num(args[0], p.pos[0]), y = num(args[1], p.pos[1]), z = num(args[2], p.pos[2]);
        if ([x, y, z].some(isNaN)) { say('§cUsage: /tp <x> <y> <z>'); return; }
        p.setPos(x, y, z); p.vel = [0, 0, 0]; say(`Teleported to ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}`);
        return;
      }
      case 'give': {
        const name = (args[0] || '').replace('minecraft:', '');
        const id = IID[name];
        if (id === undefined) { say(`§cUnknown item '${name}'`); return; }
        const n = Number(args[1] || 1);
        this.inventory.addItem({ id, count: n });
        say(`Gave ${n} [${ITEMS[id].displayName}] to Player`);
        return;
      }
      case 'kill': p.damage(1000, 'kill'); return;
      case 'seed': say(`Seed: [${this.seed}]`); return;
      case 'spawnpoint': this.spawnPoint = [Math.floor(p.pos[0]) + 0.5, Math.floor(p.pos[1]), Math.floor(p.pos[2]) + 0.5]; say('Set spawn point'); return;
      case 'summon': {
        const t = (args[0] || '').replace('minecraft:', '');
        const x = num(args[1], p.pos[0] + 2), y = num(args[2], p.pos[1]), z = num(args[3], p.pos[2]);
        if (this.summon?.(t, x, y, z)) say(`Summoned new ${t}`); else say(`§cUnknown entity '${t}'`);
        return;
      }
      case 'shader': case 'shaders': this.settings.shaders = args[0] ? args[0] === 'on' : !this.settings.shaders; this.app?.applySettings(); say(`Shaders ${this.settings.shaders ? 'enabled' : 'disabled'}`); return;
      case 'clear': for (let i = 0; i < 41; i++) this.inventory.set(i, null); say('Cleared inventory'); return;
      case 'fill': {
        const [x1, y1, z1, x2, y2, z2] = args.slice(0, 6).map((s, i) => Math.floor(num(s, p.pos[i % 3])));
        const bn = (args[6] || '').replace('minecraft:', '');
        if (ID[bn] === undefined) { say('§cUnknown block'); return; }
        let n = 0;
        for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) for (let z = Math.min(z1, z2); z <= Math.max(z1, z2); z++) { if (n > 32768) break; w.setBlock(x, y, z, ID[bn]); n++; }
        say(`Successfully filled ${n} block(s)`);
        return;
      }
      case 'setblock': {
        const x = Math.floor(num(args[0], p.pos[0])), y = Math.floor(num(args[1], p.pos[1])), z = Math.floor(num(args[2], p.pos[2]));
        const bn = (args[3] || '').replace('minecraft:', '');
        if (ID[bn] === undefined) { say('§cUnknown block'); return; }
        w.setBlock(x, y, z, mk(ID[bn], Number(args[4] || 0))); say('Changed the block'); return;
      }
      case 'lightning': { const t = this.target; if (t && !t.entity) this.lightning(t.x, t.y + 1, t.z); else this.lightning(Math.floor(p.pos[0] + 5), Math.floor(p.pos[1]), Math.floor(p.pos[2])); return; }
      case 'help': say('Commands: /time /weather /gamemode /tp /give /kill /seed /summon /shader /clear /fill /setblock /spawnpoint /lightning'); return;
      default: say(`§cUnknown or incomplete command, see below for error`); say(`§7${text}§c<--[HERE]`);
    }
  },
};
void WOODS;
