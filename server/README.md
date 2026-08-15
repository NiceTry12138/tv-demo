# 频道服务器

Node.js 22 + TypeScript 服务。频道目录由管理员通过 Web 或脚本上传；服务器不访问 GitHub 或
其他目录来源。上传后立即检查播放源，之后每小时复查，只向 Android TV 返回健康源。

## 模块与原理

```text
本地收集脚本 / 管理员 JSON
       |
       v
Basic Auth -- 仅管理员可上传
       |
       v
CatalogImporter -- 校验、按 URL 去重、按地区拆分
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

- `tools/collect_and_upload.py`：本机抓取五类来源，解析、去重、并发实播检查，仅上传健康源。
- `src/catalog-importer.ts`：严格校验上传 JSON，生成全量和 CN 原始目录。
- `src/admin-page.ts`：浏览器上传页面。
- `src/storage.ts`：原始目录写 `channels.json`/`channels-cn.json`，健康目录写
  `channels.healthy.json`/`channels-cn.healthy.json`，均原子发布并保留上一版。
- `src/health-checker.ts`：按配置并发检查播放源；HLS 会继续读取首个媒体播放列表/媒体字节。
- `src/http-server.ts`：提供管理页面、上传接口和 Android TV 频道接口。
- `src/index.ts`：上传后立即检查；每小时复查，检查任务不会重叠。

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

只执行一次健康检查：

```powershell
npm run check
```

默认监听 `0.0.0.0:8080`，数据写入 `./data`。

## 环境变量

| 变量 | 默认值 | 作用 |
|---|---|---|
| `HOST` | `0.0.0.0` | 监听地址 |
| `PORT` | `8080` | 监听端口 |
| `HEALTH_CHECK_INTERVAL_HOURS` | `1` | 播放源健康检查间隔 |
| `HEALTH_CHECK_TIMEOUT_MS` | `8000` | 单个播放源超时 |
| `HEALTH_CHECK_CONCURRENCY` | `16` | 并发检查数量 |
| `ADMIN_USERNAME` | `cong01` | 管理页面和上传接口用户名 |
| `ADMIN_PASSWORD` | 空 | 管理密码；为空时禁用上传 |
| `MAX_UPLOAD_BYTES` | `26214400` | 最大上传 JSON 字节数 |
| `DATA_DIR` | `./data` | 发布目录 |

`ADMIN_PASSWORD` 必须仅在服务器环境中设置，不要提交到 Git。管理接口强制 HTTPS 或服务器
本机连接；只有公网 IP 时使用 SSH 隧道。

## 收集并上传

Python 3.10+，无第三方依赖。默认来源：iptv-org、fanmingming/live、YueChan/Live、
live.zbds.top、tv.iill.top/m3u/Gather。

```powershell
$env:TV_ADMIN_PASSWORD="你的管理密码"
python tools/collect_and_upload.py `
  --server https://你的服务器 `
  --username cong01
```

脚本先按 URL 去重，再用 GET 并发检查播放源；默认单源超时 8 秒、16 并发。只有检查通过的源
会写入 `collected-channels.json` 并上传。零个源通过时不覆盖文件、不上传。某个目录来源失败
不会影响其他来源。可调整检查参数：

```powershell
python tools/collect_and_upload.py --check-timeout 12 --check-workers 24
```

自定义来源：

```powershell
python tools/collect_and_upload.py --source "https://example.com/live.m3u|CN"
```

也可以打开 `https://你的服务器/admin`，输入 Basic Auth 用户名密码，选择或粘贴脚本生成的
JSON，然后点击“上传并检查”。上传成功后旧健康缓存继续服务，直到新检查完成。

本机、服务器、电视网络出口可能不同。本机通过不代表服务器或电视一定可播，因此服务器收到
目录后仍立即复查，并每小时复查。

没有域名时，在本机建立 SSH 隧道：

```powershell
ssh -L 18080:127.0.0.1:8080 ubuntu@服务器IP
```

然后打开 `http://127.0.0.1:18080/admin`，或把脚本的 `--server` 设为
`http://127.0.0.1:18080`。连接经过 SSH 加密，Node 只看到本机请求。

## HTTP 接口

```text
GET /iptv/v1/channels.json             全部频道
GET /iptv/v1/channels.json?country=CN  CN 频道
GET /iptv/v1/status.json               全量上传状态
GET /iptv/v1/status.json?country=CN    CN 上传状态
GET /iptv/v1/health-status.json        全量健康检查状态
GET /iptv/v1/health-status.json?country=CN CN 健康检查状态
GET /admin                  管理页面，需要 Basic Auth
POST /admin/catalog         上传频道 JSON，需要 Basic Auth
GET /check                  App 设置界面的服务器身份验证
GET /healthz                进程存活检查
GET /readyz                 是否已有可提供的频道目录
```

完整响应结构、状态码和 ETag 用法见 [HTTP API](docs/API.md)。
Android TV 接口继续使用 GET。只有管理页面和上传接口需要 Basic Auth。

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
curl http://127.0.0.1:8080/iptv/v1/health-status.json
```

Compose 只绑定服务器本机 `127.0.0.1:8080`。用 Caddy 或 Nginx 反向代理并提供 HTTPS，
再把 App 的 `CHANNELS_URL` 指向：

```text
https://your-domain.example/iptv/v1/channels.json
```

Compose 使用 `home-tv-data` 命名卷保存数据。删除该卷会丢失上次成功频道目录；普通容器重建不会。
