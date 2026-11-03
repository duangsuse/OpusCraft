# Desplegar VoxelCraft en un VPS con open-compute

Esta guía explica cómo levantar VoxelCraft entero (la web, el servidor multijugador y los mundos guardados) en
un VPS propio con [open-compute](https://open-compute.dev), en lugar de en Cloudflare.

**Qué es open-compute.** Es una plataforma de código abierto compatible con Cloudflare Workers que se instala en
una sola máquina (un único binario, `ocd`). VoxelCraft usa estas piezas de Workers, y open-compute las da como
soportadas:

| Lo que usa VoxelCraft | Dónde | En open-compute |
| --- | --- | --- |
| Worker con archivos estáticos (la web) | `assets` en `wrangler.jsonc` | Static Assets (con `single-page-application` y `run_worker_first`) |
| Durable Objects con SQLite (cada mundo y el directorio) | `GameWorld`, `WorldDirectory` | Durable Objects: almacenamiento KV y SQL |
| WebSockets con hibernación (el multijugador) | `ctx.acceptWebSocket`, `setWebSocketAutoResponse` | WebSocket Hibernation: soportado |
| Alarmas (borrado de mundos tras 48 h vacíos) | `setAlarm`, `alarm()` | Alarmas: soportadas |
| Llamadas RPC entre objetos (contador de la portada) | `getByName(...).stats()` | stub fetch / RPC y `getByName`: soportados |

> **Aviso.** open-compute se declara a sí mismo en fase temprana, y un solo nodo: todo (la web, los mundos, sus
> datos) vive en una máquina, sin la distribución geográfica de Cloudflare. La configuración de este proyecto
> para open-compute (`wrangler.vps.jsonc`) está validada con Wrangler, pero **los pasos del VPS no se han probado
> todavía en una máquina real**: si algo no cuadra con tu versión de open-compute, manda su documentación
> ([docs](https://open-compute.dev/docs/)).

---

## 1. Qué necesitas

- **Un VPS con Linux** (Ubuntu 24.04 o Debian 12, x86_64 o arm64). Recomendado: **2 vCPU y 4 GB de RAM** para
  unos cuantos mundos a la vez. Cada mundo con gente conectada ejecuta el servidor de juego a 20 ticks por segundo
  y genera el terreno según se explora (unos 12 ms por chunk).
- **Un dominio** cuyo DNS puedas editar. El juego quedará en un subdominio, por ejemplo
  `https://voxelcraft.juegos.tudominio.com` (el Gateway de open-compute publica cada Worker como
  `<nombre>.<base_domain>`; no admite el dominio raíz directamente).
- **Puertos abiertos** en el cortafuegos del VPS (y del proveedor): **443/tcp** (la web y los WebSockets), **53/tcp
  y 53/udp** (el reto DNS con el que el Gateway obtiene el certificado HTTPS) y 22/tcp para SSH. El 80 no hace
  falta.
- **Node.js 22 o superior** y **git** en el VPS, para compilar el juego.

## 2. Preparar el VPS

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl ca-certificates

# Node.js 22 (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # v22.x o superior
```

## 3. Instalar open-compute

Instalación de sistema (arranca como servicio con la máquina):

```bash
curl -fsSL https://open-compute.dev/install.sh | sudo sh
sudo ocd setup --system --yes
ocd status
```

`ocd setup` crea el demonio y la primera instancia (`default`). En una instalación de sistema, la configuración
de la instancia está en `/var/lib/open-compute/instances/default/compute.toml`.

## 4. Descargar y compilar VoxelCraft

```bash
git clone https://github.com/EijunnN/minecraft-clone.git voxelcraft
cd voxelcraft
npm ci
```

open-compute recomienda la versión de Wrangler con la que está probado. Si al desplegar se queja de la versión:

```bash
npm install --save-dev wrangler@4.138.0
```

## 5. Primer despliegue (sin dominio todavía)

```bash
npm run deploy:vps
```

Esto hace dos cosas:

1. `npm run build:vps`: compila la web y el servidor con `wrangler.vps.jsonc` (la configuración para
   open-compute: sin `workers_dev` ni rutas, que open-compute no admite, y con las migraciones de los Durable
   Objects limpias para una instalación nueva).
2. `ocd wrangler deploy`: sube el Worker, los archivos estáticos y los Durable Objects a open-compute.

Sin Gateway, open-compute sirve cada Worker en una dirección local de la máquina:
`http://voxelcraft.<id-de-cuenta>.localhost:8787/` (`ocd status` y `ocd dashboard` muestran la instancia). Desde el
propio VPS se puede comprobar que responde:

```bash
curl -s http://voxelcraft.<id-de-cuenta>.localhost:8787/api/health    # {"ok":true}
curl -s http://voxelcraft.<id-de-cuenta>.localhost:8787/api/stats     # {"servers":0,"players":0}
```

Para ver los registros del servidor mientras se juega: `ocd wrangler tail`.

## 6. Publicarlo con tu dominio y HTTPS (Gateway)

El Gateway de open-compute es un Caddy integrado que publica los Workers en HTTPS con certificados automáticos.

### 6.1. Elegir el dominio base

Si eliges `juegos.tudominio.com` como dominio base, el juego queda en `https://voxelcraft.juegos.tudominio.com`.
En el `compute.toml` de la instancia:

```toml
[public_gateway]
base_domain = "juegos.tudominio.com"
```

Y en el `ocd.toml` del demonio (los listeners compartidos; pon la IP pública del VPS):

```toml
[gateway]
ingress_ipv4 = ["203.0.113.10"]
https_listen = "0.0.0.0:8443"
challenge_dns_listen = "0.0.0.0:8053"
```

### 6.2. Cortafuegos y puertos

El Gateway escucha en 8443 (HTTPS) y 8053 (DNS del reto) según la configuración de arriba; desde fuera se entra
por 443 y 53. Una forma de redirigirlos (Ubuntu con `ufw`):

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

(Se usan 8443/8053 y no 443/53 directamente porque en Ubuntu el puerto 53 lo suele ocupar `systemd-resolved`.)

### 6.3. DNS

open-compute calcula qué registros hacen falta:

```bash
ocd --instance default config gateway-dns-plan
```

Crea en tu proveedor de DNS lo que indique. Normalmente: registros **A/AAAA** hacia la IP del VPS, un **CNAME
comodín** (`*.juegos.tudominio.com`), la **delegación NS** del reto ACME y, si tu dominio los usa, registros **CAA**.

### 6.4. Comprobar y activar

```bash
ocd --instance default config gateway-challenge-probe
ocd --instance default config gateway-dns-verify
ocd caddy validate
ocd caddy reload
ocd caddy status
ocd --instance default config gateway-tls-probe
```

Todas son de sólo lectura menos `ocd caddy reload`, que aplica la configuración entera de una vez (si algo falla,
se queda la anterior).

### 6.5. El dominio raíz

El Gateway no publica en el dominio raíz (`tudominio.com`). Si quieres que la gente entre por ahí, pon en tu
proveedor una redirección de `tudominio.com` a `https://voxelcraft.juegos.tudominio.com`.

## 7. Comprobar que todo funciona

1. Abre `https://voxelcraft.juegos.tudominio.com`: debe salir la portada con el contador de servidores y
   conectados.
2. Entra en un mundo con dos navegadores (o con un amigo) y comprueba que os veis: eso confirma que los
   **WebSockets** pasan por el Gateway. Si el juego se queda en «Conectando con el servidor…» y acaba entrando en
   modo un jugador, los WebSockets no están llegando (ver «Problemas frecuentes»).
3. `curl -s https://voxelcraft.juegos.tudominio.com/api/stats` debe responder con los números.

## 8. Actualizar a una versión nueva

Los mundos viven en el almacenamiento de los Durable Objects, así que actualizar no los borra:

```bash
cd voxelcraft
git pull
npm ci
npm run deploy:vps
```

(Conviene hacerlo cuando no haya nadie jugando: `curl -s .../api/stats` dice cuántos conectados hay.)

## 9. Copias de seguridad

Las copias de open-compute se hacen **con la instancia parada** (el demonio o la instancia; mira `ocd --help`):

```bash
# con la instancia parada:
ocd --instance default backup create --name voxelcraft-$(date +%F) --json
ocd --instance default backup inspect --snapshot <UUID> --verify --json

# quedarse con las 7 últimas:
ocd --instance default backup retention-plan --keep-last 7 --json
```

Recuerda que el juego **borra los mundos que pasan 48 horas sin nadie** (igual que en Cloudflare).

## 10. Problemas frecuentes

- **«routes / workers_dev no permitido» al desplegar.** Estás desplegando con la configuración de Cloudflare.
  Usa `npm run deploy:vps` (que compila con `wrangler.vps.jsonc`).
- **Wrangler de otra versión.** `npm install --save-dev wrangler@4.138.0` y vuelve a desplegar.
- **El juego no conecta (se queda en un jugador).** Los WebSockets no llegan al Worker: comprueba con
  `ocd caddy status` que la ruta del Gateway está activa y que 443 llega al 8443. Una prueba rápida desde tu
  ordenador: en la consola del navegador,
  `new WebSocket('wss://voxelcraft.juegos.tudominio.com/api/room/prueba/ws').onopen = () => console.log('ok')`.
- **El puerto 53 ya está en uso.** Es `systemd-resolved`: usa la redirección 53 → 8053 de arriba en lugar de
  escuchar en el 53.
- **Va lento con mucha gente.** Todo corre en una máquina: sube la CPU del VPS. Cada mundo activo es un Durable
  Object que simula a 20 ticks por segundo.
- **Probar el borrado de mundos sin esperar 48 horas.** Sólo en pruebas: la variable `IDLE_DELETE_MS` (en
  milisegundos) acorta el plazo. No la pongas en producción.

## Referencias

- open-compute: [inicio](https://open-compute.dev/docs/get-started/), [operación](https://open-compute.dev/docs/operate/),
  [Durable Objects](https://open-compute.dev/docs/durable-objects/), [Gateway](https://open-compute.dev/docs/gateway/),
  [DNS y TLS](https://open-compute.dev/docs/gateway/dns-tls/), [copias](https://open-compute.dev/docs/ocd/backup/),
  [repositorio](https://github.com/elliothux/open-compute).
- En este proyecto: `wrangler.vps.jsonc` (configuración para open-compute), `npm run build:vps` y
  `npm run deploy:vps` (`package.json`), y `vite.config.ts` (lee la variable `WRANGLER_CONFIG`).
