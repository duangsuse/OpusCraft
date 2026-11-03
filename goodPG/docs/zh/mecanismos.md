> 简体中文版，原文见 [docs/mecanismos.md](../mecanismos.md)。

# 机械装置（第 7 阶段）

活塞、侦测器、漏斗、发射器、投掷器、TNT 以及漏斗矿车和 TNT 矿车。它们通过自己的 API 接入红石系统（见 `docs/redstone.md`）。经过红石审计（`docs/redstone-auditoria.md`），它们的行为与对应的 Java 类一致，连通知和选项也相同。

## 各部分的位置

| 文件 | 内容 |
| --- | --- |
| `src/shared/blocks/mechanismBlocks.ts` | 这些方块（6 个朝向、活塞和漏斗的模型）以及侦测器发出的信号。 |
| `src/shared/pistons.ts` | 活塞能推动什么（Minecraft 的 `PistonStructureResolver`），纯函数。 |
| `src/shared/explosions.ts` | 方块的爆炸抗性以及爆炸射线，纯函数。 |
| `src/shared/mechanismPlacement.ts` | 放置时如何定向（根据视线倾斜角度）。 |
| `src/shared/mechanisms.ts` | 点燃的 TNT（实体类型 180、引信、威力）。 |
| `src/shared/sim/server/mechanisms.ts` | `GameServer` 创建的东西（以及侦测器）。 |
| `src/shared/sim/server/pistons.ts` | 活塞：伸出、收回、拉回、移动中的方块、推动实体。 |
| `src/shared/sim/server/hoppers.ts`、`inventories.ts` | 漏斗以及它们对每种东西的放入和取出（按面的规则）。 |
| `src/shared/sim/server/dispensers.ts` | 发射器和投掷器。 |
| `src/shared/sim/server/tnt.ts` | TNT 与爆炸（也包括苦力怕的爆炸）。 |
| `src/shared/sim/server/mechanismCarts.ts` | 漏斗矿车和 TNT 矿车（`CART_BEHAVIORS`）。 |
| `src/client/game/mechanismsClient.ts` | 滑动的方块、推动玩家、闪烁的 TNT、效果。 |

## 工作原理

- **活塞。** 收到通知时会检查信号强度（除前方以外的任意一侧，或上方方块的信号：准连接性，即所谓的「BUD」）；活塞头会把收到的通知转给活塞基座。它们不会立刻移动：而是记下一个方块事件（0 伸出、1 收回、2 立即收回），在该 tick 的对应阶段处理，此时再重新检查信号。被推动的东西会变成移动中的方块（`moving_piston`：不可见、无碰撞），并带有自己的方块实体，在方块实体阶段依次前进 0 → 0.5 → 1，在第三个 tick 落定（通知其邻居以及自身）；客户端把它绘制成滑动效果（`fx 'pmove'`）。收回时，基座也会是移动中的方块，直到活塞头归位（`PMOVE_STILL`）。如果活塞头还在伸出途中（进度 < 0.5，同一 tick 内或已计划的 tick 期间）时断电，就会立即收回：被推动的东西停在原定位置，而粘性活塞把它「吐」出来（产生 1 或 2 tick 的脉冲，与 Java 相同）。被清空的格子会按照 Java 中 `HashMap<BlockPos>` 的顺序发出通知。
- **半途移动时保存。** 区块按落定后的状态保存（`WorldSim.savedInstead`，不会改动世界）；卸载的区块会先让其中移动的东西落定（`WorldSim.onChunkUnload`）：不会丢失任何东西。
- **侦测器。** 从其正面收到的形状更新（被监视方块的任何状态变化，包括开始或结束移动）会安排一个 2 tick 后的 tick；它点亮 2 tick 且不发通知，并通知其后面的方块以及该方块的邻居。
- **漏斗。** 它们是方块实体，与 Java 相同：每个 tick 按加载或放置的顺序递减等待时间；无等待且无信号时，传递一个物品并取出另一个；若移动了东西，则等待 8 tick（其 `cooldownTime`）。空漏斗从另一个漏斗接收物品时等待 8 tick；如果本 tick 已经轮到过它则为 7 tick：一排漏斗每秒移动 2.5 个物品。红石信号会锁住它们（变化时不发通知）。
- **发射器与投掷器。** 收到脉冲（上方方块亦可）后会在 4 tick 时触发；`triggered` 状态改变时不发通知。与 Java 一样，放在已有信号的位置上的发射器不会触发，直到收到邻居的通知（在基岩版中则会触发）。
- **TNT 矿车。** 行驶中被破坏（速度 0.1 格/tick 或更快）不会掉落：会以短引信（0 到 38 tick）点燃并爆炸。静止时被破坏则会掉落（即使引信已点燃）。
- **爆炸。** 与 Minecraft 一样有 1352 条射线；伤害取决于距离以及从爆炸中心能看到的实体部位；被破坏的方块以 1/威力 的概率掉落物品。

## 简化之处

- 区块在半途移动时被保存或卸载，其中的移动会直接以完成状态保存（Minecraft 会保存进度并在加载时完成）：结果相同，但这样保存的活塞在加载时不会重新检查信号。
