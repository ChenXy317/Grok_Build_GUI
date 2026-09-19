# Grok Build GUI

Grok Build 官方目前只有终端 TUI。本项目是社区桌面客户端：拉起本地 `grok agent stdio`，通过 [ACP](https://agentclientprotocol.com) 驱动同一套 agent，而不是再实现一个模型循环。

**非 xAI 官方项目。** Grok / Grok Build 是 xAI 的商标。

## 需要

- 已安装并登录的 [Grok CLI](https://x.ai/cli)
- Node.js 18+

默认查找 `%USERPROFILE%\.grok\bin\grok.exe`（macOS / Linux 为 `~/.grok/bin/grok`）。

## 运行

Windows 双击 `启动.bat`。也可以把项目文件夹拖到该批处理上，会直接打开。也可以：

```powershell
npm install
npm run app
```

开发热重载：

```powershell
npm run dev
```

把项目目录作为参数传入，会直接打开该项目：

```powershell
npx electron-vite preview -- "D:\Projects\MyApp"
```

国内网络若下载 Electron 失败，可先设置镜像再安装：

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
npm install
```

## 用法

打开就会回到上次的项目和会话。之后：

1. 把项目文件夹拖进窗口，或点「打开项目」
2. 直接输入任务，Enter 发送
3. 文件拖进窗口即可附加；输入 `@` 可搜索项目文件；可粘贴截图
4. 输入 `/` 打开命令，或按 `Ctrl+P` 打开命令面板

「始终批准」默认打开，工具调用不再弹窗。`Shift+Tab` 在询问 / 计划 / 自动 / 始终批准之间切换。关掉始终批准后，工具调用会弹窗，Enter 批准、Esc 取消。Agent 提问、MCP 征求输入、目录信任和计划批准也会弹出对应面板。

流式输出时再发送会进入队列，当前回合结束后自动发出；点排队条目可移除。

### 快捷键

| 按键 | 作用 |
| --- | --- |
| Enter | 发送 / 排队 |
| Shift+Enter | 换行 |
| Ctrl+N | 新会话 |
| Ctrl+O | 打开项目 |
| Ctrl+B | 收起侧栏 |
| Ctrl+F | 查找当前对话 |
| Ctrl+E | 导出 Markdown |
| Ctrl+, | 设置 |
| Ctrl+L | 聚焦输入 |
| Ctrl+` | Agent 日志 |
| Ctrl+P | 命令面板 |
| Shift+Tab | 切换询问 / 计划 / 自动 / 始终批准 |
| Esc | 停止 / 关闭面板 |

侧栏会话可右键重命名、删除、打开目录、复制 ID。空输入框按 ↑ 可召回历史提示。

常用命令：`/plan` `/rewind` `/fork` `/compact` `/session-info` `/home`。

不要同时在 TUI 和本 GUI 打开同一个会话。

## 许可

MIT
