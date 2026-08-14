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
CatalogHealthChecker -- 并发探测 HTTP/HLS，过滤失效源
       |
       v
storage -- 原始目录与健康目录分离，原子发布、保留上一版本
       |
       v
HTTP server -- channels/status/health/readiness
```

- `src/m3u.ts`：解析 `#EXTINF`、`#EXTVLCOPT`、`#EXTHTTP`；按 `tvg-id` 或频道名合并。
- `src/repository.ts`：首次浅克隆 iptv-org，后续执行 `git pull --ff-only`；只读取两个 M3U 文件。
- `src/synchronizer.ts`：独立解析全量和 CN。任一失败都不会覆盖该目录旧数据。
- `src/storage.ts`：原始目录写 `channels.json`/`channels-cn.json`，健康目录写
  `channels.healthy.json`/`channels-cn.healthy.json`，均原子发布并保留上一版。
- `src/health-checker.ts`：按配置并发检查播放源；HLS 会继续读取首个媒体播放列表/媒体字节。
- `src/http-server.ts`：频道接口只返回健康目录；健康检查尚未完成时返回 HTTP 503。
- `src/index.ts`：启动立即同步和检查；每天更新仓库，每小时检查播放源，任务不会重叠。

健康检查只代表服务器出口能读取到响应，不是视频解码器，不能完全保证家庭网络、地区策略或
Android 硬件解码一定可播。检查失败整轮不会覆盖已有健康缓存，避免短时网络故障导致目录为空。

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
| `REPOSITORY_UPDATE_INTERVAL_HOURS` | `24` | iptv-org Git 更新间隔 |
| `HEALTH_CHECK_INTERVAL_HOURS` | `1` | 播放源健康检查间隔 |
| `HEALTH_CHECK_TIMEOUT_MS` | `8000` | 单个播放源超时 |
| `HEALTH_CHECK_CONCURRENCY` | `16` | 并发检查数量 |
| `GIT_TIMEOUT_MS` | `120000` | Git 操作超时 |
| `DATA_DIR` | `./data` | 发布目录 |

## HTTP 接口

```text
GET /iptv/v1/channels.json             全部频道
GET /iptv/v1/channels.json?country=CN  CN 频道
GET /iptv/v1/status.json               全量同步状态
GET /iptv/v1/status.json?country=CN    CN 同步状态
GET /iptv/v1/health-status.json        全量健康检查状态
GET /iptv/v1/health-status.json?country=CN CN 健康检查状态
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
