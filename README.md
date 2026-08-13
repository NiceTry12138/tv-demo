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

## GitHub Actions 构建

`.github/workflows/build.yml` 在 `main` push、Pull Request 或手动触发时运行两个任务：

- `Build Android TV APK`：测试并构建 `app-debug.apk`。
- `Build server package`：运行服务器测试、类型检查、编译，并生成可部署的 `.tar.gz`。

在 GitHub 仓库的 Actions 页面打开对应运行记录，在 Artifacts 下载：

- `android-tv-apk-<commit-sha>`
- `home-tv-server-<commit-sha>`

如需把自有服务器地址编入 APK，在仓库 `Settings → Secrets and variables → Actions` 新增
`CHANNELS_URL` Secret。未配置时 App 使用内置示例。Secret 不会写入 Git，但 URL 会进入
APK，可以被提取；不要在 URL 中放密码或访问令牌。
