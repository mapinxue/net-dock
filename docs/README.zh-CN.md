# Net Dock

[English](../README.md)

Net Dock 是一个用于 Windows 的桌面网络管理工具，基于 Tauri 构建，面向日常网卡切换、网络状态查看、DNS 配置和 VPN 操作。

> 当前状态：正在迭代中。应用内 DNS 和 VPN 功能仍标记为 WIP，后续会继续完善体验和稳定性。

![Net Dock 截图](screenshot.png)

## 已有功能

- 查看 Windows 网卡列表、状态、IPv4 地址和连接特定 DNS 后缀。
- 使用卡片右上角开关启用或禁用网卡。
- 在网卡卡片标题处原地修改网卡名称。
- 当网卡处于 `Disconnected` 等过渡状态时自动刷新状态。
- 通过右下角悬浮刷新按钮手动刷新当前页面。
- 支持英文和简体中文界面切换。
- 读取 IPv4 DNS 配置。
- 设置静态 DNS，或恢复自动获取 DNS。
- 读取 Windows 已保存的 VPN 配置。
- 连接或断开已保存的 VPN。
- 启动时请求管理员权限，以支持网卡、DNS 和 VPN 操作。

## 安装

从 GitHub Releases 下载 Windows 便携版 zip，解压后运行 `net-dock.exe`。

网卡、DNS 和 VPN 操作通常需要管理员权限。Net Dock 启动时会触发 Windows UAC 授权。

## 开发

本项目使用 Tauri v2、Vite、React、TypeScript 和 Rust。

```powershell
npm install
npm run tauri dev
```

构建便携版可执行文件：

```powershell
npm run tauri -- build --no-bundle
```

当本机可用 NSIS 或 WiX 时，可以构建安装包：

```powershell
npm run tauri -- build --bundles nsis
```

## 说明

当前后端通过 Tauri + Rust 调用 PowerShell 命令完成网络操作，例如 `Get-NetAdapter`、`Get-NetIPAddress`、`Get-DnsClient` 和 `Rename-NetAdapter`。自动刷新网卡状态时使用了更轻量的状态查询，避免频繁刷新 DNS、VPN 和 IP 详情。
