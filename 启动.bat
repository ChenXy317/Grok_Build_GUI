@echo off
setlocal
chcp 65001 >nul
title Grok Build
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo 未找到 Node.js，请先安装 18 或更高版本：
  echo https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo 首次运行，正在安装依赖...
  call npm install
  if errorlevel 1 (
    echo.
    echo 安装失败。国内网络可先执行：
    echo   set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
    echo   npm install
    pause
    exit /b 1
  )
)

if not exist "out\main\index.js" (
  echo 正在构建...
  call npm run build
  if errorlevel 1 (
    echo 构建失败。
    pause
    exit /b 1
  )
)

set "ELECTRON=%cd%\node_modules\electron\dist\electron.exe"
if not exist "%ELECTRON%" (
  echo 未找到 Electron，正在补装依赖...
  call npm install
  if not exist "%ELECTRON%" (
    echo 仍未找到 Electron。
    pause
    exit /b 1
  )
)

start "" "%ELECTRON%" "%cd%" %*
exit /b 0
