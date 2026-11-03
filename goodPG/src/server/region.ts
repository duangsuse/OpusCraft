// Región de Cloudflare donde nace un mundo. Un Durable Object se crea una vez y se queda para siempre en el centro
// de datos donde nació; sin pista, Cloudflare elige el más cercano que admite objetos (desde Sudamérica suele ser
// Miami). Con la pista (locationHint) de la región de quien lo crea, el mundo queda cerca de sus jugadores. La
// pista sólo cuenta al crearlo: a un mundo que ya existe no le afecta.

export type RegionHint = 'wnam' | 'enam' | 'sam' | 'weur' | 'eeur' | 'apac' | 'oc' | 'afr' | 'me';

/** Lo que Cloudflare sabe de dónde viene una petición (request.cf). */
export interface GeoInfo {
  continent?: string;
  country?: string;
  longitude?: string | number;
}

/** Países de Oriente Medio (Cloudflare los cuenta en Asia, pero tienen su propia región). */
const MIDDLE_EAST = new Set(['AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'IL', 'JO', 'LB', 'SY', 'IQ', 'IR', 'YE', 'PS', 'TR']);

/** La pista de región para un mundo nuevo creado desde `geo` (undefined: que decida Cloudflare). */
export function regionFor(geo: GeoInfo | undefined | null): RegionHint | undefined {
  if (!geo) return undefined;
  const lon = Number(geo.longitude);
  switch (geo.continent) {
    case 'SA':
      return 'sam';
    case 'NA':
      // Oeste (Pacífico y Montañas) u este (el resto, también Centroamérica, el Caribe y casi todo México).
      return Number.isFinite(lon) && lon < -104 ? 'wnam' : 'enam';
    case 'EU':
      return Number.isFinite(lon) && lon >= 16 ? 'eeur' : 'weur';
    case 'AS':
      return geo.country && MIDDLE_EAST.has(geo.country) ? 'me' : 'apac';
    case 'OC':
      return 'oc';
    case 'AF':
      return 'afr';
    default:
      return undefined;
  }
}

/** Nombre legible de un centro de datos de Cloudflare (su código IATA), para la lista de jugadores. */
const CITIES: Record<string, string> = {
  MIA: 'Miami', EWR: 'Newark', IAD: 'Washington', ATL: 'Atlanta', DFW: 'Dallas', ORD: 'Chicago', LAX: 'Los Ángeles',
  SJC: 'San José (EE. UU.)', SEA: 'Seattle', DEN: 'Denver', PHX: 'Phoenix', YYZ: 'Toronto', GRU: 'São Paulo',
  GIG: 'Río de Janeiro', SCL: 'Santiago', EZE: 'Buenos Aires', BOG: 'Bogotá', LIM: 'Lima', UIO: 'Quito', GYE: 'Guayaquil',
  CCS: 'Caracas', MEX: 'Ciudad de México', QRO: 'Querétaro', GDL: 'Guadalajara', PTY: 'Panamá', SJO: 'San José (Costa Rica)',
  MVD: 'Montevideo', ASU: 'Asunción', LPB: 'La Paz', LHR: 'Londres', FRA: 'Fráncfort', AMS: 'Ámsterdam', CDG: 'París',
  MAD: 'Madrid', BCN: 'Barcelona', MXP: 'Milán', WAW: 'Varsovia', ARN: 'Estocolmo', NRT: 'Tokio', HKG: 'Hong Kong',
  SIN: 'Singapur', SYD: 'Sídney', JNB: 'Johannesburgo', DXB: 'Dubái',
};

export function cityOf(colo: string): string {
  return CITIES[colo] ?? colo;
}
