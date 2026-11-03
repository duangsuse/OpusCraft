// Validación de las ofertas guardadas de un aldeano (villagers.ts StoredOffer): cada una tiene que seguir existiendo
// en la tabla de su oficio y sus datos se validan como los de la pila que da.
import { templateByKey, MAX_OFFER_COUNT, type StoredOffer } from '../../villagers';
import { isValidItem, maxStack } from '../../items';
import { sanitizeItemData } from '../../itemData';

export function sanitizeStoredOffers(prof: number, raw: unknown): StoredOffer[] {
  if (!Array.isArray(raw)) return [];
  const out: StoredOffer[] = [];
  const seen = new Set<number>();
  for (const r of raw.slice(0, MAX_OFFER_COUNT)) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const k = Number(o.k), c = Number(o.c);
    const t = Number.isInteger(k) ? templateByKey(prof, k) : undefined;
    if (!t || seen.has(k) || !Number.isInteger(c) || c < 1 || c > maxStack(t.cost[0])) continue;
    const s: StoredOffer = { k, c };
    const rid = Number(o.r);
    if (o.r !== undefined && Number.isInteger(rid) && isValidItem(rid)) s.r = rid;
    const d = sanitizeItemData(s.r ?? t.result[0], o.d);
    if (d) s.d = d;
    const rd = Number(o.rd);
    if (Number.isInteger(rd) && rd > 0 && rd < 1000) s.rd = rd;
    seen.add(k);
    out.push(s);
  }
  return out;
}
