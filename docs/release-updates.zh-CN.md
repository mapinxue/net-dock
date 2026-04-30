# 发布更新教程

本文说明如何发布 Net Dock 的自动更新包。项目已经接入 Tauri v2 updater，应用内入口在“设置 -> 应用更新”。

当前更新地址配置在 `src-tauri/tauri.conf.json`：

```json
"endpoints": [
  "https://github.com/mapinxue/net-dock/releases/latest/download/latest.json"
]
```

也就是说，每次发布新版本时，需要把安装包、对应的 `.sig` 签名文件内容，以及 `latest.json` 一起上传到 GitHub Releases。

## 前置条件

1. 确保本机可以构建 Tauri Windows 安装包。
2. 确保已经安装依赖：

```powershell
npm install
```

3. 确保 updater 私钥存在：

```powershell
Test-Path "$env:USERPROFILE\.tauri\net-dock.key"
```

如果返回 `False`，需要重新生成密钥，并把生成的 public key 同步到 `src-tauri/tauri.conf.json` 的 `plugins.updater.pubkey`。

```powershell
npm run tauri signer generate -- --ci -w "$env:USERPROFILE\.tauri\net-dock.key"
```

注意：私钥不能提交到仓库，也不能丢失。私钥丢失后，已安装用户将无法继续通过自动更新安装新版本。

## 1. 更新版本号

发布前先提升版本号，三个地方要保持一致：

- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

例如发布 `0.1.3`，三个文件里的版本都应改成 `0.1.3`。

建议先运行一次检查：

```powershell
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
```

## 2. 构建带签名的安装包

在 PowerShell 中设置私钥路径，然后构建：

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY_PATH="$env:USERPROFILE\.tauri\net-dock.key"
npm run tauri build
```

如果只想构建 NSIS 安装包，可以使用：

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY_PATH="$env:USERPROFILE\.tauri\net-dock.key"
npm run tauri -- build --bundles nsis
```

构建成功后，Windows 安装包通常在：

```text
src-tauri/target/release/bundle/nsis/
src-tauri/target/release/bundle/msi/
```

由于 `createUpdaterArtifacts` 已设置为 `true`，Tauri 会同时生成安装包对应的 `.sig` 文件。

## 3. 准备 latest.json

在发布目录准备一个 `latest.json`。Windows x64 的基本格式如下：

```json
{
  "version": "0.1.3",
  "notes": "本次更新说明。",
  "pub_date": "2026-04-30T00:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "这里粘贴 .sig 文件内容",
      "url": "https://github.com/mapinxue/net-dock/releases/download/v0.1.3/Net-Dock_0.1.3_x64-setup.exe"
    }
  }
}
```

字段说明：

- `version`：新版本号，必须大于用户当前安装版本。
- `notes`：应用内可展示的更新说明。
- `pub_date`：发布时间，使用 RFC 3339 格式。
- `platforms.windows-x86_64.signature`：对应 `.sig` 文件的文本内容，不是文件路径。
- `platforms.windows-x86_64.url`：用户要下载的安装包 URL。

读取 `.sig` 内容：

```powershell
Get-Content "src-tauri\target\release\bundle\nsis\<安装包文件名>.sig"
```

如果实际生成的是 MSI，就把 `url` 指向 `.msi`，并使用对应 `.msi.sig` 的内容。

## 4. 创建 GitHub Release

1. 在 GitHub 打开 `mapinxue/net-dock` 仓库的 Releases 页面。
2. 创建 tag，例如 `v0.1.3`。
3. Release 标题建议使用 `Net Dock v0.1.3`。
4. 上传以下文件：
   - Windows 安装包，例如 `.exe` 或 `.msi`
   - 对应的 `.sig` 文件，便于排查和留档
   - `latest.json`
5. 发布 Release。

发布后，确认这个地址可以访问：

```text
https://github.com/mapinxue/net-dock/releases/latest/download/latest.json
```

## 5. 验证自动更新

验证时建议保留一个旧版本安装包，例如本机已安装 `0.1.2`，然后发布 `0.1.3`。

1. 启动旧版本 Net Dock。
2. 打开“设置 -> 应用更新”。
3. 点击“检查版本”。
4. 出现新版本后，点击“下载并安装”。
5. 应用应下载安装包、安装更新并重启。

如果没有检测到更新，优先检查：

- `latest.json` 是否能公开访问。
- `latest.json` 的 `version` 是否大于当前安装版本。
- `url` 是否能公开下载。
- `signature` 是否是 `.sig` 文件内容，而不是路径。
- 构建时是否设置了 `TAURI_SIGNING_PRIVATE_KEY_PATH`。
- `src-tauri/tauri.conf.json` 中的 `pubkey` 是否和私钥匹配。

## 6. 常用发布清单

每次发布前按这个清单走：

- 更新三个版本号。
- 运行 `npm run build`。
- 运行 `cargo check --manifest-path src-tauri/Cargo.toml`。
- 设置 `TAURI_SIGNING_PRIVATE_KEY_PATH`。
- 运行 `npm run tauri build`。
- 找到安装包和对应 `.sig`。
- 生成并检查 `latest.json`。
- 创建 GitHub Release 并上传文件。
- 用旧版本客户端检查更新。

## 参考资料

- Tauri updater 官方文档：https://v2.tauri.app/plugin/updater/
