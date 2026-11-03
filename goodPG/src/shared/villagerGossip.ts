// Lo que los aldeanos cuentan de cada jugador (GossipContainer y GossipType de Java 26.3). Cada aldeano guarda, por
// jugador, cuánto de cada clase de cotilleo sabe; la reputación del jugador para ese aldeano es la suma de cada valor
// por su peso, y le sube o le baja los precios. Los cotilleos se olvidan un poco cada día (decayPerDay) y se pasan de
// un aldeano a otro al encontrarse (perdiendo decayPerTransfer); los que bajan de 2 se olvidan del todo.
// - Comerciar: +2 de «trading» (hasta 25).
// - Hacerle daño a un aldeano: +25 de «minor_negative» (hasta 200) en ese aldeano.
// - Matar a un aldeano: +25 de «major_negative» (hasta 100) en los aldeanos que lo vean.
// - Curar a un aldeano zombi: +20 de «major_positive» (hasta 20, no se olvida) y +25 de «minor_positive» (hasta 25).

export interface GossipDef {
  weight: number;
  max: number;
  decayPerDay: number;
  decayPerTransfer: number;
}

export const GOSSIP_TYPES = {
  major_negative: { weight: -5, max: 100, decayPerDay: 10, decayPerTransfer: 10 },
  minor_negative: { weight: -1, max: 200, decayPerDay: 20, decayPerTransfer: 20 },
  minor_positive: { weight: 1, max: 25, decayPerDay: 1, decayPerTransfer: 5 },
  major_positive: { weight: 5, max: 20, decayPerDay: 0, decayPerTransfer: 20 },
  trading: { weight: 1, max: 25, decayPerDay: 2, decayPerTransfer: 20 },
} as const satisfies Record<string, GossipDef>;
export type GossipKind = keyof typeof GOSSIP_TYPES;
const KINDS = Object.keys(GOSSIP_TYPES) as GossipKind[];

/** Cotilleos de un aldeano: jugador (nombre en minúsculas) → valor de cada clase. */
export type Gossips = Record<string, Partial<Record<GossipKind, number>>>;

/** Lo que baja por debajo de esto se olvida (GossipContainer.DISCARD_THRESHOLD). */
const DISCARD = 2;
/** Tope de jugadores de los que se acuerda un aldeano (para que no crezca sin fin). */
const MAX_TARGETS = 64;

/** GossipContainer.add (con mergeValuesForAddition y makeSureValueIsntTooLowOrTooHigh). */
export function addGossip(g: Gossips, who: string, kind: GossipKind, amount: number): void {
  const def = GOSSIP_TYPES[kind];
  const e = g[who] ?? {};
  const old = e[kind] ?? 0;
  const sum = old + amount;
  let v = sum > def.max ? Math.max(def.max, old) : sum;
  if (v > def.max) v = def.max;
  if (v < DISCARD) delete e[kind];
  else e[kind] = v;
  if (Object.keys(e).length) {
    if (!g[who] && Object.keys(g).length >= MAX_TARGETS) delete g[Object.keys(g)[0]];
    g[who] = e;
  } else delete g[who];
}

/** Reputación de un jugador (EntityGossips.weightedValue de todas las clases). */
export function reputation(g: Gossips, who: string): number {
  const e = g[who];
  if (!e) return 0;
  let r = 0;
  for (const k of KINDS) r += (e[k] ?? 0) * GOSSIP_TYPES[k].weight;
  return r;
}

/** Un día más (GossipContainer.decay): cada clase baja lo suyo; lo que queda por debajo de 2 se olvida. */
export function decayGossip(g: Gossips): void {
  for (const who of Object.keys(g)) {
    const e = g[who];
    for (const k of KINDS) {
      if (e[k] === undefined) continue;
      const v = e[k]! - GOSSIP_TYPES[k].decayPerDay;
      if (v < DISCARD) delete e[k];
      else e[k] = v;
    }
    if (!Object.keys(e).length) delete g[who];
  }
}

/**
 * GossipContainer.transferFrom: `dst` oye hasta `maxCount` cotilleos de `src`, elegidos al azar con más probabilidad
 * cuanto más pesan; cada uno llega con decayPerTransfer menos y se queda el mayor. Devuelve cuántos se eligieron.
 */
export function transferGossip(dst: Gossips, src: Gossips, rand: () => number, maxCount: number): number {
  const entries: [string, GossipKind, number][] = [];
  for (const who of Object.keys(src)) for (const k of KINDS) if (src[who][k] !== undefined) entries.push([who, k, src[who][k]!]);
  if (!entries.length) return 0;
  const ranges: number[] = [];
  let end = 0;
  for (const [, k, v] of entries) {
    end += Math.abs(v * GOSSIP_TYPES[k].weight);
    ranges.push(end - 1);
  }
  const chosen = new Set<number>();
  for (let i = 0; i < maxCount; i++) {
    const c = Math.floor(rand() * end);
    let lo = 0;
    while (ranges[lo] < c) lo++;
    chosen.add(lo);
  }
  for (const i of chosen) {
    const [who, k, v] = entries[i];
    const decayed = v - GOSSIP_TYPES[k].decayPerTransfer;
    if (decayed < DISCARD) continue;
    const e = dst[who] ?? {};
    e[k] = Math.max(e[k] ?? 0, decayed);
    if (!dst[who] && Object.keys(dst).length >= MAX_TARGETS) continue;
    dst[who] = e;
  }
  return chosen.size;
}

/** Cotilleos válidos que llegan del guardado. */
export function sanitizeGossips(raw: unknown): Gossips {
  const out: Gossips = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [who, e] of Object.entries(raw as Record<string, unknown>).slice(0, MAX_TARGETS)) {
    if (typeof who !== 'string' || who.length > 32 || !e || typeof e !== 'object') continue;
    const clean: Partial<Record<GossipKind, number>> = {};
    for (const k of KINDS) {
      const v = Number((e as Record<string, unknown>)[k]);
      if (Number.isInteger(v) && v >= DISCARD) clean[k] = Math.min(GOSSIP_TYPES[k].max, v);
    }
    if (Object.keys(clean).length) out[who] = clean;
  }
  return out;
}
