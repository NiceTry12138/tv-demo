# 频道服务器

Node.js 22 + TypeScript 服务。定时同步 iptv-org 全量和 CN M3U，将其转换成 Android TV App
使用的 JSON 目录。服务器只发布配置，不代理直播视频。

## 模块与原理

```text
iptv-org Git 仓库：index.m3u + countries/cn.m3u
       |
       v
CatalogSynchronizer -- Git 更新、解析、互斥
       |
       v
M3U parser -- 元数据、请求头、URL
       |
       v
buildCatalog -- 同频道多源合并、去重
       |
       v
storage -- 临时文件发布、保留上一版本
       |
       v
HTTP server -- channels/status/health/readiness
```

- `src/m3u.ts`：解析 `#EXTINF`、`#EXTVLCOPT`、`#EXTHTTP`；按 `tvg-id` 或频道名合并。
- `src/repository.ts`：首次浅克隆 iptv-org，后续执行 `git pull --ff-only`；只读取两个 M3U 文件。
- `src/synchronizer.ts`：独立解析全量和 CN。任一失败都不会覆盖该目录旧数据。
- `src/storage.ts`：全量写 `channels.json`，CN 写 `channels-cn.json`，均原子发布并保留上一版。
- `src/http-server.ts`：只读 JSON 接口，频道尚未生成时返回 HTTP 503。
- `src/index.ts`：启动 HTTP 服务、立即同步一次，之后按间隔同步；同步任务不会重叠。

第一版不探测每个视频源是否可播，输出 `status: "unknown"`。原因：服务端出口检测结果
不能代表家庭网络或电视盒子一定可访问。App 仍会按源逐个尝试。后续可增加有限并发健康检测。

## 本地运行

```powershell
npm install
npm test
npm run typecheck
npm run dev
```

需要覆盖默认配置时，将 `.env.example` 复制为 `.env` 后修改。Node 22 会在启动时读取它，
`.env` 已被 Git 忽略。

只执行一次同步：

```powershell
npm run sync
```

默认监听 `0.0.0.0:8080`，数据写入 `./data`。

## 环境变量

| 变量 | 默认值 | 作用 |
|---|---|---|
| `IPTV_REPOSITORY_URL` | `https://github.com/iptv-org/iptv.git` | iptv-org Git 仓库 |
| `IPTV_REPOSITORY_DIR` | `./data/iptv-org` | 本地仓库目录 |
| `IPTV_ALL_PLAYLIST_PATH` | `index.m3u` | 全量 M3U 路径 |
| `IPTV_CN_PLAYLIST_PATH` | `countries/cn.m3u` | CN M3U 路径 |
| `HOST` | `0.0.0.0` | 监听地址 |
| `PORT` | `8080` | 监听端口 |
| `SYNC_INTERVAL_HOURS` | `6` | 同步间隔 |
| `GIT_TIMEOUT_MS` | `120000` | Git 操作超时 |
| `DATA_DIR` | `./data` | 发布目录 |

## HTTP 接口

```text
GET /iptv/v1/channels.json             全部频道
GET /iptv/v1/channels.json?country=CN  CN 频道
GET /iptv/v1/status.json               全量同步状态
GET /iptv/v1/status.json?country=CN    CN 同步状态
GET /check                  App 设置界面的服务器身份验证
GET /healthz                进程存活检查
GET /readyz                 是否已有可提供的频道目录
```

完整响应结构、状态码和 ETag 用法见 [HTTP API](docs/API.md)。
当前接口使用 GET，便于本地调试；需要限制访问时应增加 token/API key。

## Ubuntu 22.04 部署

推荐使用 `systemd + Nginx + HTTPS`。完整命令见
[Ubuntu 22.04 部署文档](docs/UBUNTU_DEPLOY.md)。部署文件位于 `deploy/`：

- `deploy/systemd/home-tv-server.service`
- `deploy/home-tv-server.env.example`
- `deploy/nginx/home-tv-server.conf`

## Docker 部署

```bash
docker compose up -d --build
curl http://127.0.0.1:8080/healthz
curl http://127.0.0.1:8080/readyz
curl http://127.0.0.1:8080/iptv/v1/status.json
```

Compose 只绑定服务器本机 `127.0.0.1:8080`。用 Caddy 或 Nginx 反向代理并提供 HTTPS，
再把 App 的 `CHANNELS_URL` 指向：

```text
https://your-domain.example/iptv/v1/channels.json
```

Compose 使用 `home-tv-data` 命名卷保存数据。删除该卷会丢失上次成功频道目录；普通容器重建不会。
