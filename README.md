# 家庭电视

面向 Android 6.0（API 23）电视盒子的个人 IPTV 播放器。

当前版本目标：

- 从自有服务器读取结构化频道 JSON
- 远程请求失败时使用本地缓存或 APK 内置示例
- 使用 Media3 ExoPlayer 播放直播流
- 支持遥控器换台、频道面板和触摸选择
- 同一频道播放失败时自动切换备用源

设计文档：

- [模块设计](docs/01-模块设计.md)
- [代码实现说明](docs/02-代码实现说明.md)

## 本地构建

Android Studio 中将 Gradle JDK 设置为 Embedded JDK，然后执行：

```powershell
.\gradlew.bat testDebugUnitTest assembleDebug
```

如果系统全局 Java 不能升级，可仅为当前 PowerShell 指定 Android Studio 自带 JDK：

```powershell
$env:JAVA_HOME="$env:ProgramFiles\Android\Android Studio\jbr"
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
.\gradlew.bat testDebugUnitTest assembleDebug lintDebug
```

默认使用 APK 内置的 `sample_channels.json`。接入自有服务器时，在项目根目录的
`local.properties` 添加：

```properties
CHANNELS_URL=https://your-domain.example/iptv/v1/channels.json
```

`local.properties` 不提交到 Git。

## 模拟器说明

真实目标是 Android 6.0（API 23）ARM 电视盒子；APK 的 `minSdk` 为 23。当前新版
Android Emulator 已不支持启动 API 23 `armeabi-v7a` 镜像。本机运行调试应另装可用的
Android TV x86/x86_64 镜像；最终仍需在真实 ARM 盒子验证解码、遥控器和网络直播源。
