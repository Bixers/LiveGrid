# LiveGrid 构建与打包

## 环境要求

- Windows 10/11 x64
- Node.js `>=22.12.0`
- pnpm `11.x`
- 可访问 npm 软件包源

## 安装依赖

```powershell
pnpm install --frozen-lockfile
```

## Web 开发与构建

启动开发服务器：

```powershell
pnpm dev
```

执行 TypeScript 检查并生成 Web 产物：

```powershell
pnpm check
pnpm build
```

Web 产物位于 `dist/`。

## Windows 安装包

生成 Electron Windows x64 安装包：

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
pnpm desktop:pack
```

安装包输出到：

```text
release/LiveGrid-0.1.2-setup.exe
```

安装程序默认使用 `%LOCALAPPDATA%\Programs\监控室`。用户在安装向导中选择其他父目录时，`build/installer.nsh` 会自动追加独立的 `监控室` 子目录。安装后的主程序文件名为 `LiveGrid.exe`。

需要便携单文件时可执行：

```powershell
pnpm desktop:pack:portable
```

便携版每次启动需要释放 Electron 运行时，启动速度通常慢于安装版。

## 打包内容

- `dist/`：Vite 生成的前端文件
- `electron/`：桌面主进程、静态资源服务和本地接口转发
- `desktop-backend/`：随包本地服务及默认配置
- `public/licenses/`：第三方许可文本
- `build/`：应用图标和 NSIS 安装器扩展

`release/`、`dist/` 和 `node_modules/` 不提交到 Git。正式安装包作为 GitHub Release 附件发布。

## 代码签名

当前配置可以生成未签名安装包。面向公开用户分发时，应在构建环境配置 Windows 代码签名证书，并重新生成安装包。
