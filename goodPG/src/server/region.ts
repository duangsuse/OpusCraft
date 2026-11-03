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
  MIA: '迈阿密', EWR: '纽瓦克', IAD: '华盛顿', ATL: '亚特兰大', DFW: '达拉斯', ORD: '芝加哥', LAX: '洛杉矶',
  SJC: '圣何塞（美国）', SEA: '西雅图', DEN: '丹佛', PHX: '凤凰城', YYZ: '多伦多', GRU: '圣保罗',
  GIG: '里约热内卢', SCL: '圣地亚哥', EZE: '布宜诺斯艾利斯', BOG: '波哥大', LIM: '利马', UIO: '基多', GYE: '瓜亚基尔',
  CCS: '加拉加斯', MEX: '墨西哥城', QRO: '克雷塔罗', GDL: '瓜达拉哈拉', PTY: '巴拿马城', SJO: '圣何塞（哥斯达黎加）',
  MVD: '蒙得维的亚', ASU: '亚松森', LPB: '拉巴斯', LHR: '伦敦', FRA: '法兰克福', AMS: '阿姆斯特丹', CDG: '巴黎',
  MAD: '马德里', BCN: '巴塞罗那', MXP: '米兰', WAW: '华沙', ARN: '斯德哥尔摩', NRT: '东京', HKG: '香港',
  SIN: '新加坡', SYD: '悉尼', JNB: '约翰内斯堡', DXB: '迪拜',
};

export function cityOf(colo: string): string {
  return CITIES[colo] ?? colo;
}
