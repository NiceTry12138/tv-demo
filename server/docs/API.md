# HTTP API

服务默认只监听 `127.0.0.1:8080`（生产 systemd 配置），公网由 Nginx 提供 HTTPS。
Android TV 和状态接口使用 `GET`。管理页面与上传接口使用 HTTP Basic Auth；必须通过 HTTPS
或 SSH 隧道访问。公网 HTTP 请求会返回 `426`，避免用户名和密码被明文截获。

## `GET /admin`

频道目录管理页面。浏览器会要求输入管理员用户名和密码。默认用户名是 `cong01`；密码由
服务器环境变量 `ADMIN_PASSWORD` 设置，代码和示例配置不保存明文密码。

## `POST /admin/catalog`

上传本机收集脚本生成的 JSON，需要 Basic Auth 和 `Content-Type: application/json`。成功保存
原始全量/CN 目录后返回 `202`，并立即在后台启动健康检查。旧健康缓存会继续提供给 App，直到
新检查成功完成。

```json
{
  "generatedAt": "2026-08-15T01:00:00Z",
  "entries": [
    {
      "name": "CCTV-1",
      "url": "https://example.com/live.m3u8",
      "country": "CN",
      "tvgId": "CCTV1.cn",
      "logo": null,
      "group": "央视",
      "userAgent": null,
      "referrer": null
    }
  ]
}
```

`name`、HTTP(S) `url`、两位 `country` 必填。服务器再次按 URL 去重。成功响应：

```json
{
  "importedSourceCount": 530,
  "channelCount": 380,
  "cnChannelCount": 380,
  "healthCheck": "started"
}
```

## `GET /check`

供 Android TV 设置界面验证输入的 IP 和端口确实指向本服务。只验证服务身份；即使首份频道
目录尚未上传或健康检查未完成也返回 `200`，由 `catalogReady` 表示数据状态。

```json
{
  "service": "home-tv-server",
  "apiVersion": 1,
  "status": "ok",
  "catalogReady": true,
  "healthyCatalogReady": true
}
```

## `GET /iptv/v1/channels.json`

Android TV App 使用的全量频道目录。增加 `country=CN` 返回 CN 目录：

```text
GET /iptv/v1/channels.json             全部频道
GET /iptv/v1/channels.json?country=CN  CN 频道
```

`country` 不区分大小写。当前仅支持 `CN`；其他值返回 `400`。对应目录首次上传或健康检查尚未完成时返回 `503`。成功响应只包含检查通过的源：

```json
{
  "version": "2026-08-13T01:00:00.000Z",
  "channels": [
    {
      "id": "CCTV1.cn",
      "name": "CCTV-1",
      "logo": "https://example.com/logo.png",
      "group": "央视",
      "sources": [
        {
          "url": "https://example.com/live.m3u8",
          "quality": "1080p",
          "videoCodec": null,
          "userAgent": null,
          "referrer": null,
          "geoBlocked": false,
          "alwaysOn": true,
          "status": "healthy",
          "checkedAt": "2026-08-13T01:00:02.000Z"
        }
      ]
    }
  ]
}
```

响应头包含：

- `Content-Type: application/json; charset=utf-8`
- `Cache-Control: public, max-age=300`
- `ETag`

客户端可发送 `If-None-Match`；内容未变化时返回 `304`，无响应体。

## `GET /iptv/v1/status.json`

最近一次管理员上传状态，不是 App 播放依赖。增加 `?country=CN` 读取 CN 独立状态。
`Cache-Control: no-store`。

```json
{
  "state": "ready",
  "upstream": "admin-upload",
  "lastAttemptAt": "2026-08-13T01:00:00.000Z",
  "lastSuccessAt": "2026-08-13T01:00:01.000Z",
  "channelCount": 149,
  "sourceCount": 149,
  "error": null
}
```

服务器不会主动访问 GitHub 或目录来源。上传失败不会覆盖已有目录。

## `GET /iptv/v1/health-status.json`

返回播放源健康检查统计；增加 `?country=CN` 查询 CN 独立统计。

```json
{
  "state": "ready",
  "lastAttemptAt": "2026-08-13T01:00:02.000Z",
  "lastSuccessAt": "2026-08-13T01:00:10.000Z",
  "checkedSourceCount": 530,
  "healthySourceCount": 78,
  "healthyChannelCount": 74,
  "error": null
}
```

健康检查使用服务器出口发起 GET，HTTP 2xx 且能读取非空媒体响应才算通过；HLS 会读取播放列表
并继续检查首个子播放列表或媒体字节。它不能替代 Android TV 播放器的最终验证。

## 探针

```text
GET /healthz  进程能够响应即 200 {"status":"ok"}
GET /check    App 服务器设置验证，进程正常即 200
GET /readyz   健康频道缓存已存在即 200；否则 503
```

`readyz` 在新检查失败但仍有旧健康缓存时保持 200，因为服务仍可向 App 提供可用目录。

## 通用状态码

| 状态码 | 含义 |
|---|---|
| `200` | 成功 |
| `304` | ETag 未变化 |
| `400` | 不支持的 `country` 参数 |
| `404` | 路径不存在 |
| `401` | 管理接口用户名或密码错误 |
| `405` | 请求方法错误 |
| `413` | 上传内容超过限制 |
| `415` | 上传接口不是 JSON |
| `426` | 管理接口未使用 HTTPS/本机连接 |
| `500` | 本地数据读取异常 |
| `503` | 首份频道目录尚未生成 |
