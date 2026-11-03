// Fase 7 (mecanismos): lo que el servidor y el cliente saben de la dinamita encendida (tipo de entidad,
// mecha, potencia y medidas) y de los efectos de los mecanismos.

/** Dinamita encendida (entidad): cae, rebota un poco y explota al acabarse la mecha. */
export const ENT_TNT = 180;
/** Mecha de la dinamita (ticks: 4 s). */
export const TNT_FUSE = 80;
/** Potencia de la explosión de la dinamita. */
export const TNT_POWER = 4;
/** Medidas de la dinamita encendida (casi un bloque). */
export const TNT_SIZE = 0.98;

/** Ticks (1/20 s) que tarda en deslizarse lo que mueve un pistón. */
export const PISTON_MOVE_TICKS = 2;
/** Dirección de 'pmove' de lo que se dibuja quieto en su celda (la base extendida del pistón que se recoge). */
export const PMOVE_STILL = 6;
