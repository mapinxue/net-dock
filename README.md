# net-dock

Windows network manager for adapters, DNS, and VPN.

用于管理 Windows 网卡切换、DNS 和 VPN 的 Tauri 桌面应用。

## 功能规划

- 网卡：读取适配器状态，启用/禁用指定网卡。
- DNS：读取 IPv4 DNS 配置，设置静态 DNS，恢复自动 DNS。
- VPN：读取 Windows VPN 配置，连接/断开指定 VPN。

## 开发

本项目使用 Tauri v2、Vite 和 TypeScript。

```powershell
npm install
npm run tauri dev
```

如果本机还没有 Rust，请先安装 Rust 和 Tauri 的 Windows 依赖：

- Rust: https://www.rust-lang.org/tools/install
- Tauri prerequisites: https://tauri.app/start/prerequisites/

部分网卡和 DNS 操作需要管理员权限运行应用。
