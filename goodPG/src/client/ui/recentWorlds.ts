// Mundos recientes del menú: los últimos en los que se jugó en este navegador (nombre, si era sin
// conexión y cuándo). Quitar uno de la lista no borra el mundo.

export interface RecentWorld {
  room: string;
  offline: boolean;
  at: number;
}

const KEY = 'voxelcraft:recent-worlds';
const MAX = 8;

export function loadRecentWorlds(): RecentWorld[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown[];
    return raw
      .filter((w): w is RecentWorld => !!w && typeof (w as RecentWorld).room === 'string' && Number.isFinite((w as RecentWorld).at))
      .map((w) => ({ room: w.room, offline: !!w.offline, at: w.at }))
      .slice(0, MAX);
  } catch {
    return [];
  }
}

function save(list: RecentWorld[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* sin almacenamiento */
  }
}

/** Anota que se entró en un mundo (el más reciente, primero). */
export function rememberWorld(room: string, offline: boolean): void {
  const list = loadRecentWorlds().filter((w) => !(w.room === room && w.offline === offline));
  list.unshift({ room, offline, at: Date.now() });
  save(list);
}

export function forgetWorld(room: string, offline: boolean): void {
  save(loadRecentWorlds().filter((w) => !(w.room === room && w.offline === offline)));
}

/** "hace 5 min", "hace 2 h", "hace 3 días". */
export function ago(at: number): string {
  const m = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} día${d === 1 ? '' : 's'}`;
}
