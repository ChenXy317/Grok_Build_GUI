# Grok Build GUI

Grok Build 官方目前只有终端 TUI。本项目是社区桌面客户端：拉起本地 `grok agent stdio`，通过 [ACP](https://agentclientprotocol.com) 驱动同一套 agent，而不是再实现一个模型循环。

**非 xAI 官方项目。** Grok / Grok Build 是 xAI 的商标。

## 功能

- 会话侧栏：按项目列出、搜索、恢复历史会话
- 流式对话：文本、思考过程、工具卡片、计划
- 权限弹窗：对应 ACP `session/request_permission`
- 模型与推理强度切换
- 附加本地文件（写入 `@路径`）
- 新会话始终批准（等价 TUI always-approve）

## 需要

- 已安装并登录的 [Grok CLI](https://x.ai/cli)
- Node.js 18+

默认查找 `%USERPROFILE%\.grok\bin\grok.exe`（macOS / Linux 为 `~/.grok/bin/grok`）。

## 运行

```powershell
npm install
npm run dev
```

国内网络若下载 Electron 失败，可先设置镜像再安装：

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
npm install
```

```powershell
npm run build
npm start
```

## 用法

1. 打开项目目录
2. 新建或恢复会话
3. Enter 发送，Shift+Enter 换行
4. 工具需要批准时，在弹窗中选择允许或拒绝

「新会话始终批准」只对之后新建的会话生效。不要同时在 TUI 和本 GUI 打开同一个会话。

## 许可

MIT

