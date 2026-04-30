import { invoke } from '@tauri-apps/api/core'
import { getVersion } from '@tauri-apps/api/app'
import { relaunch } from '@tauri-apps/plugin-process'
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater'
import {
  Alert,
  Button,
  Card,
  Chip,
  Input,
  Label,
  ListBox,
  Select,
  Separator,
  Spinner,
  Switch,
  Tabs,
  toast,
} from '@heroui/react'
import {
  ArrowLeft,
  Cable,
  Check,
  ChevronDown,
  Download,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Search,
  Settings as Gear,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'

type Locale = 'zh' | 'en'
type Page = 'home' | 'settings'

type Adapter = {
  name: string
  interfaceDescription?: string
  status?: string
  macAddress?: string
  linkSpeed?: string
  ipAddresses: string[]
  connectionSpecificSuffix?: string
}

type AdapterStatus = {
  name: string
  status?: string
}

type DnsConfig = {
  interfaceAlias: string
  serverAddresses: string[]
}

type AdapterOperationResult = {
  action: string
  requestedName: string
  before?: Adapter
  after?: Adapter
  changed: boolean
  message: string
}

type ProxyConfig = {
  proxyEnable: boolean
  proxyServer?: string
  proxyOverride?: string
  autoConfigUrl?: string
  autoDetect: boolean
  registryPath: string
}

type DownloadProgress = {
  downloaded: number
  total?: number
  finished: boolean
}

const isTauriRuntime = '__TAURI_INTERNALS__' in window
const fallbackAppVersion = '0.1.2'

const localeStorageKey = 'net-dock-locale'

const messages = {
  zh: {
    appSubtitle: '网络管理',
    settings: '设置',
    language: '语言',
    languageDescription: '选择界面显示语言。',
    chinese: '简体中文',
    english: 'English',
    updates: '应用更新',
    updatesDescription: '检查是否有新版本，并在下载后自动安装重启。',
    currentVersion: '当前版本',
    latestVersion: '已是最新版本',
    desktopOnlyUpdate: '自动更新仅在桌面应用中可用。',
    checkUpdates: '检查版本',
    checkingUpdates: '检查中',
    downloadUpdate: '下载并安装',
    downloadingUpdate: '下载中',
    updateAvailable: (version: string) => `发现新版本 ${version}`,
    updateAvailableDescription: (current: string, next: string) => `当前版本 ${current}，可更新到 ${next}。`,
    updateInstalled: '更新已安装，正在重启应用。',
    updateCheckFailed: '更新检查失败',
    releaseNotes: '更新说明',
    progress: '进度',
    unknownSize: '大小未知',
    networkSections: '网络功能',
    adapters: '网卡',
    adapterCount: (count: number) => `${count} 网卡`,
    proxy: '代理',
    proxyControl: '代理',
    proxyDescription: '从当前用户注册表读取 Windows 系统代理设置。',
    proxyEnabled: '代理已启用',
    proxyDisabled: '代理未启用',
    enableProxy: '开启代理',
    enablingProxy: '开启中',
    disableProxy: '关闭代理',
    disablingProxy: '关闭中',
    proxyTurnedOn: '已开启代理',
    proxyTurnedOff: '已关闭代理',
    proxyServer: '代理服务器',
    proxyOverride: '例外地址',
    autoConfigUrl: '自动配置脚本',
    autoDetect: '自动检测',
    registryPath: '注册表',
    notConfigured: '未配置',
    yes: '是',
    no: '否',
    refresh: '刷新',
    refreshing: '刷新中',
    statusRefreshed: '状态已刷新',
    adapterEnabled: (name: string) => `已启用网卡 ${name}`,
    adapterDisabled: (name: string) => `已禁用网卡 ${name}`,
    adapterRenamed: (oldName: string, newName: string) => `已将 ${oldName} 重命名为 ${newName}`,
    adapterRenameEmpty: '网卡名称不能为空',
    adapterUnchanged: (name: string, status: string) => `命令已执行，但网卡 ${name} 状态仍为 ${status}`,
    adapterNoResult: (name: string) => `网卡 ${name} 命令没有返回状态信息，请查看控制台日志`,
    unknownAdapter: '未知适配器',
    ipAddress: 'IP',
    cableName: '网线名称',
    enable: '启用',
    disable: '禁用',
    dnsControl: 'DNS 控制',
    dnsDescription: '为指定接口设置静态 DNS，或恢复系统自动 DNS。',
    selectDnsInterface: '请选择要配置 DNS 的接口',
    selectDnsResetInterface: '请选择要恢复 DNS 的接口',
    interface: '接口',
    chooseInterface: '选择接口',
    dnsServers: 'DNS 服务器',
    dnsPlaceholder: '例如 223.5.5.5, 119.29.29.29',
    applyDns: '应用 DNS',
    automatic: '自动获取',
    currentConfig: '当前配置',
    dnsUpdated: (name: string) => `已更新 ${name} DNS`,
    dnsRestored: (name: string) => `已恢复 ${name} 自动 DNS`,
    status: '状态',
    loadingNetwork: '读取网络状态',
  },
  en: {
    appSubtitle: 'Network Operations',
    settings: 'Settings',
    language: 'Language',
    languageDescription: 'Choose the interface display language.',
    chinese: '简体中文',
    english: 'English',
    updates: 'App Updates',
    updatesDescription: 'Check for new versions, then install and relaunch after download.',
    currentVersion: 'Current version',
    latestVersion: 'You are on the latest version',
    desktopOnlyUpdate: 'Automatic updates are only available in the desktop app.',
    checkUpdates: 'Check Version',
    checkingUpdates: 'Checking',
    downloadUpdate: 'Download and Install',
    downloadingUpdate: 'Downloading',
    updateAvailable: (version: string) => `Version ${version} is available`,
    updateAvailableDescription: (current: string, next: string) => `Current version ${current}; update to ${next}.`,
    updateInstalled: 'Update installed. Relaunching the app.',
    updateCheckFailed: 'Update check failed',
    releaseNotes: 'Release notes',
    progress: 'Progress',
    unknownSize: 'Unknown size',
    networkSections: 'Network sections',
    adapters: 'Adapters',
    adapterCount: (count: number) => `${count} adapters`,
    proxy: 'Proxy',
    proxyControl: 'Proxy',
    proxyDescription: 'Read the current Windows system proxy from the user registry.',
    proxyEnabled: 'Proxy enabled',
    proxyDisabled: 'Proxy disabled',
    enableProxy: 'Enable proxy',
    enablingProxy: 'Enabling',
    disableProxy: 'Disable proxy',
    disablingProxy: 'Disabling',
    proxyTurnedOn: 'Proxy enabled',
    proxyTurnedOff: 'Proxy disabled',
    proxyServer: 'Proxy server',
    proxyOverride: 'Bypass list',
    autoConfigUrl: 'Auto config script',
    autoDetect: 'Auto detect',
    registryPath: 'Registry',
    notConfigured: 'Not configured',
    yes: 'Yes',
    no: 'No',
    refresh: 'Refresh',
    refreshing: 'Refreshing',
    statusRefreshed: 'Status refreshed',
    adapterEnabled: (name: string) => `Enabled adapter ${name}`,
    adapterDisabled: (name: string) => `Disabled adapter ${name}`,
    adapterRenamed: (oldName: string, newName: string) => `Renamed ${oldName} to ${newName}`,
    adapterRenameEmpty: 'Adapter name cannot be empty',
    adapterUnchanged: (name: string, status: string) => `Command ran, but adapter ${name} is still ${status}`,
    adapterNoResult: (name: string) => `Adapter ${name} command returned no status details. Check console logs.`,
    unknownAdapter: 'Unknown adapter',
    ipAddress: 'IP',
    cableName: 'Cable name',
    enable: 'Enable',
    disable: 'Disable',
    dnsControl: 'DNS Control',
    dnsDescription: 'Set static DNS for an interface, or restore automatic DNS.',
    selectDnsInterface: 'Select an interface to configure DNS',
    selectDnsResetInterface: 'Select an interface to restore DNS',
    interface: 'Interface',
    chooseInterface: 'Select interface',
    dnsServers: 'DNS Servers',
    dnsPlaceholder: 'e.g. 223.5.5.5, 119.29.29.29',
    applyDns: 'Apply DNS',
    automatic: 'Automatic',
    currentConfig: 'Current Config',
    dnsUpdated: (name: string) => `Updated DNS for ${name}`,
    dnsRestored: (name: string) => `Restored automatic DNS for ${name}`,
    status: 'Status',
    loadingNetwork: 'Reading network status',
  },
}

type Messages = typeof messages.zh

function detectLocale(): Locale {
  const savedLocale = window.localStorage.getItem(localeStorageKey)
  if (savedLocale === 'zh' || savedLocale === 'en') {
    return savedLocale
  }

  const language = navigator.languages?.[0] || navigator.language
  return language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

export default function App() {
  const [locale, setLocale] = useState<Locale>(detectLocale)
  const [page, setPage] = useState<Page>('home')
  const [adapters, setAdapters] = useState<Adapter[]>([])
  const [dnsConfigs, setDnsConfigs] = useState<DnsConfig[]>([])
  const [proxyConfig, setProxyConfig] = useState<ProxyConfig | null>(null)
  const [selectedDnsInterface, setSelectedDnsInterface] = useState('')
  const [dnsInput, setDnsInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [adapterActionName, setAdapterActionName] = useState<string | null>(null)
  const [renamingAdapterName, setRenamingAdapterName] = useState<string | null>(null)
  const [isProxyActionPending, setIsProxyActionPending] = useState(false)
  const [activeTab, setActiveTab] = useState('adapters')

  const t = messages[locale]
  const selectedDnsConfig = dnsConfigs.find(config => config.interfaceAlias === selectedDnsInterface)

  function changeLocale(nextLocale: Locale) {
    setLocale(nextLocale)
    window.localStorage.setItem(localeStorageKey, nextLocale)
  }

  async function runRefreshTask(task: () => Promise<void>, notify = false, showLoading = true) {
    if (showLoading) {
      await withLoading(task, notify ? t.statusRefreshed : undefined)
      return
    }

    try {
      await task()
      if (notify) {
        toast.success(t.statusRefreshed)
      }
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : String(error))
    }
  }

  async function refreshAdapters(notify = false, showLoading = true) {
    const task = async () => {
      const nextAdapters = await listAdapters()
      setAdapters(nextAdapters)
    }

    await runRefreshTask(task, notify, showLoading)
  }

  async function refreshAdapterStatuses() {
    try {
      const statuses = await listAdapterStatuses()
      setAdapters(currentAdapters =>
        currentAdapters.map(adapter => {
          const nextStatus = statuses.find(status => status.name === adapter.name)
          return nextStatus ? { ...adapter, status: nextStatus.status } : adapter
        }),
      )
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : String(error))
    }
  }

  async function refreshDnsConfigs(notify = false, showLoading = true) {
    const task = async () => {
      const nextDnsConfigs = await listDnsConfigs()
      const nextInterface = selectedDnsInterface || nextDnsConfigs[0]?.interfaceAlias || ''
      const nextDnsConfig = nextDnsConfigs.find(config => config.interfaceAlias === nextInterface)

      setDnsConfigs(nextDnsConfigs)
      setSelectedDnsInterface(nextInterface)
      setDnsInput(nextDnsConfig?.serverAddresses.join(', ') ?? '')
    }

    await runRefreshTask(task, notify, showLoading)
  }

  async function refreshProxyConfig(notify = false, showLoading = true) {
    const task = async () => {
      const nextProxyConfig = await getProxyConfig()
      setProxyConfig(nextProxyConfig)
    }

    await runRefreshTask(task, notify, showLoading)
  }

  async function refreshCurrentTab(notify = false, showLoading = true) {
    if (activeTab === 'dns') {
      await refreshDnsConfigs(notify, showLoading)
      return
    }

    if (activeTab === 'proxy') {
      await refreshProxyConfig(notify, showLoading)
      return
    }

    await refreshAdapters(notify, showLoading)
  }

  async function disableProxy() {
    try {
      setIsProxyActionPending(true)

      if (isTauriRuntime) {
        const nextProxyConfig = await invoke<ProxyConfig>('disable_proxy')
        setProxyConfig(nextProxyConfig)
      } else {
        setProxyConfig(currentConfig =>
          currentConfig
            ? { ...currentConfig, proxyEnable: false }
            : {
                proxyEnable: false,
                proxyServer: '',
                proxyOverride: '',
                autoConfigUrl: '',
                autoDetect: false,
                registryPath: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
              },
        )
      }

      toast.success(t.proxyTurnedOff)
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : String(error))
    } finally {
      setIsProxyActionPending(false)
    }
  }

  async function enableProxy() {
    try {
      setIsProxyActionPending(true)

      if (isTauriRuntime) {
        const nextProxyConfig = await invoke<ProxyConfig>('enable_proxy')
        setProxyConfig(nextProxyConfig)
      } else {
        setProxyConfig(currentConfig =>
          currentConfig
            ? { ...currentConfig, proxyEnable: true }
            : {
                proxyEnable: true,
                proxyServer: '127.0.0.1:7890',
                proxyOverride: '',
                autoConfigUrl: '',
                autoDetect: false,
                registryPath: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
              },
        )
      }

      toast.success(t.proxyTurnedOn)
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : String(error))
    } finally {
      setIsProxyActionPending(false)
    }
  }

  async function toggleAdapter(name: string, enable: boolean) {
    try {
      setAdapterActionName(name)
      let result: AdapterOperationResult | null = null

      if (isTauriRuntime) {
        result = await invoke<AdapterOperationResult>(enable ? 'enable_adapter' : 'disable_adapter', { name })
      } else {
        result = {
          action: enable ? 'enable' : 'disable',
          requestedName: name,
          before: adapters.find(adapter => adapter.name === name),
          after: adapters.find(adapter => adapter.name === name),
          changed: true,
          message: 'Mock adapter operation completed',
        }
      }

      console.info('[net-dock] adapter operation result', result)
      await refreshAdapters(false, false)

      if (!result) {
        toast.warning(t.adapterNoResult(name))
        return
      }

      if (!result.changed) {
        toast.warning(t.adapterUnchanged(name, result.after?.status ?? 'Unknown'))
        return
      }

      toast.success(enable ? t.adapterEnabled(name) : t.adapterDisabled(name))
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : String(error))
    } finally {
      setAdapterActionName(null)
    }
  }

  async function renameAdapter(oldName: string, newName: string) {
    const trimmedName = newName.trim()
    if (!trimmedName) {
      toast.warning(t.adapterRenameEmpty)
      return
    }

    if (trimmedName === oldName) {
      return
    }

    try {
      setRenamingAdapterName(oldName)
      if (isTauriRuntime) {
        await invoke('rename_adapter', { oldName, newName: trimmedName })
      }
      await Promise.all([refreshAdapters(false, false), refreshDnsConfigs(false, false)])
      toast.success(t.adapterRenamed(oldName, trimmedName))
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : String(error))
    } finally {
      setRenamingAdapterName(null)
    }
  }

  async function setDns() {
    if (!selectedDnsInterface) {
      toast.warning(t.selectDnsInterface)
      return
    }

    const serverAddresses = dnsInput
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)

    await withLoading(async () => {
      if (isTauriRuntime) {
        await invoke('set_dns_servers', { interfaceAlias: selectedDnsInterface, serverAddresses })
      }
      await refreshDnsConfigs(false, false)
    }, t.dnsUpdated(selectedDnsInterface))
  }

  async function clearDns() {
    if (!selectedDnsInterface) {
      toast.warning(t.selectDnsResetInterface)
      return
    }

    await withLoading(async () => {
      if (isTauriRuntime) {
        await invoke('clear_dns_servers', { interfaceAlias: selectedDnsInterface })
      }
      await refreshDnsConfigs(false, false)
    }, t.dnsRestored(selectedDnsInterface))
  }

  async function withLoading(task: () => Promise<void>, successMessage?: string) {
    try {
      setLoading(true)
      await task()
      if (successMessage) {
        toast.success(successMessage)
      }
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refreshAdapters(false)
  }, [])

  useEffect(() => {
    if (activeTab === 'dns' && dnsConfigs.length === 0) {
      void refreshDnsConfigs(false)
    }

    if (activeTab === 'proxy' && !proxyConfig) {
      void refreshProxyConfig(false)
    }
  }, [activeTab])

  useEffect(() => {
    const shouldAutoRefresh = adapters.some(adapter => {
      const status = adapter.status?.trim().toLowerCase()
      return status !== 'disabled' && status !== 'up'
    })

    if (!shouldAutoRefresh) {
      return
    }

    const intervalId = window.setInterval(() => {
      void refreshAdapterStatuses()
    }, 2000)

    return () => window.clearInterval(intervalId)
  }, [adapters])

  if (page === 'settings') {
    return <SettingsPage locale={locale} labels={t} onBack={() => setPage('home')} onChangeLocale={changeLocale} />
  }

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <section className="mx-auto flex min-h-screen max-w-7xl flex-col gap-5 px-5 py-5">
        <Tabs selectedKey={activeTab} onSelectionChange={key => setActiveTab(key.toString())} className="w-full">
          <header className="flex items-center justify-between gap-6 max-lg:flex-wrap">
            <div className="flex shrink-0 items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-lg bg-amber-300 font-black text-slate-950">
                ND
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{t.appSubtitle}</p>
                <h1 className="font-['Avenir_Next',_'Segoe_UI',_sans-serif] text-xl font-semibold">Net Dock</h1>
              </div>
            </div>

            <div className="flex min-w-0 flex-1 items-center justify-end gap-3 max-lg:w-full max-lg:flex-wrap">
              <Tabs.ListContainer className="w-full max-w-md">
                <Tabs.List aria-label={t.networkSections}>
                  <Tabs.Tab id="adapters">
                    {t.adapters}
                    <Tabs.Indicator />
                  </Tabs.Tab>
                  <Tabs.Tab id="proxy">
                    {t.proxy}
                    <Tabs.Indicator />
                  </Tabs.Tab>
                  <Tabs.Tab id="dns">
                    DNS
                    <Tabs.Indicator />
                  </Tabs.Tab>
                </Tabs.List>
              </Tabs.ListContainer>

              <Button isIconOnly variant="secondary" aria-label={t.settings} onPress={() => setPage('settings')}>
                <Gear size={18} />
              </Button>
            </div>
          </header>

          <Tabs.Panel id="adapters" className="pt-0">
            {loading && adapters.length === 0 ? (
              <EmptyLoading label={t.loadingNetwork} />
            ) : (
              <ul className="m-0 grid grid-cols-[repeat(auto-fill,minmax(330px,1fr))] gap-6 p-0">
                {adapters.map(adapter => (
                  <AdapterCard
                    key={adapter.name}
                    adapter={adapter}
                    isPending={adapterActionName === adapter.name || renamingAdapterName === adapter.name}
                    labels={t}
                    onRename={renameAdapter}
                    onToggle={toggleAdapter}
                  />
                ))}
              </ul>
            )}
          </Tabs.Panel>

          <Tabs.Panel id="proxy" className="pt-0">
            {loading && !proxyConfig ? (
              <EmptyLoading label={t.loadingNetwork} />
            ) : proxyConfig ? (
              <ProxyCard
                proxyConfig={proxyConfig}
                isPending={isProxyActionPending}
                labels={t}
                onEnable={() => void enableProxy()}
                onDisable={() => void disableProxy()}
              />
            ) : (
              <p className="text-sm text-slate-500">{t.notConfigured}</p>
            )}
          </Tabs.Panel>

          <Tabs.Panel id="dns" className="pt-0">
            <Card variant="default" className="border border-slate-200/80 shadow-sm">
              <Card.Header>
                <Card.Title>{t.dnsControl}</Card.Title>
                <Card.Description>{t.dnsDescription}</Card.Description>
              </Card.Header>
              <Separator />
              <Card.Content className="grid gap-4 pt-4">
                <div className="grid grid-cols-[minmax(220px,300px)_minmax(300px,1fr)_auto] items-end gap-3 max-lg:grid-cols-1">
                  <Select
                    className="w-full"
                    selectedKey={selectedDnsInterface || null}
                    onSelectionChange={key => {
                      const nextKey = key?.toString() || ''
                      const config = dnsConfigs.find(item => item.interfaceAlias === nextKey)
                      setSelectedDnsInterface(nextKey)
                      setDnsInput(config?.serverAddresses.join(', ') ?? '')
                    }}
                    placeholder={t.chooseInterface}
                    variant="secondary"
                  >
                    <Label>{t.interface}</Label>
                    <Select.Trigger>
                      <Select.Value />
                      <Select.Indicator>
                        <ChevronDown size={16} />
                      </Select.Indicator>
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        {dnsConfigs.map(config => (
                          <ListBox.Item key={config.interfaceAlias} id={config.interfaceAlias} textValue={config.interfaceAlias}>
                            {config.interfaceAlias}
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>

                  <div className="grid gap-1">
                    <Label htmlFor="dns-input">{t.dnsServers}</Label>
                    <Input
                      id="dns-input"
                      className="w-full"
                      placeholder={t.dnsPlaceholder}
                      value={dnsInput}
                      onChange={event => setDnsInput(event.target.value)}
                      variant="secondary"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="primary" onPress={setDns}>
                      {t.applyDns}
                    </Button>
                    <Button variant="secondary" onPress={clearDns}>
                      {t.automatic}
                    </Button>
                  </div>
                </div>

                <Alert status="accent">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>{t.currentConfig}</Alert.Title>
                    <Alert.Description>{dnsConfigText(selectedDnsConfig, t.automatic)}</Alert.Description>
                  </Alert.Content>
                </Alert>
              </Card.Content>
            </Card>
          </Tabs.Panel>

        </Tabs>
      </section>
      <Button
        aria-label={t.refresh}
        className="fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full p-0 shadow-lg"
        variant="primary"
        isPending={loading}
        onPress={() => void refreshCurrentTab(true)}
      >
        {({ isPending }) => (isPending ? <Spinner color="current" size="sm" /> : <RefreshCw size={20} />)}
      </Button>
    </main>
  )
}

function SettingsPage({
  locale,
  labels,
  onBack,
  onChangeLocale,
}: {
  locale: Locale
  labels: Messages
  onBack: () => void
  onChangeLocale: (locale: Locale) => void
}) {
  const [currentVersion, setCurrentVersion] = useState(fallbackAppVersion)
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null)
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null)
  const [updateError, setUpdateError] = useState('')
  const hasUpdate = Boolean(availableUpdate)
  const progressPercent = downloadProgress?.total
    ? Math.min(100, Math.round((downloadProgress.downloaded / downloadProgress.total) * 100))
    : null

  async function checkForUpdates() {
    if (!isTauriRuntime) {
      setAvailableUpdate(null)
      setUpdateError(labels.desktopOnlyUpdate)
      toast.warning(labels.desktopOnlyUpdate)
      return
    }

    try {
      setIsCheckingUpdate(true)
      setUpdateError('')
      setDownloadProgress(null)

      const update = await check()
      setAvailableUpdate(update)

      if (update) {
        toast.success(labels.updateAvailable(update.version))
      } else {
        toast.success(labels.latestVersion)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setUpdateError(message)
      toast.danger(message)
    } finally {
      setIsCheckingUpdate(false)
    }
  }

  async function downloadAndInstallUpdate() {
    if (!availableUpdate) {
      return
    }

    try {
      setIsInstallingUpdate(true)
      setUpdateError('')
      setDownloadProgress({ downloaded: 0, finished: false })

      await availableUpdate.downloadAndInstall(event => {
        setDownloadProgress(currentProgress => nextDownloadProgress(currentProgress, event))
      })

      toast.success(labels.updateInstalled)
      await relaunch()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setUpdateError(message)
      toast.danger(message)
    } finally {
      setIsInstallingUpdate(false)
    }
  }

  useEffect(() => {
    if (!isTauriRuntime) {
      return
    }

    void getVersion()
      .then(setCurrentVersion)
      .catch(error => {
        console.warn('[net-dock] failed to read app version', error)
      })
  }, [])

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <section className="mx-auto flex min-h-screen max-w-7xl flex-col gap-8 px-5 py-5">
        <header className="flex items-center gap-3">
          <Button isIconOnly variant="secondary" aria-label={labels.settings} onPress={onBack}>
            <ArrowLeft size={18} />
          </Button>
          <h1 className="font-['Avenir_Next',_'Segoe_UI',_sans-serif] text-xl font-semibold">{labels.settings}</h1>
        </header>

        <div className="grid max-w-lg gap-3">
          <div className="grid gap-1">
            <h2 className="text-base font-semibold">{labels.language}</h2>
            <p className="text-sm text-slate-500">{labels.languageDescription}</p>
          </div>

          <Tabs
            className="w-full max-w-lg"
            selectedKey={locale}
            onSelectionChange={key => {
              if (key === 'zh' || key === 'en') {
                onChangeLocale(key)
              }
            }}
          >
            <Tabs.ListContainer className="justify-start">
              <Tabs.List
                aria-label={labels.language}
                className="w-fit *:h-6 *:w-fit *:px-3 *:text-sm *:font-normal *:data-[selected=true]:text-accent-foreground"
              >
                <Tabs.Tab id="zh">
                  {labels.chinese}
                  <Tabs.Indicator className="bg-accent" />
                </Tabs.Tab>
                <Tabs.Tab id="en">
                  {labels.english}
                  <Tabs.Indicator className="bg-accent" />
                </Tabs.Tab>
              </Tabs.List>
            </Tabs.ListContainer>
          </Tabs>
        </div>

        <div className="grid max-w-lg gap-3">
          <div className="grid gap-1">
            <h2 className="text-base font-semibold">{labels.updates}</h2>
            <p className="text-sm text-slate-500">{labels.updatesDescription}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Chip color={hasUpdate ? 'accent' : 'default'} variant="soft">
              {labels.currentVersion} {currentVersion}
            </Chip>
            {availableUpdate ? (
              <Chip color="accent" variant="soft">
                {labels.updateAvailable(availableUpdate.version)}
              </Chip>
            ) : null}
          </div>

          <p className={`text-sm ${updateError ? 'text-red-600' : availableUpdate ? 'text-slate-700' : 'text-slate-500'}`}>
            {availableUpdate
              ? labels.updateAvailableDescription(currentVersion, availableUpdate.version)
              : updateError
                ? `${labels.updateCheckFailed}: ${updateError}`
                : labels.latestVersion}
          </p>

          {availableUpdate?.body ? (
            <div className="grid gap-1">
              <h3 className="text-sm font-semibold">{labels.releaseNotes}</h3>
              <p className="whitespace-pre-wrap text-sm text-slate-600">{availableUpdate.body}</p>
            </div>
          ) : null}

          {downloadProgress ? (
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-slate-700">{labels.progress}</span>
                <span className="text-slate-500">
                  {progressPercent === null
                    ? `${formatBytes(downloadProgress.downloaded)} / ${labels.unknownSize}`
                    : `${progressPercent}%`}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-slate-900 transition-[width]"
                  style={{ width: `${progressPercent ?? (downloadProgress.finished ? 100 : 40)}%` }}
                />
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" isPending={isCheckingUpdate} onPress={() => void checkForUpdates()}>
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner color="current" size="sm" /> : <Search size={16} />}
                  {isPending ? labels.checkingUpdates : labels.checkUpdates}
                </>
              )}
            </Button>
            <Button
              variant="primary"
              isDisabled={!availableUpdate || isCheckingUpdate}
              isPending={isInstallingUpdate}
              onPress={() => void downloadAndInstallUpdate()}
            >
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner color="current" size="sm" /> : <Download size={16} />}
                  {isPending ? labels.downloadingUpdate : labels.downloadUpdate}
                </>
              )}
            </Button>
          </div>
        </div>
      </section>
    </main>
  )
}

function AdapterCard({
  adapter,
  isPending,
  labels,
  onRename,
  onToggle,
}: {
  adapter: Adapter
  isPending: boolean
  labels: Messages
  onRename: (oldName: string, newName: string) => Promise<void>
  onToggle: (name: string, enable: boolean) => Promise<void>
}) {
  const isUp = adapter.status?.toLowerCase() === 'up'
  const [isEditing, setIsEditing] = useState(false)
  const [draftName, setDraftName] = useState(adapter.name)

  useEffect(() => {
    setDraftName(adapter.name)
    setIsEditing(false)
  }, [adapter.name])

  async function saveName() {
    await onRename(adapter.name, draftName)
    setIsEditing(false)
  }

  return (
    <li className="relative flex min-h-[202px] list-none flex-col gap-3 rounded-lg border border-[#dcdcdc] bg-white p-4 leading-5 shadow-[0_1px_2px_rgba(0,0,0,0.08)] transition-colors hover:border-gray-500">
      {isPending ? (
        <div className="absolute inset-0 z-20 grid place-items-center rounded-lg bg-white/70 backdrop-blur-[1px]">
          <Spinner />
        </div>
      ) : null}

      <div className="flex flex-row items-center gap-4">
        <div className="relative inline-flex h-8 w-8 shrink-0">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-slate-950 text-white">
            <Cable size={16} />
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-between gap-0.5">
          <div className="min-w-0">
            {isEditing ? (
              <div className="flex items-center gap-2">
                <Input
                  aria-label={labels.cableName}
                  className="min-w-0 flex-1"
                  value={draftName}
                  onChange={event => setDraftName(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      void saveName()
                    }

                    if (event.key === 'Escape') {
                      setDraftName(adapter.name)
                      setIsEditing(false)
                    }
                  }}
                  variant="secondary"
                />
                <Button aria-label="Save" className="h-8 w-8 p-0" size="sm" variant="ghost" onPress={() => void saveName()}>
                  <Check size={15} />
                </Button>
                <Button
                  aria-label="Cancel"
                  className="h-8 w-8 p-0"
                  size="sm"
                  variant="ghost"
                  onPress={() => {
                    setDraftName(adapter.name)
                    setIsEditing(false)
                  }}
                >
                  <X size={15} />
                </Button>
              </div>
            ) : (
              <div className="flex min-w-0 items-center gap-2">
                <h4 className="h-5 min-w-0 max-w-full truncate text-sm font-medium leading-5 text-slate-950">{adapter.name}</h4>
                <Button
                  aria-label="Rename adapter"
                  className="z-10 h-6 w-6 shrink-0 p-0"
                  size="sm"
                  variant="ghost"
                  onPress={() => setIsEditing(true)}
                >
                  <Pencil size={14} />
                </Button>
              </div>
            )}
            <p className="h-5 w-fit max-w-full truncate text-sm leading-5 text-slate-600">
              {adapter.interfaceDescription ?? labels.unknownAdapter}
            </p>
          </div>
        </div>

        <Button aria-label={labels.status} className="z-10 hidden h-8 w-8 shrink-0 p-0" size="sm" variant="ghost">
          <MoreHorizontal size={18} />
        </Button>
      </div>

      <div className="flex h-5 w-fit items-center gap-2">
        <Chip className="max-w-48" variant="soft">
          {labels.ipAddress}: {adapter.ipAddresses.length > 0 ? adapter.ipAddresses.join(', ') : '-'}
        </Chip>
      </div>

      <div className="flex min-w-0 flex-col justify-between gap-0.5">
        <p className="h-5 min-w-0 truncate text-sm font-medium leading-5 text-slate-950">
          {labels.cableName}: <span className="font-mono text-sm font-normal text-slate-600">{adapter.connectionSpecificSuffix || '-'}</span>
        </p>
        <div className="flex h-5 flex-row items-center gap-2">
          <span className="flex-none text-sm text-slate-600">{adapter.status ?? 'Unknown'}</span>
          <Switch
            aria-label={`${adapter.name} ${labels.status}`}
            isSelected={isUp}
            isDisabled={isPending || !adapter.status || adapter.status.toLowerCase() === 'unknown'}
            onChange={selected => void onToggle(adapter.name, selected)}
            size="sm"
          >
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            <Switch.Content className="text-sm text-slate-600">{isUp ? labels.enable : labels.disable}</Switch.Content>
          </Switch>
        </div>
      </div>
    </li>
  )
}

function ProxyCard({
  proxyConfig,
  isPending,
  labels,
  onEnable,
  onDisable,
}: {
  proxyConfig: ProxyConfig
  isPending: boolean
  labels: Messages
  onEnable: () => void
  onDisable: () => void
}) {
  const enabled = proxyConfig.proxyEnable

  return (
    <ul className="m-0 grid grid-cols-[repeat(auto-fill,minmax(330px,1fr))] gap-6 p-0">
      <li className="relative flex min-h-[202px] list-none flex-col gap-3 rounded-lg border border-[#dcdcdc] bg-white p-4 leading-5 shadow-[0_1px_2px_rgba(0,0,0,0.08)] transition-colors hover:border-gray-500">
        <div className="flex flex-row items-center gap-4">
          <div className="relative inline-flex h-8 w-8 shrink-0">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-slate-950 text-white">
              <Gear size={16} />
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col justify-between gap-0.5">
            <h4 className="h-5 min-w-0 max-w-full truncate text-sm font-medium leading-5 text-slate-950">{labels.proxyControl}</h4>
            <p className="h-5 w-fit max-w-full truncate text-sm leading-5 text-slate-600">{labels.proxyDescription}</p>
          </div>

          <Button aria-label={labels.status} className="z-10 hidden h-8 w-8 shrink-0 p-0" size="sm" variant="ghost">
            <MoreHorizontal size={18} />
          </Button>
        </div>

        <div className="flex h-5 w-fit items-center gap-2">
          <Chip variant="soft" color={enabled ? 'success' : 'default'}>
            {enabled ? labels.proxyEnabled : labels.proxyDisabled}
          </Chip>
          <Chip variant="soft">{labels.autoDetect}: {proxyConfig.autoDetect ? labels.yes : labels.no}</Chip>
        </div>

        <div className="flex min-w-0 flex-col justify-between gap-0.5">
          <p className="h-5 min-w-0 truncate text-sm font-medium leading-5 text-slate-950">
            {labels.proxyServer}: <span className="font-mono text-sm font-normal text-slate-600">{proxyConfig.proxyServer || labels.notConfigured}</span>
          </p>
          <p className="h-5 min-w-0 truncate text-sm leading-5 text-slate-600">
            {labels.autoConfigUrl}: {proxyConfig.autoConfigUrl || labels.notConfigured}
          </p>
          <p className="h-5 min-w-0 truncate text-sm leading-5 text-slate-600">
            {labels.proxyOverride}: {proxyConfig.proxyOverride || labels.notConfigured}
          </p>
          <p className="h-5 min-w-0 truncate text-sm leading-5 text-slate-600">
            {labels.registryPath}: <span className="font-mono">{proxyConfig.registryPath}</span>
          </p>
        </div>

        <div className="mt-auto flex h-8 items-center justify-end">
          <Button
            size="sm"
            variant="secondary"
            isPending={isPending}
            onPress={enabled ? onDisable : onEnable}
          >
            {({ isPending }) => (
              <>
                {isPending ? <Spinner color="current" size="sm" /> : null}
                {isPending ? (enabled ? labels.disablingProxy : labels.enablingProxy) : (enabled ? labels.disableProxy : labels.enableProxy)}
              </>
            )}
          </Button>
        </div>
      </li>
    </ul>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="shrink-0 whitespace-nowrap text-slate-500">{label}</span>
      <span className="min-w-0 break-all text-right text-slate-700">{value}</span>
    </div>
  )
}

function EmptyLoading({ label }: { label: string }) {
  return (
    <div className="grid min-h-32 place-items-center">
      <div className="flex items-center gap-3 text-sm text-slate-500">
        <Spinner />
        <span>{label}</span>
      </div>
    </div>
  )
}

function dnsConfigText(config: DnsConfig | undefined, automaticLabel: string) {
  if (!config || config.serverAddresses.length === 0) {
    return automaticLabel
  }

  return config.serverAddresses.join(', ')
}

function nextDownloadProgress(currentProgress: DownloadProgress | null, event: DownloadEvent): DownloadProgress {
  if (event.event === 'Started') {
    return {
      downloaded: 0,
      total: event.data.contentLength,
      finished: false,
    }
  }

  if (event.event === 'Progress') {
    return {
      downloaded: (currentProgress?.downloaded ?? 0) + event.data.chunkLength,
      total: currentProgress?.total,
      finished: false,
    }
  }

  return {
    downloaded: currentProgress?.total ?? currentProgress?.downloaded ?? 0,
    total: currentProgress?.total,
    finished: true,
  }
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`
  }

  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

async function listAdapters() {
  if (isTauriRuntime) {
    return invoke<Adapter[]>('list_adapters')
  }

  return [
    {
      name: 'Ethernet',
      interfaceDescription: 'Intel(R) Ethernet Controller',
      status: 'Up',
      macAddress: '00-11-22-33-44-55',
      linkSpeed: '1 Gbps',
      ipAddresses: ['192.168.1.20'],
      connectionSpecificSuffix: 'nepdi.com.cn',
    },
    {
      name: 'Wi-Fi',
      interfaceDescription: 'Wireless Network Adapter',
      status: 'Disconnected',
      macAddress: '66-77-88-99-AA-BB',
      linkSpeed: '-',
      ipAddresses: [],
      connectionSpecificSuffix: '',
    },
  ]
}

async function listAdapterStatuses() {
  if (isTauriRuntime) {
    return invoke<AdapterStatus[]>('list_adapter_statuses')
  }

  return [
    { name: 'Ethernet', status: 'Up' },
    { name: 'Wi-Fi', status: 'Disconnected' },
  ]
}

async function listDnsConfigs() {
  if (isTauriRuntime) {
    return invoke<DnsConfig[]>('list_dns_configs')
  }

  return [
    { interfaceAlias: 'Ethernet', serverAddresses: ['223.5.5.5', '119.29.29.29'] },
    { interfaceAlias: 'Wi-Fi', serverAddresses: [] },
  ]
}

async function getProxyConfig() {
  if (isTauriRuntime) {
    return invoke<ProxyConfig>('get_proxy_config')
  }

  return {
    proxyEnable: true,
    proxyServer: '127.0.0.1:7890',
    proxyOverride: '<local>',
    autoConfigUrl: '',
    autoDetect: false,
    registryPath: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
  }
}
