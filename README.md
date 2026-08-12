# TV Demo

个人使用的 IPTV 系统，仓库分为两个独立部分：

```text
tv-demo/
├─ android-tv/   Android TV 客户端
└─ server/       频道同步与配置服务
```

## Android TV App

`android-tv/` 使用 Kotlin、Android View、Media3 ExoPlayer。支持 Android 6.0
（API 23）、频道缓存、遥控器换台和同频道备用源自动切换。

构建：

```powershell
cd android-tv
$env:JAVA_HOME="$env:ProgramFiles\Android\Android Studio\jbr"
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
.\gradlew.bat testDebugUnitTest assembleDebug lintDebug
```

详细说明见 [Android TV README](android-tv/README.md)。

## Server

`server/` 使用 Node.js 22 和 TypeScript。它定期下载 iptv-org CN M3U，解析、合并频道，
保留上一份成功数据，并向 App 提供 JSON。它不转发视频流。

开发运行：

```powershell
cd server
npm install
npm test
npm run dev
```

接口：

- `GET /iptv/v1/channels.json`
- `GET /iptv/v1/status.json`
- `GET /healthz`
- `GET /readyz`

详细配置见 [Server README](server/README.md)，Ubuntu 22.04 部署见
[部署文档](server/docs/UBUNTU_DEPLOY.md)。

## App 连接服务器

在 `android-tv/local.properties` 写入：

```properties
CHANNELS_URL=https://your-domain.example/iptv/v1/channels.json
```

该文件已忽略，不会提交私人服务器地址。
