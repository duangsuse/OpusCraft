> 简体中文版，原文见 [docs/despliegue-vps.md](../despliegue-vps.md)。

# 在 VPS 上用 open-compute 部署 VoxelCraft

本指南说明如何在自有 VPS 上使用 [open-compute](https://open-compute.dev) 运行完整的 VoxelCraft（网页、多人服务器和已保存的世界），而不使用 Cloudflare。

**open-compute 是什么。** 它是一个兼容 Cloudflare Workers 的开源平台，可安装在一台机器上（单个二进制文件 `ocd`）。VoxelCraft 用到以下 Workers 组件，open-compute 均声明支持：

| VoxelCraft 使用的功能 | 位置 | 在 open-compute 中 |
| --- | --- | --- |
| 带静态文件的 Worker（网页） | `wrangler.jsonc` 中的 `assets` | 静态资源（支持 `single-page-application` 和 `run_worker_first`） |
| 带 SQLite 的 Durable Objects（每个世界和目录） | `GameWorld`、`WorldDirectory` | Durable Objects：KV 与 SQL 存储 |
| 支持休眠的 WebSocket（多人） | `ctx.acceptWebSocket`、`setWebSocketAutoResponse` | WebSocket 休眠：支持 |
| 定时器（空置 48 小时后删除世界） | `setAlarm`、`alarm()` | 定时器：支持 |
| 对象间的 RPC 调用（首页计数器） | `getByName(...).stats()` | stub fetch / RPC 与 `getByName`：支持 |

> **注意。** open-compute 自称处于早期阶段，且为单节点：所有内容（网页、世界及其数据）都运行在一台机器上，没有 Cloudflare 的地理分布。本项目的 open-compute 配置（`wrangler.vps.jsonc`）已通过 Wrangler 验证，但 **VPS 上的步骤尚未在真实机器上测试过**：如果某些内容与你的 open-compute 版本不符，请查阅其文档（[docs](https://open-compute.dev/docs/)）。

---

## 1. 你需要什么

- **一台 Linux VPS**（Ubuntu 24.04 或 Debian 12，x86_64 或 arm64）。推荐：**2 vCPU 和 4 GB 内存**，可同时运行几个世界。每个有玩家连接的世界都会以每秒 20 tick 运行游戏服务器，并在探索时生成地形（每区块约 12 ms）。
- **一个可以编辑 DNS 的域名**。游戏将位于子域名下，例如 `https://voxelcraft.juegos.tudominio.com`（open-compute 的 Gateway 会把每个 Worker 发布为 `<名称>.<base_domain>`；它不接受直接用根域名）。
- **VPS（及服务商）防火墙中开放的端口**：**443/tcp**（网页和 WebSocket）、**53/tcp 和 53/udp**（Gateway 获取 HTTPS 证书所用的 DNS 挑战）以及用于 SSH 的 22/tcp。不需要 80 端口。
- VPS 上安装 **Node.js 22 或更高版本** 和 **git**，用于编译游戏。

## 2. 准备 VPS

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl ca-certificates

# Node.js 22 (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # v22.x o superior
```

## 3. 安装 open-compute

系统安装（随机器启动的服务）：

```bash
curl -fsSL https://open-compute.dev/install.sh | sudo sh
sudo ocd setup --system --yes
ocd status
```

`ocd setup` 会创建守护进程和第一个实例（`default`）。在系统安装中，实例配置位于 `/var/lib/open-compute/instances/default/compute.toml`。

## 4. 下载并编译 VoxelCraft

```bash
git clone https://github.com/EijunnN/minecraft-clone.git voxelcraft
cd voxelcraft
npm ci
```

open-compute 推荐使用经过其测试的 Wrangler 版本。如果部署时提示版本问题：

```bash
npm install --save-dev wrangler@4.138.0
```

## 5. 首次部署（暂时没有域名）

```bash
npm run deploy:vps
```

这会做两件事：

1. `npm run build:vps`：用 `wrangler.vps.jsonc` 编译网页和服务器（open-compute 的配置：没有 open-compute 不支持的 `workers_dev` 和路由，并且 Durable Objects 迁移对新安装是干净的）。
2. `ocd wrangler deploy`：把 Worker、静态文件和 Durable Objects 上传到 open-compute。

没有 Gateway 时，open-compute 会把每个 Worker 以机器的本地地址提供服务：
`http://voxelcraft.<id-de-cuenta>.localhost:8787/`（`ocd status` 和 `ocd dashboard` 会显示实例）。可以从 VPS 本身检查它是否响应：

```bash
curl -s http://voxelcraft.<id-de-cuenta>.localhost:8787/api/health    # {"ok":true}
curl -s http://voxelcraft.<id-de-cuenta>.localhost:8787/api/stats     # {"servers":0,"players":0}
```

想在看游戏时查看服务器日志：`ocd wrangler tail`。

## 6. 用你的域名和 HTTPS 发布（Gateway）

open-compute 的 Gateway 是一个内置的 Caddy，它会用自动证书把 Workers 发布到 HTTPS。

### 6.1. 选择基础域名

如果你选择 `juegos.tudominio.com` 作为基础域名，游戏将位于 `https://voxelcraft.juegos.tudominio.com`。
在实例的 `compute.toml` 中：

```toml
[public_gateway]
base_domain = "juegos.tudominio.com"
```

在守护进程的 `ocd.toml` 中（共享监听器；填入 VPS 的公网 IP）：

```toml
[gateway]
ingress_ipv4 = ["203.0.113.10"]
https_listen = "0.0.0.0:8443"
challenge_dns_listen = "0.0.0.0:8053"
```

### 6.2. 防火墙与端口

根据上面的配置，Gateway 监听 8443（HTTPS）和 8053（挑战 DNS）；从外部通过 443 和 53 访问。一种重定向方式（使用 `ufw` 的 Ubuntu）：

```bash
sudo ufw allow 22/tcp
sudo ufw allow 443/tcp
sudo ufw allow 53/tcp
sudo ufw allow 53/udp
sudo ufw allow 8443/tcp
sudo ufw allow 8053
sudo ufw enable

# 443 → 8443 y 53 → 8053
sudo iptables -t nat -A PREROUTING -p tcp --dport 443 -j REDIRECT --to-ports 8443
sudo iptables -t nat -A PREROUTING -p tcp --dport 53 -j REDIRECT --to-ports 8053
sudo iptables -t nat -A PREROUTING -p udp --dport 53 -j REDIRECT --to-ports 8053
sudo apt install -y iptables-persistent   # guarda las reglas para los reinicios
```

（使用 8443/8053 而不是直接用 443/53，是因为在 Ubuntu 上 53 端口通常被 `systemd-resolved` 占用。）

### 6.3. DNS

open-compute 会计算需要哪些记录：

```bash
ocd --instance default config gateway-dns-plan
```

在你的 DNS 服务商处创建它指示的内容。通常是：指向 VPS IP 的 **A/AAAA** 记录、一个**通配符 CNAME**（`*.juegos.tudominio.com`）、ACME 挑战的 **NS 委派**，以及如果你的域名使用它们的话，**CAA** 记录。

### 6.4. 检查并启用

```bash
ocd --instance default config gateway-challenge-probe
ocd --instance default config gateway-dns-verify
ocd caddy validate
ocd caddy reload
ocd caddy status
ocd --instance default config gateway-tls-probe
```

除 `ocd caddy reload` 外，全部为只读操作；该命令会一次性应用整个配置（如果出错，则保留之前的配置）。

### 6.5. 根域名

Gateway 不会发布到根域名（`tudominio.com`）。如果你希望人们从那里进入，请在服务商处把 `tudominio.com` 重定向到 `https://voxelcraft.juegos.tudominio.com`。

## 7. 检查一切正常

1. 打开 `https://voxelcraft.juegos.tudominio.com`：应显示带有服务器数和在线人数计数器的首页。
2. 用两个浏览器（或和朋友）进入一个世界，确认能互相看见：这证明 **WebSocket** 通过了 Gateway。如果游戏停留在「正在连接服务器……」并最终进入单人模式，说明 WebSocket 没有到达（见「常见问题」）。
3. `curl -s https://voxelcraft.juegos.tudominio.com/api/stats` 应返回相应数字。

## 8. 更新到新版本

世界存储在 Durable Objects 的存储中，因此更新不会删除它们：

```bash
cd voxelcraft
git pull
npm ci
npm run deploy:vps
```

（最好在没人游戏时进行：`curl -s .../api/stats` 会显示当前在线人数。）

## 9. 备份

open-compute 的备份需要**停止实例**（守护进程或实例；参见 `ocd --help`）：

```bash
# con la instancia parada:
ocd --instance default backup create --name voxelcraft-$(date +%F) --json
ocd --instance default backup inspect --snapshot <UUID> --verify --json

# quedarse con las 7 últimas:
ocd --instance default backup retention-plan --keep-last 7 --json
```

请记住，游戏会**删除连续 48 小时无人进入的世界**（与 Cloudflare 相同）。

## 10. 常见问题

- **部署时提示「routes / workers_dev no permitido」。** 你在用 Cloudflare 的配置部署。请使用 `npm run deploy:vps`（它会用 `wrangler.vps.jsonc` 编译）。
- **Wrangler 版本不对。** 执行 `npm install --save-dev wrangler@4.138.0` 然后重新部署。
- **游戏无法连接（停留在单人模式）。** WebSocket 没有到达 Worker：用 `ocd caddy status` 检查 Gateway 路由是否启用，以及 443 是否到达 8443。从你的电脑快速测试：在浏览器控制台中执行
  `new WebSocket('wss://voxelcraft.juegos.tudominio.com/api/room/prueba/ws').onopen = () => console.log('ok')`。
- **53 端口已被占用。** 那是 `systemd-resolved`：使用上面的 53 → 8053 重定向，而不是监听 53。
- **人多时很慢。** 一切都运行在一台机器上：升级 VPS 的 CPU。每个活跃世界都是一个以每秒 20 tick 模拟的 Durable Object。
- **不想等 48 小时就测试世界删除。** 仅限测试：变量 `IDLE_DELETE_MS`（以毫秒为单位）会缩短期限。不要在生产环境中设置它。

## 参考

- open-compute：[入门](https://open-compute.dev/docs/get-started/)、[运维](https://open-compute.dev/docs/operate/)、
  [Durable Objects](https://open-compute.dev/docs/durable-objects/)、[Gateway](https://open-compute.dev/docs/gateway/)、
  [DNS 与 TLS](https://open-compute.dev/docs/gateway/dns-tls/)、[备份](https://open-compute.dev/docs/ocd/backup/)、
  [仓库](https://github.com/elliothux/open-compute)。
- 本项目：`wrangler.vps.jsonc`（open-compute 配置）、`npm run build:vps` 和
  `npm run deploy:vps`（`package.json`），以及 `vite.config.ts`（读取 `WRANGLER_CONFIG` 变量）。
