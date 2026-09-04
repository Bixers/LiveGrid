# LiveGrid / 监控室

LiveGrid 是一套本地直播监控工作台，中文产品名为“监控室”。项目保留本地服务协议，使用独立的 Electron 桌面外壳与可维护的 TypeScript 前端，并采用冷白调度台视觉风格。

![LiveGrid 监控室界面](docs/images/livegrid-dashboard.png)

## 下载

- 当前公开版本：`0.1.8`
- [下载 LiveGrid 0.1.8 Windows x64 安装包](https://github.com/Bixers/LiveGrid/releases/download/v0.1.8/LiveGrid-0.1.8-setup.exe)
- SHA-256：`A5289EA2795E7AEA31B3AE8BC63D7A8E482411354789E13BA2B1DA2F3524CB6C`

安装包暂未配置代码签名证书，Windows 可能显示“未知发布者”。

## 环境

- Node.js `>=22.12.0`
- pnpm `11.x`
- 本地直播服务默认监听 `http://127.0.0.1:8123`

## 运行

```powershell
pnpm install
pnpm dev
```

开发地址：`http://127.0.0.1:4175/`

不连接真实直播流的界面演示：`http://127.0.0.1:4175/?demo=1`

Web 生产构建：

```powershell
pnpm build
```

输出目录为 `dist/`。

## 桌面 EXE

生成 Windows x64 安装版：

```powershell
pnpm desktop:pack
```

当前源码成品输出到 `release/LiveGrid-0.1.8-setup.exe`。默认安装到 `%LOCALAPPDATA%\Programs\监控室`；选择其他父目录时，安装器会自动补上独立的 `监控室` 子目录。安装器将文件直接释放到目标目录，不再先把大型 `app-64.7z` 写入系统临时目录。安装后直接运行 `LiveGrid.exe`，不再像单文件便携版一样每次解压 Electron 运行时。

仍需便携单文件时可执行 `pnpm desktop:pack:portable`，但未签名环境下每次启动都可能因临时解压和安全扫描出现较长等待。

首次启动会把随包后端复制到安装目录的 `runtime\backend`，PyInstaller 临时运行库位于同盘的 `runtime\pyi-temp`，并自动迁移旧版的房间列表和代理配置。桌面启动日志位于 `%APPDATA%\监控室\desktop.log`。

当前本地构建未配置代码签名证书，Windows 可能显示“未知发布者”。正式分发前应使用受信任证书签名。

完整依赖、构建目录与发布步骤见 [BUILDING.md](BUILDING.md)。

## 主要改进

- 直播监控与运行数据双视图，桌面三栏上下文和窄屏抽屉布局。
- 房间搜索、状态筛选、关注优先、多选和批量打开/静音/移除。
- 自由窗口开关，以及自动、1/2/3/4 列和重点画面布局；自由模式支持拖动、八向缩放和键盘调整。
- 每个房间使用独立 libmpv 播放器、弹幕连接和运行状态，视频同步到音频时钟并独立恢复断流。
- 取流操作最多 2 个并发；房间刷新随机错峰并在失败时指数退避，五路以上自动尝试将非主画面降为标清。
- 清晰度切换、逐房间音量、单房间音频焦点、紧凑播放控制、手动刷新和双击视频全屏。
- 弹幕可逐路开关，并可统一调整透明度、字号和顶部/底部显示区域；连接在 `8501` 至 `8506` 间轮换并带握手超时、心跳与退避重试。
- 直播顶栏显示 CNY 礼物收入，收入统计可切换当日、近 7 日和本次直播。
- 房间检查器使用独立的弹幕栏与礼物栏，礼物统计可选择是否包含免费礼物。
- 在固定用户目录保存已打开房间、关注、音量、静音和布局偏好，不受桌面本地服务随机端口影响。
- 本地服务健康、请求延迟、空状态、失败状态和恢复反馈。
- 原生实时弹幕、礼物事件检查器与 `/api/stats` 运行数据表。
- 命令面板与键盘操作；HLS/HTTP-FLV 均交给 libmpv 解析。

## 本地接口

开发服务器将以下路径代理到 `127.0.0.1:8123`：

- `GET /streams.json`
- `GET /status`
- `GET /add?room=<id>`
- `GET /remove?room=<id>`
- `GET /refresh`
- `GET /quality?room=<id>&q=<OD|UHD|HD|SD>`
- `GET /api/stats`
- `GET /api/room/<id>/trend`
- `GET /api/events`

## 集成边界

桌面版使用 Electron 承载新界面，并复用提供程序中独立运行的本地服务二进制。由于没有原始 C# 工程和 Python 服务源码，旧外壳与后端没有被反编译重写；二次开发集中在可维护的 TypeScript 前端和新的桌面生命周期、静态资源服务及接口转发层。


