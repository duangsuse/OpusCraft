# Vibraciones y sculk (fase 7.5)

Cómo funcionan las vibraciones del Deep Dark (los «game events» de Minecraft) y cómo las usa otro sistema.

## Dónde está cada cosa

| Archivo | Qué hay |
| --- | --- |
| `src/shared/vibrations.ts` | Frecuencia de cada suceso (tabla de Minecraft 1.20+), alcances, ticks de los sensores, lana que ocluye y ahoga, potencia por distancia. Puro. |
| `src/shared/blocks/deepDarkBlocks.ts` | Sculk, venas, catalizador, sensores (fases, agua) y chillador; lo que emiten los sensores a la redstone. |
| `src/shared/sculkSpread.ts` | Cómo extiende el sculk un catalizador (el `SculkSpreader` de Minecraft), puro. |
| `src/shared/sim/server/vibrations.ts` | El sistema (`Vibrations`, en `gameServer.sys.deepDark.vibrations`). |
| `src/shared/sim/server/sculk.ts` | Catalizadores, venas sueltas, chilladores, avisos del warden y su invocación. |
| `src/shared/sim/server/deepDark.ts` | Lo que crea `GameServer` y lo que le avisa (y la última muerte, para la brújula de recuperación). |
| `src/shared/sim/entities/warden.ts` | El warden, que oye como un oyente más. |

## Emitir una vibración

```ts
gs.sys.deepDark.vibrations.emit('block_activate', x + 0.5, y + 0.5, z + 0.5, { who: s.id });
```

- `who`: jugador (id de sesión) o entidad (id) que la causa; `owner`: quien lanzó el proyectil o tiró
  el objeto; `sneaking`: agachado (no vibran los pasos, las caídas, los disparos ni los bocados);
  `block`: el bloque colocado o roto (la lana no vibra).
- Si no hay ningún oyente apuntado, `emit` vuelve enseguida: se puede llamar sin miedo.
- Ya se emiten solos: pasos, brazadas, caídas, bocados, disparos con el arco y cofres de los jugadores;
  pasos, caídas, chapoteos y proyectiles que aterrizan de las entidades cercanas a un oyente; colocar,
  romper y cambiar bloques (los jugadores); abrir y cerrar puertas, trampillas y portillos, palancas,
  botones, placas, ganchos y pistones (lo haga quien lo haga); y los efectos `explode`, `mob_death`,
  `mob_hurt`, `teleport`, `note`, `bell`, `mob_shoot`, `crossbow_shoot`, `creeper_fuse`, `tnt_primed`,
  `shear`, `witch_drink`, `milk`, `throw` y los rayos.

## Oír vibraciones

- Bloques: los sensores (8 bloques), los calibrados (16) y los chilladores (8, sólo el chasquido de un
  sensor que activó un jugador) se apuntan solos por chunk al colocarse o cargarse.
- Entidades: `vibrations.listen({ entity, range, eye, accepts(ev, src), receive(ev, x, y, z, src, d) })`.
  Se borran solas al morir o desaparecer.
- Cada oyente se queda con la vibración más cercana del tick; al tick siguiente viaja (un bloque por
  tick, con la partícula `vibration`) y al llegar actúa. Mientras viaja una, no atiende otras.

## Sensores

- Potencia `max(1, 15 − ⌊15·d/alcance⌋)` por todos los lados (fuerte hacia abajo; el calibrado, no hacia
  su entrada) durante 30 ticks (el calibrado, 10) y 10 más enfriándose. La potencia y la frecuencia van
  en el dato por posición del motor (`sculkSignal`), así que no se guardan: al cargar el chunk, un sensor
  activo vuelve al reposo.
- El comparador lee la frecuencia de la última vibración mientras está activo.
- El calibrado sólo atiende la frecuencia que recibe por su entrada (si recibe alguna).
- Al activarse, hacen resonar la amatista de al lado con su frecuencia (una vibración `resonate`).

## Rendimiento

- Oyentes de bloque por chunk; un suceso mira como mucho 9 chunks. Las entidades sólo se siguen cerca de
  algún oyente. La prueba de `tests/deepDark.test.ts` mueve 40 criaturas entre 300 sensores.
