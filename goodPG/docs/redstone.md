# Redstone (fase 7)

Cómo funciona la redstone de VoxelCraft y cómo se engancha un bloque nuevo (pistones, observadores,
tolvas, dispensadores…) sin tocar el motor.

## Dónde está cada cosa

| Archivo | Qué hay |
| --- | --- |
| `src/shared/redstone/api.ts` | Caras, la `RedstoneApi` que ofrece el motor y el registro (`registerRedstone`, `setConductor`). |
| `src/shared/redstone/signals.ts` | Consultas de potencia puras (fuerte, débil, la que llega por una cara). |
| `src/shared/redstone/wire.ts` | El polvo, cable a cable como en Java (y el orden de `HashSet`/`HashMap<BlockPos>` de Java). |
| `src/shared/redstone/components.ts` | Lo que hace cada componente (antorchas, repetidores, comparadores, placas…). |
| `src/shared/redstone/rails.ts` | Raíles propulsores, activadores, detectores y cruces en T. |
| `src/shared/redstone/use.ts` | El clic derecho sobre componentes, como función pura (la usan cliente y servidor). |
| `src/shared/blocks/redstoneBlocks.ts` | Los bloques y lo que **emite** cada uno. |
| `src/shared/sim/server/redstone.ts` | El motor del servidor (`Redstone`, en `GameServer.sys.redstone`). |
| `src/client/game/redstoneClient.ts` | Uso en el cliente, efectos y partículas. |

Importar `src/shared/redstone` registra todos los componentes.

## Modelo

- Potencia de 0 a 15. Cada emisor da, **hacia cada cara**, una potencia débil y otra fuerte (como
  `getSignal` y `getDirectSignal` de Minecraft).
- Un bloque **conductor** (cubo sólido opaco, salvo los que se fuerzan con `setConductor`: piedra
  luminosa, bloque de redstone, cofres) recibe la potencia fuerte de sus vecinos y la da a todo lo que
  tenga alrededor. El polvo cuenta como fuerte hacia el bloque al que apunta, pero ese bloque no
  alimenta a otro polvo (la «potencia débil» de Minecraft).
- Nada recorre el mundo: todo va por **avisos locales** y **ticks programados**, con el modelo de
  actualizaciones de Minecraft Java (auditoría: `docs/redstone-auditoria.md`):
  - Cada cambio de bloque, dentro de su `setBlock`: `removed` (onRemove) del bloque viejo y `placed`
    (onPlace) del nuevo; luego, con la opción 1, aviso a los seis vecinos (`updateNeighborsAt`, en el orden
    oeste, este, abajo, arriba, norte, sur; el bloque que avisa es el viejo) y a los comparadores si el
    bloque tiene lectura; y, salvo con la opción 16, las actualizaciones de forma de los vecinos (`shape`,
    en el orden oeste, este, norte, sur, abajo, arriba).
  - `setBlock(x, y, z, id, flags)` lleva las opciones de Java: `UPDATE_ALL` (3, por defecto),
    `UPDATE_CLIENTS` (2: cambia sin avisar a los vecinos, como el repetidor, la lámpara o la tolva),
    `UPDATE_KNOWN_SHAPE` (16: sin formas) y `UPDATE_MOVE_BY_PISTON` (64).
  - Los avisos se atienden como el `CollectingNeighborUpdater` de Java: en profundidad (lo que provoca un
    aviso se atiende antes de seguir con el siguiente) y con su tope (un millón encadenados).
  - Cada componente avisa a quien avisa en Java: la antorcha a los vecinos de sus seis vecinos; la palanca y
    los botones a sus vecinos y a los del bloque en el que se apoyan; las placas a los suyos y a los del de
    debajo; el repetidor, el comparador y el observador sólo al bloque de delante y a los vecinos de ese…
  - Ticks programados: un montón ordenado por (tick, prioridad, orden de llegada), uno por posición; los
    que vencen se recogen al empezar su fase y `willTickNow` es el `willTickThisTick` de Java.
  - Eventos de bloque (`api.blockEvent`, `event`): los pistones no se mueven al recibir el aviso; apuntan
    un evento que se atiende en su fase.
  - Fases del tick, las de Java: ticks programados → fluidos → ticks aleatorios → eventos de bloque →
    entidades (lo que se pisa) → entidades de bloque (bloques en movimiento, tolvas, sensores de luz).
- Los cambios viajan a los clientes como cualquier cambio de bloque: el estado de cada componente
  (encendido, potencia del polvo, retardo…) está en su id de bloque.
- Lo que no cabe en el estado (salida de un comparador, mirones de un cofre trampa, si una puerta ya
  recibía potencia) va en un **dato por posición** (`getData`/`setData`), que se borra solo cuando el
  bloque cambia de familia. No se guarda con el mundo: al cargar un chunk, los componentes lo rehacen.

## Registrar un bloque

```ts
import { registerRedstone, DOWN, UP } from '../redstone';

registerRedstone(MI_BLOQUE, {
  // EMITE: potencia débil y fuerte hacia `face` (dirección del emisor hacia quien la recibe).
  emitter: {
    weak: (v, x, y, z, id, face) => (encendido(id) ? 15 : 0),
    strong: (v, x, y, z, id, face) => (encendido(id) && face === DOWN ? 15 : 0), // opcional
    connects: (id, face) => true, // opcional: ¿se une el polvo a él por ese lado?
  },
  // ESCUCHA (neighborChanged): algo cambió a su alrededor (sx, sy, sz: dónde; src: el bloque que avisa).
  neighbor: (api, x, y, z, id, sx, sy, sz, src) => {
    if (api.isPowered(x, y, z) !== encendido(id) && !api.willTickNow(x, y, z)) api.schedule(x, y, z, 2);
  },
  // Tick programado que vence: cambia (con las opciones que use en Java) y avisa a quien avise en Java.
  tick: (api, x, y, z, id) => {
    api.setBlock(x, y, z, conEncendido(id, api.isPowered(x, y, z)));
    api.updateNeighbors(x, y - 1, z, -1, id); // p. ej. también a los vecinos del bloque de debajo
  },
});
```

Todo lo demás es opcional:

| Campo | Cuándo se llama |
| --- | --- |
| `emitter` | Cada vez que alguien pregunta cuánta potencia da (tiene que ser puro y barato). |
| `neighbor` | neighborChanged: le llegó un aviso (se acumulan: varios registros suman oyentes). |
| `placed` / `removed` | onPlace / onRemove: el bloque cambió (dentro del setBlock, antes de los avisos); `moved` si lo movió un pistón. |
| `shape` | updateShape: cambió el vecino de una cara; devuelve el estado nuevo (el observador, el bloqueo del repetidor). |
| `event` | triggerEvent: un evento de bloque apuntado con `api.blockEvent` (pistones). |
| `tick` | Vence un tick programado con `api.schedule` (si el bloque sigue siendo de la misma familia). |
| `changed` | El bloque se puso, se quitó o cambió de estado; con `old = -1`, al cargar su chunk (entonces sólo anotar y programar, sin cambiar bloques). |
| `analog` | Lo que lee un comparador de él (0..15). |
| `stepped` | Hay una entidad en su celda este tick (placas, cuerda, mena). |
| `projectile` | Le da una flecha, un tridente o algo lanzado (diana). |
| `periodic` | Cada `every` ticks mientras está cargado (sensor de luz solar). |
| `use` | Clic derecho de un jugador; devuelve si lo atendió. |

El registro es por **familia** (el estado base): vale para todos sus estados.

## Consultar la potencia

Desde cualquier manejador, con la `api` que recibe:

```ts
api.isPowered(x, y, z);       // ¿recibe alguna potencia? (hasNeighborSignal)
api.power(x, y, z);           // la mayor que recibe de sus seis vecinos, 0..15
api.powerFrom(x, y, z, face); // la que le llega desde el vecino de esa cara (getSignal)
api.strongPower(x, y, z);     // la potencia fuerte que recibe (getDirectSignalTo)
api.analog(x, y, z);          // lo que leería un comparador del bloque; -1 si nada
```

Fuera de un manejador (otros sistemas del servidor), lo mismo con `gameServer.sys.redstone`, o las
funciones puras de `signals.ts` con cualquier `RedstoneView` (`getBlock` y `getData`).

## Programar ticks y avisar

```ts
api.schedule(x, y, z, 4, PRIORITY_HIGH); // dentro de 4 ticks de juego; si ya hay uno ahí, no hace nada
api.isScheduled(x, y, z);
api.willTickNow(x, y, z);                // willTickThisTick de Java
api.updateNeighbors(x, y, z, except, src); // updateNeighborsAt (salvo la cara `except`), avisando como `src`
api.updateAt(x, y, z, fx, fy, fz, src);  // neighborChanged sobre un solo bloque
api.blockEvent(x, y, z, a, b);           // evento de bloque (se atiende en su fase)
api.stateTouched(x, y, z, flags);        // cambió una propiedad que va en el dato de posición: avisos y formas
api.outputChanged(x, y, z);              // cofre trampa, sensor de sculk: sus vecinos y los de debajo
api.analogChanged(x, y, z);              // cambió lo que lee un comparador (contenido de un cofre)
```

Un tick de redstone son 2 ticks de juego. Las prioridades son las de Minecraft (más baja, antes):
`PRIORITY_EXTREMELY_HIGH` … `PRIORITY_NORMAL`.

## Ejemplo: el observador (como el de Java)

```ts
registerRedstone(OBSERVER, {
  // updateShape: lo que cambia delante de su cara programa el pulso.
  shape: (api, x, y, z, id, face) => {
    if (face === facingOf(id) && !on(id) && !api.isScheduled(x, y, z)) api.schedule(x, y, z, 2);
    return id;
  },
  tick: (api, x, y, z, id) => {
    api.setBlock(x, y, z, conOn(id, !on(id)), UPDATE_CLIENTS); // cambia sin avisar…
    if (!on(id)) api.schedule(x, y, z, 2); // pulso de 2 ticks
    avisarDetras(api, x, y, z, id); // …y avisa al bloque de detrás y a los vecinos de ese
  },
});
```

## Lo que se engancha desde fuera del motor

- Contenedores (`containerSlots`, `viewers`), atriles, tocadiscos y marcos llegan por `Redstone.hooks`
  (los pone `GameServer`).
- Los raíles del transporte: `transport.rails.railPowered` usa `redstone.isPowered`.
- Proyectiles (`projectileHit`), rayos (`lightningTarget`, `lightning`), cofres que se abren
  (`viewersChanged`) y contenidos que cambian (`analogChanged`) avisan al motor.
- Los mecanismos (pistones, observadores, tolvas, dispensadores, soltadores y dinamita) usan esta API
  desde fuera del motor: ver `docs/mecanismos.md`.

## Rendimiento

- Los avisos se atienden sin recursión (una pila, como Java), con el tope de Java (un millón
  encadenados); los ticks programados, con el tope de Minecraft (65 536).
- El polvo va cable a cable como en Java: cada cambio avisa a los vecinos de siete posiciones, así que una
  red grande da muchos avisos (como en Java). La prueba de rendimiento (`tests/redstone.test.ts`) mueve una
  rejilla de 40×40 de polvo y diez relojes a la vez: unos 4,5 ms por tick.
- Lo que depende del orden de Java se comprueba contra Java de verdad: `tools/JavaHashOrder.java` genera
  `tests/fixtures/javaHashOrder.json` (el orden de `HashSet` y `HashMap<BlockPos>`) y
  `tests/redstoneJava.test.ts` lo compara.
