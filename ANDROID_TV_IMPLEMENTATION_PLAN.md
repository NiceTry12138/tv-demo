# Android TV 直播 App 实现方案

## 1. 项目目标

制作个人使用的 Android TV 直播 App：

- 目标设备：Android 6.0（API 23）
- 内存：2 GB
- 存储：8 GB
- 操作方式：电视遥控器为主，手机触摸用于开发验证
- 内容来源：多个社区 IPTV 目录
- 数据入口：自有公网服务器
- 使用范围：个人使用，不商业化，不上架应用商店

整体结构：

```text
本地收集脚本：多来源抓取、解析、去重
       |
       v
管理员上传：Basic Auth + HTTPS
       |
       v
公网服务器：保存、按地区拆分、每小时检测
       |
       v
channels.json
       |
       v
Android TV App：缓存、展示、播放、故障切源
       |
       v
第三方直播源
```

第一阶段不通过公网服务器代理视频流。服务器只提供频道配置，App 直接连接第三方直播源。

## 2. 技术栈

### 2.1 Android App

| 技术 | 类型 | 用途 |
|---|---|---|
| Kotlin | 开发语言 | 唯一业务开发语言 |
| Android View + XML | UI 框架与布局资源 | 构建适合老设备的电视界面 |
| ViewBinding | Android 库 | Kotlin 类型安全访问 View |
| RecyclerView | Android UI 库 | 展示分类和频道列表 |
| Media3 ExoPlayer | 播放库 | 播放 HLS、DASH 等直播流 |
| OkHttp | HTTP 库 | 请求自有服务器及配置播放请求头 |
| kotlinx.serialization | JSON 库 | 解析 `channels.json` |
| Kotlin Coroutines | 并发库 | 下载、缓存、刷新等异步任务 |
| ViewModel + StateFlow | 状态管理 | 管理频道、播放及页面状态 |
| SharedPreferences | Android 存储 API | 保存收藏、设置、最后频道 |
| 本地 JSON 文件 | 缓存方案 | 保存最后一次成功的频道列表 |
| Gradle Kotlin DSL | 构建配置 | 管理构建、版本及依赖 |

第一版不使用：

- WebView
- Jetpack Compose
- C++、NDK、JNI、CMake
- Java 业务代码
- Retrofit
- Room
- LiveData
- 旧版 ExoPlayer
- 央视频私有鉴权、JCE、Protobuf、OpenSSL

### 2.2 公网服务器

建议继续使用熟悉的 TypeScript：

- Node.js 22
- TypeScript
- Web 管理页面和 Basic Auth 上传接口
- Python 3 收集上传脚本
- 静态 JSON 文件发布
- Nginx 或 Caddy 提供 HTTPS
- 第一版不引入数据库
- 后续如需保存检测历史，可增加 SQLite

## 3. 开发环境

### 3.1 Windows 主开发环境

- Android Studio 最新稳定版
- JDK 17
- Android SDK Platform 23
- Android SDK Platform 34 或 35
- Android SDK Build-Tools
- Android SDK Platform-Tools（包含 `adb`）
- Git
- Node.js 22
- Android TV 模拟器
- Android 手机

Android 项目基础配置：

```kotlin
android {
    compileSdk = 35

    defaultConfig {
        minSdk = 23
        targetSdk = 35
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
```

`minSdk = 23` 决定 App 可在 Android 6.0 运行。`compileSdk` 和 `targetSdk` 可使用较新版本，但所有依赖必须明确支持 API 23。

### 3.2 macOS 备用环境

macOS 不是必需环境。需要时安装：

- Android Studio
- JDK 17
- Android SDK
- Platform-Tools
- Git
- Node.js 22

Apple Silicon 对旧版 x86 Android 6 模拟器支持可能有限，旧系统兼容验证优先使用 Windows。

### 3.3 构建与安装

Windows：

```powershell
cd android-tv
.\gradlew.bat assembleDebug
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

macOS：

```bash
cd android-tv
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## 4. 目标机状态与约束

已知目标机：

- Android 6.0 / API 23
- 2 GB RAM
- 8 GB 存储
- 2021 年购买
- 当前无实机

设计约束：

- APK 尽量控制在 30～50 MB 内
- 不缓存视频内容
- 频道 JSON 仅保留当前版本和上一成功版本
- Logo 缓存必须设置容量上限
- 全局只保留一个 ExoPlayer 实例
- 默认优先 H.264、720p、1080p
- 4K、8K 源降低优先级或默认隐藏
- 避免复杂动画、大图和过深页面层级
- 支持 HTTP 明文直播源
- 支持旧系统 TLS 和证书异常的明确错误提示
- 所有核心功能必须能用遥控器完成

模拟器无法验证目标盒子的硬件解码、厂商系统和特殊遥控键码。最终验收必须使用真实盒子。

## 5. 服务器实现方案

### 5.1 更新流程

需要更新频道时在可访问上游的电脑执行：

```text
抓取 iptv-org、fanmingming/live、YueChan/Live、live.zbds.top、tv.iill.top/m3u/Gather
→ 解析 M3U/TXT 和请求头
→ 按流 URL 去重并补充地区
→ 本机并发 GET 检查，只保留可访问源
→ 生成健康源上传 JSON
→ 通过 HTTPS + Basic Auth 上传
→ 服务器校验并原子保存全量/CN 目录
→ 上传后立即二次健康检测
→ 每小时重新健康检测
→ 只发布检测通过的源
```

服务器不访问 GitHub 或其他目录来源。本机零健康源时不上传；服务器上传或检查失败不得覆盖
上一健康版本。本机、服务器和电视网络出口不同，因此服务器二次检查仍需保留。

### 5.2 服务接口

```text
GET /iptv/v1/channels.json
GET /iptv/v1/status.json
GET /admin
POST /admin/catalog
```

`status.json` 用于提供更新时间、频道数、源数量及任务状态，不是第一版 App 的强依赖。

### 5.3 数据结构

```json
{
  "version": "2026-08-12T20:00:00+08:00",
  "channels": [
    {
      "id": "CCTV1.cn",
      "name": "CCTV-1",
      "logo": "https://example.com/logo.png",
      "group": "央视",
      "sources": [
        {
          "url": "http://example.com/live.m3u8",
          "quality": "1080p",
          "videoCodec": "h264",
          "userAgent": null,
          "referrer": null,
          "geoBlocked": false,
          "alwaysOn": true,
          "status": "available",
          "checkedAt": "2026-08-12T19:50:00+08:00"
        }
      ]
    }
  ]
}
```

每个源必须保留：

- URL
- 清晰度
- 视频编码（检测可得时）
- `User-Agent`
- `Referer`
- 地区限制标记
- 非全天候标记
- 最近检测状态
- 最近检测时间

### 5.4 健康检测边界

服务器检测结果只用于排序，不能保证电视端一定可访问。服务器与电视可能使用不同地区、运营商、DNS 和网络出口。

### 5.5 视频代理边界

第一版不代理直播流：

```text
App → 自有服务器：下载 channels.json
App → 第三方服务器：播放直播流
```

本机收集再上传解决服务器无法访问 GitHub/目录源问题。如果第三方直播源也不可达，才考虑为少量频道增加代理。完整代理需要处理 HLS 清单重写、媒体分片、Token、请求头、带宽和延迟，不进入第一版范围。

## 6. App 功能范围

### 6.1 第一版必须实现

1. 从自有服务器下载频道 JSON。
2. 下载失败时读取本地旧缓存。
3. 展示频道分类和频道列表。
4. 全屏直播播放。
5. 遥控器上下键换台。
6. 确认键打开或关闭频道列表。
7. 返回键优先关闭菜单，再处理退出。
8. 支持手机触摸选择频道。
9. 保存并恢复最后播放频道。
10. 同频道多源自动切换。
11. 支持每个源独立配置 `User-Agent` 和 `Referer`。
12. 播放超时、有限重试和错误提示。
13. 网络断开与恢复处理。
14. 支持 HTTP 明文直播源。
15. 默认过滤或降低 4K、8K 源优先级。
16. 横屏、全屏、屏幕常亮。
17. App 内不显示 Media3 默认控制条。

### 6.2 第二版功能

- 收藏频道
- 最近观看
- 数字键选台
- 手动选择备用源
- Logo 显示与受限磁盘缓存
- 频道搜索
- 源状态和清晰度展示
- 自定义服务器地址
- 手动刷新频道列表

### 6.3 暂缓功能

- EPG 节目单
- 视频流代理
- 录制、回看、时移
- 自动更新 APK
- 多用户配置
- 复杂动画
- 4K、8K 专项优化

## 7. App 内部结构

```text
app/src/main/java/.../
├─ data/
│  ├─ Channel.kt
│  ├─ ChannelSource.kt
│  ├─ ChannelApi.kt
│  ├─ ChannelCache.kt
│  └─ ChannelRepository.kt
├─ player/
│  ├─ TvPlayer.kt
│  └─ PlaybackController.kt
├─ ui/
│  ├─ MainActivity.kt
│  ├─ ChannelListFragment.kt
│  ├─ PlayerFragment.kt
│  └─ SettingsFragment.kt
└─ viewmodel/
   └─ TvViewModel.kt
```

职责划分：

- `ChannelApi`：只负责下载 JSON。
- `ChannelCache`：只负责本地文件读写。
- `ChannelRepository`：决定使用缓存还是远程数据。
- `TvPlayer`：封装 Media3 和单个源播放。
- `PlaybackController`：负责超时、重试和备用源切换。
- `TvViewModel`：保存当前频道、列表、播放状态及错误。
- UI：只渲染状态并接收触摸/遥控输入。

启动流程：

```text
启动 App
→ 读取本地缓存并立即显示
→ 后台请求服务器
→ 校验远程数据
→ 更新缓存和 UI
→ 恢复最后频道
→ 播放首选源
→ 失败时切换备用源
```

## 8. 播放实现方案

### 8.1 源排序

优先级建议：

```text
最近检测成功
→ H.264
→ 1080p
→ 720p
→ 其他常规清晰度
→ 4K
→ 8K
→ 地区限制源
→ 非全天候源
```

实际排序使用多字段评分，不依赖名称字符串猜测；服务器应尽量提前产出结构化字段。

### 8.2 故障处理

- 连接或准备超时：10～15 秒
- 同一源最多重试 1 次
- 重试失败后切换下一个源
- 所有源失败后显示错误，不退出 App
- 用户换台时立即取消旧播放任务
- 新频道播放请求应覆盖旧请求
- 网络恢复后允许用户重试或自动重试当前频道一次
- 播放错误必须记录频道 ID、源序号和 Media3 错误码

### 8.3 请求头

Media3 数据源必须按当前源配置：

- `User-Agent`
- `Referer`
- 必要时其他固定 HTTP Header

不能只把直播 URL 传给 `MediaItem.fromUri()`，否则部分源会在浏览器可播、App 不可播。

## 9. `my-tv` 参考范围

可参考：

- Android TV Manifest 配置
- 横屏、全屏和屏幕常亮
- 遥控器键位行为
- 频道列表交互
- Media3 `PlayerView`
- 多源数据模型
- 最后频道保存方式

不直接复制：

- 硬编码 `TVList.kt`
- 央视频请求和鉴权
- JCE、Protobuf、OpenSSL
- NDK、CMake 和原生库
- Media3 与旧版 ExoPlayer 双实现
- 原有数据层和 EPG 层
- 原项目中的动态私有接口依赖

建议新建 App，将 `my-tv` 作为交互和兼容性参考。直接删除其大量遗留模块再改造，工作量与重写接近，而且更难理解和维护。

## 10. 实现步骤

### 阶段 1：验证数据闭环

1. 定义 `channels.json` Schema。
2. 实现本机多来源收集、解析和 URL 去重脚本。
3. 实现受 Basic Auth 保护的 Web/HTTP 上传。
4. 实现地区拆分、健康检测、原子发布和上一版本保留。
5. 为鉴权、上传、去重、检测和发布失败编写测试。

### 阶段 2：验证 Android 6 播放

1. 新建 Kotlin Android TV 项目。
2. 配置 `minSdk = 23`。
3. 建立单 Activity、单播放器页面。
4. 使用固定 HLS URL 验证 Media3 播放。
5. 验证 HTTP 明文源和自定义请求头。
6. 在 API 23 模拟器验证安装和启动。

### 阶段 3：接入频道数据

1. 实现 JSON 数据模型。
2. 实现 `ChannelApi`。
3. 实现本地缓存。
4. 实现缓存优先、后台刷新的 Repository。
5. 展示分类和频道列表。

### 阶段 4：完成 TV 交互

1. 实现遥控器焦点移动。
2. 实现上下键换台。
3. 实现确认键和返回键行为。
4. 增加手机触摸操作。
5. 保存并恢复最后频道。

### 阶段 5：增强播放可靠性

1. 实现源排序。
2. 实现播放准备超时。
3. 实现有限重试。
4. 实现备用源自动切换。
5. 实现断网和恢复处理。
6. 增加错误日志。

### 阶段 6：第二版功能

1. 收藏与最近观看。
2. Logo 加载和缓存限制。
3. 搜索与数字选台。
4. 手动源选择。
5. 设置页面。

### 阶段 7：真实盒子验收

1. 安装到 Android 6 真实盒子。
2. 核对遥控器键码。
3. 测试 H.264、H.265、720p、1080p。
4. 验证厂商网络和证书行为。
5. 长时间播放和频繁换台压测。
6. 根据实机结果调整源排序和 UI 性能。

## 11. 验证方案

| 环境 | 验证内容 |
|---|---|
| TypeScript 单元测试 | 上传校验、频道合并、地区拆分、健康过滤 |
| 服务器集成测试 | Basic Auth、上传失败、原子发布、上一版本保留 |
| Kotlin 单元测试 | JSON 解析、Repository 降级、源排序、切源状态机 |
| Android 手机 | 网络、播放、触摸、横屏、后台恢复、长时间播放 |
| API 23 模拟器 | Android 6 安装、启动、API 兼容和缓存 |
| Android TV 模拟器 | TV 启动入口、遥控器、焦点和菜单行为 |
| 2 GB 内存配置 | 内存占用、频繁换台、列表刷新和长时间运行 |
| 最终真实盒子 | 硬件解码、厂商系统、遥控器键码和最终性能 |

### 11.1 服务器验收标准

- 未认证请求不能打开管理页面或上传。
- 上传格式错误时不发布新版本。
- `channels.json` 可被 Schema 校验。
- 同频道多个源正确合并。
- Header、清晰度和限制标记不丢失。
- 发布过程不会让 App 下载到半个文件。
- 保留最后一次成功版本。

### 11.2 App 验收标准

- Android 6 / API 23 可以安装并启动。
- 服务器不可达时仍能展示缓存频道。
- 缓存损坏时给出明确错误，不崩溃。
- 频道切换不创建多个播放器实例。
- 单源失败后自动切换备用源。
- 所有源失败后仍可操作频道列表。
- 遥控器可以完成全部核心操作。
- 手机触摸可以完成开发阶段主要操作。
- 720p、1080p H.264 是主要稳定播放目标。
- 连续播放 4 小时无明显内存增长。
- 连续换台 100 次无崩溃、无持续音频残留。
- 断网后恢复，当前频道可重新播放。

## 12. 风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| 社区直播源失效 | 频道无法播放 | 健康检测、多源、保留旧版本 |
| 电视无法访问第三方源 | 列表正常但播放失败 | 更换源；必要时仅代理个别频道 |
| 老盒硬解能力未知 | 黑屏、卡顿或有声无画 | 优先 H.264 720p/1080p，实机调整 |
| 旧系统证书过期 | HTTPS 请求失败 | 自有服务器使用兼容 TLS；提供错误日志 |
| 遥控器键码差异 | 部分按键无效 | 实机记录键码并提供映射层 |
| 2 GB 内存限制 | 卡顿或系统回收 | 单播放器、限制图片缓存、简化 UI |
| Android TV API 23 镜像难获取 | 无法完整模拟 | API 23 手机模拟器 + 新版 TV 模拟器组合验证 |

## 13. 最终决策

- 新建原生 Android TV App，不直接改造 `my-tv`。
- Android 业务代码全部使用 Kotlin。
- UI 使用传统 Android View + XML，优先兼容 Android 6 老盒子。
- 播放只使用 Media3 ExoPlayer。
- 本机 Python 脚本收集多个来源；TypeScript 服务器只接收上传、校验、检测和发布。
- App 只从自有服务器获取频道配置，并直接播放第三方直播源。
- 第一阶段完成“收集、上传、检测、缓存、列表、播放、遥控、自动切源”闭环。
- 收藏、Logo、搜索属于第二阶段；EPG 和视频代理暂缓。
