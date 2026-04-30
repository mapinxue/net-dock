use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::process::Command;
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime, WindowEvent,
};
use thiserror::Error;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x08000000;
const TRAY_ID: &str = "net-dock-tray";
const TRAY_LOADING_ID: &str = "tray-loading";
const TRAY_EXIT_ID: &str = "tray-exit";
const TRAY_ADAPTER_PREFIX: &str = "tray-adapter:";

#[derive(Debug, Error)]
enum NetDockError {
    #[error("PowerShell 执行失败: {0}")]
    PowerShell(String),
    #[error("无法解析 PowerShell 输出: {0}")]
    Json(String),
}

impl Serialize for NetDockError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

type CommandResult<T> = Result<T, NetDockError>;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NetworkAdapter {
    name: String,
    interface_description: Option<String>,
    status: Option<String>,
    mac_address: Option<String>,
    link_speed: Option<String>,
    ip_addresses: Vec<String>,
    connection_specific_suffix: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AdapterStatus {
    name: String,
    status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AdapterOperationResult {
    action: String,
    requested_name: String,
    before: Option<NetworkAdapter>,
    after: Option<NetworkAdapter>,
    changed: bool,
    message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DnsConfig {
    interface_alias: String,
    server_addresses: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VpnProfile {
    name: String,
    server_address: Option<String>,
    tunnel_type: Option<String>,
    connection_status: Option<String>,
}

#[tauri::command]
fn list_adapters() -> CommandResult<Vec<NetworkAdapter>> {
    let script = r#"
Get-NetAdapter | ForEach-Object {
  $Adapter = $_
  $IpAddresses = @(
    Get-NetIPAddress -InterfaceIndex $Adapter.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object { $_.IPAddress -notlike "169.254.*" } |
      Select-Object -ExpandProperty IPAddress
  )

  [PSCustomObject]@{
    Name = $Adapter.Name
    InterfaceDescription = $Adapter.InterfaceDescription
    Status = $Adapter.Status
    MacAddress = $Adapter.MacAddress
    LinkSpeed = $Adapter.LinkSpeed
    IpAddresses = $IpAddresses
    ConnectionSpecificSuffix = (Get-DnsClient -InterfaceIndex $Adapter.ifIndex -ErrorAction SilentlyContinue).ConnectionSpecificSuffix
  }
} | ConvertTo-Json -Depth 4
"#;

    let value = run_powershell_json(script, &[])?;
    Ok(json_items(value)
        .into_iter()
        .map(|item| NetworkAdapter {
            name: read_string(&item, "Name").unwrap_or_default(),
            interface_description: read_string(&item, "InterfaceDescription"),
            status: read_string(&item, "Status"),
            mac_address: read_string(&item, "MacAddress"),
            link_speed: read_string(&item, "LinkSpeed"),
            ip_addresses: read_string_array(&item, "IpAddresses"),
            connection_specific_suffix: read_string(&item, "ConnectionSpecificSuffix"),
        })
        .filter(|adapter| !adapter.name.is_empty())
        .collect())
}

#[tauri::command]
fn list_adapter_statuses() -> CommandResult<Vec<AdapterStatus>> {
    let script = r#"
Get-NetAdapter |
  Select-Object Name, Status |
  ConvertTo-Json -Depth 3
"#;

    let value = run_powershell_json(script, &[])?;
    Ok(json_items(value)
        .into_iter()
        .map(|item| AdapterStatus {
            name: read_string(&item, "Name").unwrap_or_default(),
            status: read_string(&item, "Status"),
        })
        .filter(|adapter| !adapter.name.is_empty())
        .collect())
}

#[tauri::command]
fn enable_adapter(name: String) -> CommandResult<AdapterOperationResult> {
    run_adapter_action(name, "enable")
}

#[tauri::command]
fn disable_adapter(name: String) -> CommandResult<AdapterOperationResult> {
    run_adapter_action(name, "disable")
}

#[tauri::command]
fn rename_adapter(old_name: String, new_name: String) -> CommandResult<()> {
    run_powershell(
        "param($OldName, $NewName) Rename-NetAdapter -Name $OldName -NewName $NewName -Confirm:$false -ErrorAction Stop",
        &[old_name, new_name],
    )?;
    Ok(())
}

#[tauri::command]
fn list_dns_configs() -> CommandResult<Vec<DnsConfig>> {
    let script = r#"
Get-DnsClientServerAddress -AddressFamily IPv4 |
  Select-Object InterfaceAlias, ServerAddresses |
  ConvertTo-Json -Depth 4
"#;

    let value = run_powershell_json(script, &[])?;
    Ok(json_items(value)
        .into_iter()
        .map(|item| DnsConfig {
            interface_alias: read_string(&item, "InterfaceAlias").unwrap_or_default(),
            server_addresses: read_string_array(&item, "ServerAddresses"),
        })
        .filter(|config| !config.interface_alias.is_empty())
        .collect())
}

#[tauri::command]
fn set_dns_servers(interface_alias: String, server_addresses: Vec<String>) -> CommandResult<()> {
    if server_addresses.is_empty() {
        return clear_dns_servers(interface_alias);
    }

    let joined = server_addresses.join(",");
    run_powershell(
        r#"
param($InterfaceAlias, $Servers)
$ServerAddresses = $Servers -split "," | Where-Object { $_ -ne "" }
Set-DnsClientServerAddress -InterfaceAlias $InterfaceAlias -ServerAddresses $ServerAddresses
"#,
        &[interface_alias, joined],
    )?;
    Ok(())
}

#[tauri::command]
fn clear_dns_servers(interface_alias: String) -> CommandResult<()> {
    run_powershell(
        "param($InterfaceAlias) Set-DnsClientServerAddress -InterfaceAlias $InterfaceAlias -ResetServerAddresses",
        &[interface_alias],
    )?;
    Ok(())
}

#[tauri::command]
fn list_vpn_profiles() -> CommandResult<Vec<VpnProfile>> {
    let script = r#"
Get-VpnConnection |
  Select-Object Name, ServerAddress, TunnelType, ConnectionStatus |
  ConvertTo-Json -Depth 4
"#;

    let value = run_powershell_json(script, &[])?;
    Ok(json_items(value)
        .into_iter()
        .map(|item| VpnProfile {
            name: read_string(&item, "Name").unwrap_or_default(),
            server_address: read_string(&item, "ServerAddress"),
            tunnel_type: read_string(&item, "TunnelType"),
            connection_status: read_string(&item, "ConnectionStatus"),
        })
        .filter(|profile| !profile.name.is_empty())
        .collect())
}

#[tauri::command]
fn connect_vpn(name: String) -> CommandResult<()> {
    run_native("rasdial", &[name])?;
    Ok(())
}

#[tauri::command]
fn disconnect_vpn(name: String) -> CommandResult<()> {
    run_native("rasdial", &[name, "/disconnect".to_string()])?;
    Ok(())
}

fn run_powershell_json(script: &str, args: &[String]) -> CommandResult<Value> {
    let stdout = run_powershell(script, args)?;
    if stdout.trim().is_empty() {
        return Ok(Value::Array(vec![]));
    }

    serde_json::from_str(&stdout).map_err(|error| NetDockError::Json(error.to_string()))
}

fn run_adapter_action(name: String, action: &str) -> CommandResult<AdapterOperationResult> {
    let script = r#"
param($Name, $Action)

function Convert-NetDockAdapter($Adapter) {
  $IpAddresses = @(
    Get-NetIPAddress -InterfaceIndex $Adapter.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object { $_.IPAddress -notlike "169.254.*" } |
      Select-Object -ExpandProperty IPAddress
  )

  [PSCustomObject]@{
    Name = $Adapter.Name
    InterfaceDescription = $Adapter.InterfaceDescription
    Status = $Adapter.Status
    MacAddress = $Adapter.MacAddress
    LinkSpeed = $Adapter.LinkSpeed
    IpAddresses = $IpAddresses
    ConnectionSpecificSuffix = (Get-DnsClient -InterfaceIndex $Adapter.ifIndex -ErrorAction SilentlyContinue).ConnectionSpecificSuffix
  }
}

$Before = Convert-NetDockAdapter (Get-NetAdapter -Name $Name -ErrorAction Stop)

if ($Action -eq "enable") {
  Enable-NetAdapter -Name $Name -Confirm:$false -ErrorAction Stop
} elseif ($Action -eq "disable") {
  Disable-NetAdapter -Name $Name -Confirm:$false -ErrorAction Stop
} else {
  throw "Unknown adapter action: $Action"
}

Start-Sleep -Milliseconds 700

$After = Convert-NetDockAdapter (Get-NetAdapter -Name $Name -ErrorAction Stop)

[PSCustomObject]@{
  Action = $Action
  RequestedName = $Name
  Before = $Before
  After = $After
  Changed = $Before.Status -ne $After.Status
  Message = "Adapter '$Name' status: $($Before.Status) -> $($After.Status)"
} | ConvertTo-Json -Depth 5
"#;

    let value = run_powershell_json(script, &[name, action.to_string()])?;
    let before = value.get("Before").map(read_adapter).transpose()?;
    let after = value.get("After").map(read_adapter).transpose()?;

    Ok(AdapterOperationResult {
        action: read_string(&value, "Action").unwrap_or_else(|| action.to_string()),
        requested_name: read_string(&value, "RequestedName").unwrap_or_default(),
        before,
        after,
        changed: value
            .get("Changed")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        message: read_string(&value, "Message").unwrap_or_default(),
    })
}

fn run_powershell(script: &str, args: &[String]) -> CommandResult<String> {
    let mut command = Command::new("powershell.exe");
    let argument_list = args
        .iter()
        .map(|arg| format!("'{}'", powershell_single_quote(arg)))
        .collect::<Vec<_>>()
        .join(" ");
    let utf8_script = format!(
        "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $OutputEncoding = [System.Text.UTF8Encoding]::new($false); $ErrorActionPreference = 'Stop'; & {{ {} }} {}",
        script, argument_list
    );

    command
        .arg("-NoProfile")
        .arg("-NonInteractive")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-Command")
        .arg(utf8_script);

    run_command(command)
}

fn run_native(program: &str, args: &[String]) -> CommandResult<String> {
    let mut command = Command::new(program);
    for arg in args {
        command.arg(arg);
    }

    run_command(command)
}

fn powershell_single_quote(value: &str) -> String {
    value.replace('\'', "''")
}

fn run_command(mut command: Command) -> CommandResult<String> {
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);

    let output = command
        .output()
        .map_err(|error| NetDockError::PowerShell(error.to_string()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let message = if stderr.is_empty() { stdout } else { stderr };
        return Err(NetDockError::PowerShell(message));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn json_items(value: Value) -> Vec<Value> {
    match value {
        Value::Array(items) => items,
        Value::Null => vec![],
        item => vec![item],
    }
}

fn read_adapter(value: &Value) -> CommandResult<NetworkAdapter> {
    Ok(NetworkAdapter {
        name: read_string(value, "Name").unwrap_or_default(),
        interface_description: read_string(value, "InterfaceDescription"),
        status: read_string(value, "Status"),
        mac_address: read_string(value, "MacAddress"),
        link_speed: read_string(value, "LinkSpeed"),
        ip_addresses: read_string_array(value, "IpAddresses"),
        connection_specific_suffix: read_string(value, "ConnectionSpecificSuffix"),
    })
}

fn read_string(value: &Value, key: &str) -> Option<String> {
    match value.get(key)? {
        Value::String(text) => Some(text.clone()),
        Value::Number(number) => Some(number.to_string()),
        Value::Bool(flag) => Some(flag.to_string()),
        Value::Null => None,
        other => Some(other.to_string()),
    }
}

fn read_string_array(value: &Value, key: &str) -> Vec<String> {
    match value.get(key) {
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(|item| item.as_str().map(ToOwned::to_owned))
            .collect(),
        Some(Value::String(text)) if !text.is_empty() => vec![text.clone()],
        _ => vec![],
    }
}

fn setup_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let menu = build_loading_tray_menu(app.handle())?;
    let mut tray = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Net Dock")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(handle_tray_menu_event)
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    ..
                } | TrayIconEvent::DoubleClick {
                    button: MouseButton::Left,
                    ..
                }
            ) {
                show_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray = tray.icon(icon);
    }

    tray.build(app)?;

    let handle = app.handle().clone();
    tauri::async_runtime::spawn_blocking(move || {
        refresh_tray_menu(&handle);
    });

    Ok(())
}

fn build_loading_tray_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let menu = Menu::new(app)?;
    let loading = MenuItem::with_id(app, TRAY_LOADING_ID, "正在加载网卡...", false, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let exit = MenuItem::with_id(app, TRAY_EXIT_ID, "退出", true, None::<&str>)?;

    menu.append(&loading)?;
    menu.append(&separator)?;
    menu.append(&exit)?;

    Ok(menu)
}

fn build_tray_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let menu = Menu::new(app)?;

    match list_adapter_statuses() {
        Ok(adapters) if adapters.is_empty() => {
            let empty = MenuItem::with_id(app, TRAY_LOADING_ID, "未发现网卡", false, None::<&str>)?;
            menu.append(&empty)?;
        }
        Ok(adapters) => {
            for adapter in adapters {
                let id = format!("{TRAY_ADAPTER_PREFIX}{}", adapter.name);
                let checked = adapter
                    .status
                    .as_deref()
                    .is_some_and(is_enabled_adapter_status);
                let item =
                    CheckMenuItem::with_id(app, id, adapter.name, true, checked, None::<&str>)?;
                menu.append(&item)?;
            }
        }
        Err(error) => {
            let item = MenuItem::with_id(
                app,
                TRAY_LOADING_ID,
                format!("网卡加载失败: {error}"),
                false,
                None::<&str>,
            )?;
            menu.append(&item)?;
        }
    }

    let separator = PredefinedMenuItem::separator(app)?;
    let exit = MenuItem::with_id(app, TRAY_EXIT_ID, "退出", true, None::<&str>)?;
    menu.append(&separator)?;
    menu.append(&exit)?;

    Ok(menu)
}

fn handle_tray_menu_event<R: Runtime + 'static>(app: &AppHandle<R>, event: tauri::menu::MenuEvent) {
    let id = event.id().as_ref();
    if id == TRAY_EXIT_ID {
        app.exit(0);
        return;
    }

    if let Some(adapter_name) = id.strip_prefix(TRAY_ADAPTER_PREFIX) {
        toggle_adapter_from_tray(app, adapter_name.to_string());
    }
}

fn toggle_adapter_from_tray<R: Runtime + 'static>(app: &AppHandle<R>, adapter_name: String) {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let current_status = list_adapter_statuses().ok().and_then(|statuses| {
            statuses
                .into_iter()
                .find(|adapter| adapter.name == adapter_name)
                .and_then(|adapter| adapter.status)
        });
        let action = if current_status
            .as_deref()
            .is_some_and(is_enabled_adapter_status)
        {
            "disable"
        } else {
            "enable"
        };

        if let Err(error) = run_adapter_action(adapter_name.clone(), action) {
            eprintln!("failed to {action} adapter from tray: {error}");
        }

        refresh_tray_menu(&app);
    });
}

fn refresh_tray_menu<R: Runtime>(app: &AppHandle<R>) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        match build_tray_menu(app) {
            Ok(menu) => {
                if let Err(error) = tray.set_menu(Some(menu)) {
                    eprintln!("failed to refresh tray menu: {error}");
                }
            }
            Err(error) => eprintln!("failed to build tray menu: {error}"),
        }
    }
}

fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn is_enabled_adapter_status(status: &str) -> bool {
    status.trim().eq_ignore_ascii_case("up")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            setup_tray(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            list_adapters,
            list_adapter_statuses,
            enable_adapter,
            disable_adapter,
            rename_adapter,
            list_dns_configs,
            set_dns_servers,
            clear_dns_servers,
            list_vpn_profiles,
            connect_vpn,
            disconnect_vpn
        ])
        .run(tauri::generate_context!())
        .expect("error while running Net Dock");
}
