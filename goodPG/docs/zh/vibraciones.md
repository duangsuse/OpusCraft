> 简体中文版，原文见 [docs/vibraciones.md](../vibraciones.md)。

# 振动与幽匿（第 7.5 阶段）

深暗之域的振动（Minecraft 的「游戏事件」）如何运作，以及另一个系统如何使用它们。

## 各部分的位置

| 文件 | 内容 |
| --- | --- |
| `src/shared/vibrations.ts` | 每种事件的频率（Minecraft 1.20+ 的表格）、范围、幽匿感测体 tick、会遮挡和闷住振动的羊毛、按距离计算的信号强度。纯函数。 |
| `src/shared/blocks/deepDarkBlocks.ts` | 幽匿、幽匿脉络、幽匿催发体、幽匿感测体（阶段、水）和幽匿尖啸体；幽匿感测体向红石发出的信号。 |
| `src/shared/sculkSpread.ts` | 幽匿催发体如何蔓延幽匿（Minecraft 的 `SculkSpreader`），纯函数。 |
| `src/shared/sim/server/vibrations.ts` | 系统（`Vibrations`，位于 `gameServer.sys.deepDark.vibrations`）。 |
| `src/shared/sim/server/sculk.ts` | 催发体、游离的幽匿脉络、尖啸体、监守者的通知及其召唤。 |
| `src/shared/sim/server/deepDark.ts` | `GameServer` 创建的东西以及向它发出通知的东西（还有最后一次死亡，用于追溯指南针）。 |
| `src/shared/sim/entities/warden.ts` | 监守者，它像普通监听者一样听振动。 |

## 发出振动

```ts
gs.sys.deepDark.vibrations.emit('block_activate', x + 0.5, y + 0.5, z + 0.5, { who: s.id });
```

- `who`：引发振动的玩家（会话 id）或实体（id）；`owner`：投掷弹射物或丢出物品的人；`sneaking`：潜行（脚步声、落地、发射和进食都不会产生振动）；`block`：放置或破坏的方块（羊毛不产生振动）。
- 如果没有登记任何监听者，`emit` 会立即返回：可以放心调用。
- 已自动发出：玩家的脚步、游泳划水、落地、进食、弓箭射击和打开箱子；监听者附近实体的脚步、落地、溅水声和落地的弹射物；放置、破坏和改变方块（玩家）；打开和关闭门、活板门和栅栏门、拉杆、按钮、压力板、绊线钩和活塞（无论谁操作）；以及 `explode`、`mob_death`、`mob_hurt`、`teleport`、`note`、`bell`、`mob_shoot`、`crossbow_shoot`、`creeper_fuse`、`tnt_primed`、`shear`、`witch_drink`、`milk`、`throw` 等效果和闪电。

## 收听振动

- 方块：幽匿感测体（8 格）、校准幽匿感测体（16 格）和幽匿尖啸体（8 格，仅限玩家激活的幽匿感测体发出的尖啸）在放置或加载时按区块自动登记。
- 实体：`vibrations.listen({ entity, range, eye, accepts(ev, src), receive(ev, x, y, z, src, d) })`。它们会在死亡或消失时自动注销。
- 每个监听者只保留本 tick 最近的一次振动；下一 tick 它开始传播（每 tick 一格，带有 `vibration` 粒子），到达后执行动作。传播途中不会处理其他振动。

## 幽匿感测体

- 对所有方向输出强度 `max(1, 15 − ⌊15·d/范围⌋)`（向下为强信号；校准幽匿感测体则不会向自己的输入面输出），持续 30 tick（校准幽匿感测体为 10 tick），之后再用 10 tick 冷却。强度与频率存储在引擎的按位置数据中（`sculkSignal`），因此不会被保存：加载区块时，激活的幽匿感测体会回到静止状态。
- 比较器在激活期间读取最近一次振动的频率。
- 校准幽匿感测体只响应从其输入面收到的频率（如果收到的话）。
- 激活时，它们会让旁边的紫水晶按其频率产生共振（一次 `resonate` 振动）。

## 性能

- 方块监听者按区块组织；一次事件最多检查 9 个区块。实体只在某个监听者附近才会被跟踪。`tests/deepDark.test.ts` 的测试让 40 个生物在 300 个幽匿感测体之间移动。
