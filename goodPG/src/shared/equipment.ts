// Fase 6.5 (equipo): constantes y reglas puras del equipo nuevo (ballesta, tridente, cohetes, cuerno
// de cabra, caña con zanahoria, armaduras de caballo y de lobo, caparazón de tortuga y conducto).
// Este módulo no importa nada del juego: lo usan los objetos, el servidor, el cliente y las pruebas.

/** Entidades nuevas: tridente lanzado y cohete de fuegos artificiales en vuelo. */
export const ENT_TRIDENT = 110;
export const ENT_FIREWORK = 111;

// ------------------------------------------------------------------ ballesta y tridente

/** Segundos manteniendo el clic derecho para cargar la ballesta (Minecraft: 25 ticks). */
export const CROSSBOW_CHARGE = 1.25;
/** Velocidad de salida del virote de la ballesta (bloques/s; el arco tensado del todo, 55). */
export const CROSSBOW_SPEED = 63;
/** Daño base del virote (con la velocidad sale ~9, el arco ~6). */
export const CROSSBOW_ARROW_DAMAGE = 2.8;
/** Segundos mínimos de carga para lanzar el tridente (Minecraft: 10 ticks). */
export const TRIDENT_MIN_CHARGE = 0.5;
/** Daño del tridente lanzado y velocidad de salida (2,5 bloques por tick). */
export const TRIDENT_THROW_DAMAGE = 8;
export const TRIDENT_SPEED = 50;
/** Probabilidad de que un ahogado aparezca con tridente y de que lo suelte al morir. */
export const DROWNED_TRIDENT_CHANCE = 0.0625;
export const DROWNED_TRIDENT_DROP = 0.25;
/** Probabilidad de que un ahogado lleve una concha de nautilo (la suelta siempre). */
export const DROWNED_SHELL_CHANCE = 0.03;
/** Probabilidad de que un saqueador suelte su ballesta. */
export const PILLAGER_CROSSBOW_DROP = 0.085;
/** Probabilidad de que un conejo suelte su pata. */
export const RABBIT_FOOT_DROP = 0.1;

// ------------------------------------------------------------------ cuerno, caña y tortuga

/** Enfriamiento del cuerno de cabra (s) y distancia a la que se oye (bloques). */
export const GOAT_HORN_COOLDOWN = 7;
export const GOAT_HORN_RANGE = 256;
/** Tonadas del cuerno (la variante va en el desgaste de la pila: 1..8). */
export const GOAT_HORN_TUNES = ['Reflexión', 'Canto', 'Búsqueda', 'Sentir', 'Admiración', 'Llamada', 'Anhelo', 'Sueño'] as const;

/** Nombre de la tonada de un cuerno (dmg 1..8; sin variante, la primera). */
export function hornTune(dmg: number | undefined): string {
  const i = Math.max(0, Math.min(GOAT_HORN_TUNES.length - 1, (dmg ?? 1) - 1));
  return GOAT_HORN_TUNES[i];
}

/** Caña con zanahoria: desgaste de cada acelerón y cuánto dura (s). */
export const CARROT_BOOST_WEAR = 7;
export const CARROT_BOOST_SECONDS = 2.5;
/** Velocidad del cerdo guiado con la caña (bloques/s) y con el acelerón. */
export const PIG_STEER_SPEED = 2.4;
export const PIG_BOOST_SPEED = 6;

/** Respiración acuática del caparazón de tortuga al sacar la cabeza del agua (s). */
export const TURTLE_SHELL_BREATH = 10;
/** Escamas que suelta una cría de tortuga al crecer. */
export const TURTLE_SCUTES_ON_GROW = 1;

// ------------------------------------------------------------------ armaduras de caballo y lobo

/** Puntos de armadura de cada armadura para caballo (valores de Minecraft). */
export const HORSE_ARMOR_POINTS: Readonly<Record<string, number>> = { leather: 3, iron: 5, golden: 7, diamond: 11, netherite: 19 };
/** Fase 8.5: dureza de la armadura para caballo (la de diamante 2 y la de netherita 3, que además resiste el empuje). */
export const HORSE_ARMOR_TOUGHNESS: Readonly<Record<string, number>> = { diamond: 2, netherite: 3 };
export const HORSE_ARMOR_MATERIALS = ['leather', 'iron', 'golden', 'diamond', 'netherite'] as const;
/** Durabilidad de la armadura para lobo (se desgasta con el daño que absorbe). */
export const WOLF_ARMOR_DURABILITY = 64;
/** Escamas de armadillo que cuesta la armadura para lobo. */
export const WOLF_ARMOR_SCUTES = 6;

// ------------------------------------------------------------------ conducto

/** Bloques de marco mínimos para que funcione y alcance (bloques) por cada 7 de marco. */
export const CONDUIT_MIN_FRAME = 16;
export const CONDUIT_RANGE_PER_7 = 16;
/** Segundos del efecto Poder del conducto que da cada pulso (cada 2 s). */
export const CONDUIT_EFFECT_SECONDS = 13;

/** Alcance del conducto con `frame` bloques de marco (0 si no llega al mínimo). */
export function conduitRange(frame: number): number {
  return frame < CONDUIT_MIN_FRAME ? 0 : Math.floor(frame / 7) * CONDUIT_RANGE_PER_7;
}

/**
 * Posiciones del marco alrededor del conducto (como en Minecraft): en el cubo de 5×5×5, las casillas
 * de los tres anillos de 5×5 (planos x = 0, y = 0, z = 0) que quedan a distancia 2 en algún eje.
 * Son 42; con 16 funciona.
 */
export const CONDUIT_FRAME: readonly [number, number, number][] = (() => {
  const out: [number, number, number][] = [];
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      for (let k = -2; k <= 2; k++) {
        const a = Math.abs(i), b = Math.abs(j), c = Math.abs(k);
        if (a <= 1 && b <= 1 && c <= 1) continue;
        if ((i === 0 && (b === 2 || c === 2)) || (j === 0 && (a === 2 || c === 2)) || (k === 0 && (a === 2 || b === 2))) out.push([i, j, k]);
      }
    }
  }
  return out;
})();

// ------------------------------------------------------------------ fuegos artificiales

/**
 * Colores de los fuegos artificiales en el orden de los 16 tintes (blanco, naranja, magenta, azul
 * claro, amarillo, lima, rosa, gris, gris claro, cian, morado, azul, marrón, verde, rojo y negro).
 */
export const FIREWORK_RGB: readonly (readonly [number, number, number])[] = [
  [240, 240, 240], [235, 136, 68], [195, 84, 205], [102, 137, 211], [222, 207, 42], [65, 205, 52], [216, 129, 152],
  [67, 67, 67], [171, 171, 171], [40, 118, 151], [123, 47, 190], [37, 49, 146], [81, 48, 26], [59, 81, 26], [179, 49, 44],
  [30, 27, 27],
];
export const FIREWORK_COLOR_COUNT = 16;

/** Datos de un cohete (van en el desgaste de la pila): duración de vuelo 1..3 y colores (un bit por tinte). */
export function fireworkData(flight: number, colors: number): number {
  return (Math.max(1, Math.min(3, flight | 0)) & 3) | ((colors & 0xffff) << 2);
}

/** Duración de vuelo de un cohete (1..3). */
export function fireworkFlight(dmg: number | undefined): number {
  return Math.max(1, Math.min(3, (dmg ?? 1) & 3 || 1));
}

/** Colores de un cohete (máscara de 16 bits; 0 = sube y se apaga sin estallar). */
export function fireworkColors(dmg: number | undefined): number {
  return ((dmg ?? 0) >> 2) & 0xffff;
}

/** Índices de los colores de una máscara. */
export function colorList(mask: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < FIREWORK_COLOR_COUNT; i++) if (mask & (1 << i)) out.push(i);
  return out;
}

/** Segundos de vuelo del cohete antes de estallar (Minecraft: 10·(vuelo+1) + azar de 0 a 11 ticks). */
export function fireworkLife(flight: number, r: number): number {
  return (10 * (flight + 1) + Math.floor(r * 12)) / 20;
}
