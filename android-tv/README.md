# Android TV App

面向 Android 6.0（API 23）电视盒子的原生 Kotlin IPTV 客户端。

已实现：

- 从自有服务器读取结构化频道 JSON
- 远程请求失败时使用本地缓存或 APK 内置示例
- 使用 Media3 ExoPlayer 播放 HLS、DASH 等直播流
- 遥控器换台、频道面板和手机触摸选择
- 同频道播放失败时自动切换备用源
- 保存并恢复最后播放频道

设计文档：

- [模块设计](docs/01-模块设计.md)
- [代码实现说明](docs/02-代码实现说明.md)

## 本地构建

Android Studio 中把 Gradle JDK 设置为 Embedded JDK，或在当前 PowerShell 临时设置：

```powershell
$env:JAVA_HOME="$env:ProgramFiles\Android\Android Studio\jbr"
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
.\gradlew.bat testDebugUnitTest assembleDebug lintDebug
```

默认使用 APK 内置的 `sample_channels.json`。接入服务器时，在本目录创建
`local.properties`：

```properties
CHANNELS_URL=https://your-domain.example/iptv/v1/channels.json
```

`local.properties` 不提交到 Git。

## 模拟器说明

目标机是 Android 6.0 ARM 电视盒子。新版 Android Emulator 已不支持 API 23
`armeabi-v7a` 镜像，开发调试需使用可运行的 Android TV x86/x86_64 镜像；最终必须在
真实 ARM 盒子验证硬解码、遥控键码和网络直播源。
