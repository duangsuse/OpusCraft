> 简体中文版，原文见 [docs/redstone.md](../redstone.md)。

# 红石（第 7 阶段）

VoxelCraft 的红石如何运作，以及如何在不改动引擎的情况下接入新方块（活塞、侦测器、漏斗、发射器……）。

## 各部分的位置

| 文件 | 内容 |
| --- | --- |
| `src/shared/redstone/api.ts` | 面、引擎提供的 `RedstoneApi` 以及注册表（`registerRedstone`、`setConductor`）。 |
| `src/shared/redstone/signals.ts` | 纯函数式信号查询（强信号、弱信号、从某一面到达的信号）。 |
| `src/shared/redstone/wire.ts` | 红石粉，像 Java 一样逐线传播（以及 Java 的 `HashSet`/`HashMap<BlockPos>` 顺序）。 |
| `src/shared/redstone/components.ts` | 每个组件的行为（火把、中继器、比较器、压力板……）。 |
| `src/shared/redstone/rails.ts` | 动力铁轨、激活铁轨、探测铁轨和 T 形交叉。 |
| `src/shared/redstone/use.ts` | 对组件右键，作为纯函数（客户端和服务器共用）。 |
| `src/shared/blocks/redstoneBlocks.ts` | 这些方块以及每个方块**发出**的信号。 |
| `src/shared/sim/server/redstone.ts` | 服务器引擎（`Redstone`，位于 `GameServer.sys.redstone`）。 |
| `src/client/game/redstoneClient.ts` | 客户端中的使用、效果和粒子。 |

导入 `src/shared/redstone` 会注册所有组件。

## 模型

- 信号强度为 0 到 15。每个发射源对**每个面**分别给出弱信号和强信号（类似 Minecraft 的 `getSignal` 和 `getDirectSignal`）。
- 一个**导体**方块（不透光的实心立方体，除非通过 `setConductor` 强制指定：荧石、红石块、箱子）会接收邻居的强信号，并把它传给周围所有东西。红石粉对它所指向的方块算作强信号，但该方块不会给另一个红石粉供电（Minecraft 的「弱信号」）。
- 没有任何东西遍历整个世界：一切都通过**局部通知**和**已计划的 tick** 传播，采用 Minecraft Java 的更新模型（审计：`docs/redstone-auditoria.md`）：
  - 每次方块变化，在其 `setBlock` 内：旧方块的 `removed`（onRemove）和新方块的 `placed`（onPlace）；然后，在选项 1 下，通知六个邻居（`updateNeighborsAt`，顺序为西、东、下、上、北、南；发出通知的方块是旧方块）以及比较器（如果该方块可被读取）；并且，除非使用选项 16，还会发送邻居的形状更新（`shape`，顺序为西、东、北、南、下、上）。
  - `setBlock(x, y, z, id, flags)` 沿用 Java 的选项：`UPDATE_ALL`（3，默认）、`UPDATE_CLIENTS`（2：改变但不通知邻居，如中继器、红石灯或漏斗）、`UPDATE_KNOWN_SHAPE`（16：不更新形状）和 `UPDATE_MOVE_BY_PISTON`（64）。
  - 通知的处理方式与 Java 的 `CollectingNeighborUpdater` 一样：深度优先（某通知引发的内容先处理完，再继续下一个），并有其上限（一百万个链式通知）。
  - 每个组件都通知 Java 中它该通知的对象：火把通知其六个邻居的邻居；拉杆和按钮通知自己的邻居以及所附着方块的邻居；压力板通知自己的邻居以及下方方块的邻居；中继器、比较器和侦测器只通知前方的方块以及该方块的邻居……
  - 已计划的 tick：按（tick、优先级、到达顺序）排序的堆，每个位置一个；到期的会在其阶段开始时被取出，`willTickNow` 就是 Java 的 `willTickThisTick`。
  - 方块事件（`api.blockEvent`、`event`）：活塞收到通知时不会立即移动；它们会记下一个事件，在该阶段处理。
  - tick 阶段，与 Java 相同：已计划的 tick → 流体 → 随机 tick → 方块事件 → 实体（踩踏）→ 方块实体（移动中的方块、漏斗、阳光探测器）。
- 变化像任何方块变化一样发送到客户端：每个组件的状态（点亮、红石粉强度、延迟……）都在其方块 id 中。
- 无法放进状态的内容（比较器的输出、陷阱箱的查看者、门是否已经收到信号）放在**按位置的数据**中（`getData`/`setData`），当方块换成另一个家族时会自动清除。它不会随世界保存：加载区块时，组件会重新构建它。

## 注册方块

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

其余内容都是可选的：

| 字段 | 何时调用 |
| --- | --- |
| `emitter` | 每当有人询问它输出多少信号时（必须是纯函数且开销低）。 |
| `neighbor` | neighborChanged：收到通知（会累积：多个注册会叠加监听者）。 |
| `placed` / `removed` | onPlace / onRemove：方块发生变化（在 setBlock 内、通知之前）；若是活塞移动则用 `moved`。 |
| `shape` | updateShape：某一面的邻居发生变化；返回新状态（侦测器、中继器的锁定）。 |
| `event` | triggerEvent：通过 `api.blockEvent` 记下的方块事件（活塞）。 |
| `tick` | 通过 `api.schedule` 计划的 tick 到期（如果方块仍属于同一家族）。 |
| `changed` | 方块被放置、移除或状态改变；当 `old = -1` 时，是在其区块加载时（此时只记录并计划，不改变方块）。 |
| `analog` | 比较器从它读取的值（0..15）。 |
| `stepped` | 本 tick 其格子中有实体（压力板、绊线、矿脉）。 |
| `projectile` | 被箭、三叉戟或投掷物击中（标靶）。 |
| `periodic` | 在已加载期间每 `every` tick 一次（阳光探测器）。 |
| `use` | 玩家右键；返回是否处理了。 |

注册是按**家族**（基础状态）进行的：对其所有状态都有效。

## 查询信号

在任何处理函数中，使用收到的 `api`：

```ts
api.isPowered(x, y, z);       // ¿recibe alguna potencia? (hasNeighborSignal)
api.power(x, y, z);           // la mayor que recibe de sus seis vecinos, 0..15
api.powerFrom(x, y, z, face); // la que le llega desde el vecino de esa cara (getSignal)
api.strongPower(x, y, z);     // la potencia fuerte que recibe (getDirectSignalTo)
api.analog(x, y, z);          // lo que leería un comparador del bloque; -1 si nada
```

在处理函数之外（服务器的其他系统），可以用 `gameServer.sys.redstone` 做同样的事，或在任意 `RedstoneView` 上使用 `signals.ts` 中的纯函数（`getBlock` 和 `getData`）。

## 计划 tick 与通知

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

一个红石 tick 是 2 个游戏 tick。优先级与 Minecraft 相同（数值越低越先）：
`PRIORITY_EXTREMELY_HIGH` … `PRIORITY_NORMAL`。

## 示例：侦测器（与 Java 相同）

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

## 从引擎外部接入的系统

- 容器（`containerSlots`、`viewers`）、讲台、唱片机、物品展示框通过 `Redstone.hooks` 接入（由 `GameServer` 设置）。
- 运输铁轨：`transport.rails.railPowered` 使用 `redstone.isPowered`。
- 弹射物（`projectileHit`）、闪电（`lightningTarget`、`lightning`）、被打开的箱子（`viewersChanged`）以及变化的内容（`analogChanged`）会通知引擎。
- 机械装置（活塞、侦测器、漏斗、发射器、投掷器和 TNT）从引擎外部使用此 API：见 `docs/mecanismos.md`。

## 性能

- 通知以非递归方式处理（一个栈，与 Java 相同），上限与 Java 相同（一百万个链式通知）；已计划的 tick 上限与 Minecraft 相同（65 536）。
- 红石粉像 Java 一样逐线传播：每次变化会通知七个位置的邻居，因此大型红石网络会产生大量通知（与 Java 相同）。性能测试（`tests/redstone.test.ts`）会同时驱动一个 40×40 的红石粉网格和十个时钟：每 tick 约 4.5 ms。
- 依赖 Java 顺序的部分会与真正的 Java 比对：`tools/JavaHashOrder.java` 生成 `tests/fixtures/javaHashOrder.json`（`HashSet` 和 `HashMap<BlockPos>` 的顺序），`tests/redstoneJava.test.ts` 用它进行比对。
