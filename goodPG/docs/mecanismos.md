# Mecanismos (fase 7)

Pistones, observadores, tolvas, dispensadores, soltadores, dinamita y las vagonetas con tolva y con
dinamita. Se enganchan a la redstone con su API (ver `docs/redstone.md`). Desde la auditoría de la redstone
(`docs/redstone-auditoria.md`) hacen lo mismo que sus clases de Java, con sus mismos avisos y opciones.

## Dónde está cada cosa

| Archivo | Qué hay |
| --- | --- |
| `src/shared/blocks/mechanismBlocks.ts` | Los bloques (6 orientaciones, modelos del pistón y la tolva) y lo que emite el observador. |
| `src/shared/pistons.ts` | Qué mueve un pistón (el `PistonStructureResolver` de Minecraft), puro. |
| `src/shared/explosions.ts` | Resistencia de los bloques y los rayos de una explosión, puro. |
| `src/shared/mechanismPlacement.ts` | Cómo se orientan al colocarlos (con la inclinación de la mirada). |
| `src/shared/mechanisms.ts` | Dinamita encendida (tipo de entidad 180, mecha, potencia). |
| `src/shared/sim/server/mechanisms.ts` | Lo que crea `GameServer` (y los observadores). |
| `src/shared/sim/server/pistons.ts` | Pistones: extender, recoger, tirar, bloques en movimiento, empujar entidades. |
| `src/shared/sim/server/hoppers.ts`, `inventories.ts` | Tolvas y lo que meten y sacan de cada cosa (reglas por cara). |
| `src/shared/sim/server/dispensers.ts` | Dispensadores y soltadores. |
| `src/shared/sim/server/tnt.ts` | Dinamita y explosiones (también las de los creepers). |
| `src/shared/sim/server/mechanismCarts.ts` | Vagonetas con tolva y con dinamita (`CART_BEHAVIORS`). |
| `src/client/game/mechanismsClient.ts` | Bloques que se deslizan, empuje del jugador, dinamita que parpadea, efectos. |

## Cómo funcionan

- **Pistones.** Miran la potencia al recibir un aviso (por cualquier lado menos por delante, o la del
  bloque de encima: cuasi-conectividad, con su «BUD»); la cabeza pasa a la base los avisos que recibe. No
  se mueven en el acto: apuntan un evento de bloque (0 extender, 1 recoger, 2 recoger al instante) que se
  atiende en su fase del tick, y ahí vuelven a mirar la potencia. Lo que mueven pasa a ser un bloque en
  movimiento (`moving_piston`: invisible, no choca) con su entidad de bloque, que avanza 0 → 0,5 → 1 en la
  fase de entidades de bloque y se asienta al tercer tick (avisando a sus vecinos y a sí mismo); el
  cliente lo dibuja deslizándose (`fx 'pmove'`). Al recogerse, también la base es un bloque en movimiento
  hasta que entra la cabeza (`PMOVE_STILL`). Si se apaga mientras la cabeza aún sale (progreso < 0,5, en
  el mismo tick o durante los ticks programados), recoge al instante: lo empujado se queda donde iba y el
  adhesivo lo «escupe» (con un pulso de 1 o 2 ticks, como en Java). Las celdas que se vacían se avisan en
  el orden de un `HashMap<BlockPos>` de Java.
- **Guardar a medio movimiento.** El chunk se guarda con lo que quedará al asentarse (`WorldSim.savedInstead`,
  sin tocar el mundo) y un chunk que se descarga asienta antes lo que se mueve en él
  (`WorldSim.onChunkUnload`): no se pierde nada.
- **Observador.** La actualización de forma que le llega por su cara (cualquier cambio de estado del
  bloque que vigila, también uno que empieza o termina de moverse) programa un tick a los 2; se enciende
  2 ticks sin avisar y avisa al bloque de detrás y a los vecinos de ese.
- **Tolvas.** Entidades de bloque, como en Java: cada tick, en el orden en que se cargaron o se pusieron,
  bajan su espera y, sin espera y sin potencia, pasan un objeto y cogen otro; si movieron algo, esperan 8
  ticks (su `cooldownTime`). La que recibe de otra estando vacía espera 8, o 7 si ya le tocó en ese tick:
  una fila de tolvas mueve 2,5 objetos por segundo. La potencia las bloquea (cambia sin avisar).
- **Dispensadores y soltadores.** Con un pulso (también por el bloque de encima) disparan a los 4 ticks;
  el estado `triggered` cambia sin avisar. Como en Java, uno puesto donde ya hay potencia no dispara hasta
  que le llega un aviso de un vecino (en Bedrock sí dispararía).
- **Vagoneta con dinamita.** Rota corriendo (0,1 bloques por tick o más) no se suelta: se enciende con
  una mecha corta (0 a 38 ticks) y explota. Quieta, se suelta (aunque tenga la mecha encendida).
- **Explosiones.** 1352 rayos como en Minecraft; hieren según la distancia y la parte de la entidad que
  se ve desde el centro; los bloques rotos sueltan su objeto con probabilidad 1/potencia.

## Simplificaciones

- Un chunk guardado o descargado a medio movimiento se queda con el movimiento ya terminado (Minecraft
  guarda el avance y lo termina al cargar): el resultado es el mismo, pero un pistón guardado así no mira
  otra vez la potencia al cargar.

