# HTTP API

服务默认只监听 `127.0.0.1:8080`（生产 systemd 配置），公网由 Nginx 提供 HTTPS。
所有接口只读，但仅接受 `POST`。`GET` 和 `HEAD` 返回 `405`，因此浏览器地址栏不能直接打开数据。
注意：POST 只改变访问方式，不提供身份认证；知道地址的人仍可用脚本发送 POST。需要真正限制访问时，
应增加 token/API key，并由 App 通过请求头发送。

## `POST /check`

供 Android TV 设置界面验证输入的 IP 和端口确实指向本服务。只验证服务身份；即使首份频道
目录尚未同步完成也返回 `200`，由 `catalogReady` 表示数据状态。

```json
{
  "service": "home-tv-server",
  "apiVersion": 1,
  "status": "ok",
  "catalogReady": true
}
```

## `POST /iptv/v1/channels.json`

Android TV App 使用的全量频道目录。增加 `country=CN` 返回 CN 目录：

```text
POST /iptv/v1/channels.json             全部频道
POST /iptv/v1/channels.json?country=CN  CN 频道
```

`country` 不区分大小写。当前仅支持 `CN`；其他值返回 `400`。对应目录首次同步未完成时返回 `503`。成功响应：

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
          "status": "unknown",
          "checkedAt": null
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

## `POST /iptv/v1/status.json`

全量同步状态，不是 App 播放依赖。增加 `?country=CN` 读取 CN 独立状态。`Cache-Control: no-store`。

```json
{
  "state": "ready",
  "upstream": "https://iptv-org.github.io/iptv/countries/cn.m3u",
  "lastAttemptAt": "2026-08-13T01:00:00.000Z",
  "lastSuccessAt": "2026-08-13T01:00:01.000Z",
  "channelCount": 149,
  "sourceCount": 149,
  "error": null
}
```

`state`：`starting | syncing | ready | error`。同步失败时，若已有旧目录，频道接口继续返回旧目录。

## 探针

```text
POST /healthz  进程能够响应即 200 {"status":"ok"}
POST /check    App 服务器设置验证，进程正常即 200
POST /readyz   channels.json 已存在即 200；否则 503
```

`readyz` 在同步失败但仍有旧数据时保持 200，因为服务仍可向 App 提供可用目录。

## 通用状态码

| 状态码 | 含义 |
|---|---|
| `200` | 成功 |
| `304` | ETag 未变化 |
| `400` | 不支持的 `country` 参数 |
| `404` | 路径不存在 |
| `405` | 只允许 POST |
| `500` | 本地数据读取异常 |
| `503` | 首份频道目录尚未生成 |
