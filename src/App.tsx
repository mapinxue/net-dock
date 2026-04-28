import { invoke } from '@tauri-apps/api/core'
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
  Tag,
  TagGroup,
  Tabs,
  toast,
} from '@heroui/react'
import { CheckCircle2, ChevronDown, Languages, Network, PlugZap, RefreshCw, Shield, Wifi, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'

type Locale = 'zh' | 'en'

type Adapter = {
  name: string
  interfaceDescription?: string
  status?: string
  macAddress?: string
  linkSpeed?: string
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

type VpnProfile = {
  name: string
  serverAddress?: string
  tunnelType?: string
  connectionStatus?: string
}

const isTauriRuntime = '__TAURI_INTERNALS__' in window

const localeStorageKey = 'net-dock-locale'

const messages = {
  zh: {
    appSubtitle: '网络管理',
    language: '语言',
    chinese: '简体中文',
    english: 'English',
    networkSections: '网络功能',
    adapters: '网卡',
    adapterCount: (count: number) => `${count} 网卡`,
    vpnCount: (count: number) => `${count} VPN`,
    refresh: '刷新',
    refreshing: '刷新中',
    statusRefreshed: '状态已刷新',
    adapterEnabled: (name: string) => `已启用网卡 ${name}`,
    adapterDisabled: (name: string) => `已禁用网卡 ${name}`,
    adapterUnchanged: (name: string, status: string) => `命令已执行，但网卡 ${name} 状态仍为 ${status}`,
    adapterNoResult: (name: string) => `网卡 ${name} 命令没有返回状态信息，请查看控制台日志`,
    unknownAdapter: '未知适配器',
    speed: '速率',
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
    vpnControl: 'VPN 控制',
    vpnDescription: '连接或断开 Windows 已保存的 VPN 配置。',
    noVpns: '未发现 VPN 配置。',
    vpnConnected: (name: string) => `已连接 VPN ${name}`,
    vpnDisconnected: (name: string) => `已断开 VPN ${name}`,
    noServerAddress: '未配置服务器地址',
    tunnelType: '隧道类型',
    connect: '连接',
    disconnect: '断开',
    status: '状态',
    loadingNetwork: '读取网络状态',
  },
  en: {
    appSubtitle: 'Network Operations',
    language: 'Language',
    chinese: '简体中文',
    english: 'English',
    networkSections: 'Network sections',
    adapters: 'Adapters',
    adapterCount: (count: number) => `${count} adapters`,
    vpnCount: (count: number) => `${count} VPN`,
    refresh: 'Refresh',
    refreshing: 'Refreshing',
    statusRefreshed: 'Status refreshed',
    adapterEnabled: (name: string) => `Enabled adapter ${name}`,
    adapterDisabled: (name: string) => `Disabled adapter ${name}`,
    adapterUnchanged: (name: string, status: string) => `Command ran, but adapter ${name} is still ${status}`,
    adapterNoResult: (name: string) => `Adapter ${name} command returned no status details. Check console logs.`,
    unknownAdapter: 'Unknown adapter',
    speed: 'Speed',
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
    vpnControl: 'VPN Control',
    vpnDescription: 'Connect or disconnect saved Windows VPN profiles.',
    noVpns: 'No VPN profiles found.',
    vpnConnected: (name: string) => `Connected VPN ${name}`,
    vpnDisconnected: (name: string) => `Disconnected VPN ${name}`,
    noServerAddress: 'No server address configured',
    tunnelType: 'Tunnel type',
    connect: 'Connect',
    disconnect: 'Disconnect',
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
  const [adapters, setAdapters] = useState<Adapter[]>([])
  const [dnsConfigs, setDnsConfigs] = useState<DnsConfig[]>([])
  const [vpns, setVpns] = useState<VpnProfile[]>([])
  const [selectedDnsInterface, setSelectedDnsInterface] = useState('')
  const [dnsInput, setDnsInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('adapters')

  const t = messages[locale]
  const selectedDnsConfig = dnsConfigs.find(config => config.interfaceAlias === selectedDnsInterface)

  function changeLocale(nextLocale: Locale) {
    setLocale(nextLocale)
    window.localStorage.setItem(localeStorageKey, nextLocale)
  }

  async function refresh(notify = false) {
    await withLoading(async () => {
      const [nextAdapters, nextDnsConfigs, nextVpns] = await Promise.all([
        listAdapters(),
        listDnsConfigs(),
        listVpnProfiles(),
      ])

      const nextInterface = selectedDnsInterface || nextDnsConfigs[0]?.interfaceAlias || ''
      const nextDnsConfig = nextDnsConfigs.find(config => config.interfaceAlias === nextInterface)

      setAdapters(nextAdapters)
      setDnsConfigs(nextDnsConfigs)
      setVpns(nextVpns)
      setSelectedDnsInterface(nextInterface)
      setDnsInput(nextDnsConfig?.serverAddresses.join(', ') ?? '')
    }, notify ? t.statusRefreshed : undefined)
  }

  async function toggleAdapter(name: string, enable: boolean) {
    await withLoading(async () => {
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
      await refresh(false)

      if (!result) {
        toast.warning(t.adapterNoResult(name))
        return
      }

      if (!result.changed) {
        toast.warning(t.adapterUnchanged(name, result.after?.status ?? 'Unknown'))
        return
      }

      toast.success(enable ? t.adapterEnabled(name) : t.adapterDisabled(name))
    })
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
      await refresh(false)
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
      await refresh(false)
    }, t.dnsRestored(selectedDnsInterface))
  }

  async function toggleVpn(name: string, connect: boolean) {
    await withLoading(async () => {
      if (isTauriRuntime) {
        await invoke(connect ? 'connect_vpn' : 'disconnect_vpn', { name })
      }
      await refresh(false)
    }, connect ? t.vpnConnected(name) : t.vpnDisconnected(name))
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
    void refresh(false)
  }, [])

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <section className="mx-auto flex min-h-screen max-w-7xl flex-col gap-5 px-5 py-5">
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
            <Tabs
              className="min-w-0"
              selectedKey={activeTab}
              onSelectionChange={key => setActiveTab(key.toString())}
              variant="secondary"
            >
                <Tabs.ListContainer>
                  <Tabs.List aria-label={t.networkSections} className="w-fit">
                  <Tabs.Tab id="adapters" className="gap-4">
                    <Network size={16} />
                    {t.adapters}
                    <Tabs.Indicator />
                  </Tabs.Tab>
                  <Tabs.Tab id="dns" className="gap-4">
                    <Tabs.Separator />
                    <Wifi size={16} />
                    <span className="inline-flex items-center gap-0">
                      <span>DNS</span>
                      <InlineWipTag />
                    </span>
                    <Tabs.Indicator />
                  </Tabs.Tab>
                  <Tabs.Tab id="vpn" className="gap-4">
                    <Tabs.Separator />
                    <Shield size={16} />
                    <span className="inline-flex items-center gap-0">
                      <span>VPN</span>
                      <InlineWipTag />
                    </span>
                    <Tabs.Indicator />
                  </Tabs.Tab>
                </Tabs.List>
              </Tabs.ListContainer>
            </Tabs>

            <Select
              className="w-36"
              selectedKey={locale}
              onSelectionChange={key => {
                if (key === 'zh' || key === 'en') {
                  changeLocale(key)
                }
              }}
              aria-label={t.language}
              variant="secondary"
            >
              <Select.Trigger>
                <Languages size={16} />
                <Select.Value />
                <Select.Indicator>
                  <ChevronDown size={16} />
                </Select.Indicator>
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  <ListBox.Item id="zh" textValue={t.chinese}>
                    {t.chinese}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                  <ListBox.Item id="en" textValue={t.english}>
                    {t.english}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                </ListBox>
              </Select.Popover>
            </Select>
            <Chip variant="soft">{t.adapterCount(adapters.length)}</Chip>
            <Chip variant="soft">{t.vpnCount(vpns.length)}</Chip>
            <Button className="gap-4" variant="primary" isPending={loading} onPress={() => void refresh(true)}>
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner color="current" size="sm" /> : <RefreshCw size={18} />}
                  {isPending ? t.refreshing : t.refresh}
                </>
              )}
            </Button>
          </div>
        </header>

        <Tabs selectedKey={activeTab} onSelectionChange={key => setActiveTab(key.toString())} className="w-full">
          <Tabs.Panel id="adapters" className="pt-0">
            {loading && adapters.length === 0 ? (
              <EmptyLoading label={t.loadingNetwork} />
            ) : (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3">
                {adapters.map(adapter => (
                  <AdapterCard key={adapter.name} adapter={adapter} labels={t} onToggle={toggleAdapter} />
                ))}
              </div>
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

          <Tabs.Panel id="vpn" className="pt-0">
            <Card variant="default" className="border border-slate-200/80 shadow-sm">
              <Card.Header>
                <Card.Title>{t.vpnControl}</Card.Title>
                <Card.Description>{t.vpnDescription}</Card.Description>
              </Card.Header>
              <Separator />
              <Card.Content className="pt-4">
                {vpns.length === 0 ? (
                  <p className="text-sm text-slate-500">{t.noVpns}</p>
                ) : (
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3">
                    {vpns.map(vpn => (
                      <VpnCard key={vpn.name} vpn={vpn} labels={t} onToggle={toggleVpn} />
                    ))}
                  </div>
                )}
              </Card.Content>
            </Card>
          </Tabs.Panel>
        </Tabs>
      </section>
    </main>
  )
}

function AdapterCard({
  adapter,
  labels,
  onToggle,
}: {
  adapter: Adapter
  labels: Messages
  onToggle: (name: string, enable: boolean) => Promise<void>
}) {
  const isUp = adapter.status?.toLowerCase() === 'up'

  return (
    <Card variant="default" className="border border-slate-200/80 bg-white shadow-sm">
      <Card.Content className="grid gap-4">
        <div className="flex justify-between gap-3">
          <div>
            <h4 className="font-semibold">{adapter.name}</h4>
            <p className="text-sm text-slate-500">{adapter.interfaceDescription ?? labels.unknownAdapter}</p>
          </div>
          <Chip className="gap-4" variant="soft" color={isUp ? 'success' : 'default'}>
            {isUp ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
            {adapter.status ?? 'Unknown'}
          </Chip>
        </div>
        <div className="grid gap-2 text-sm">
          <Meta label="MAC" value={adapter.macAddress ?? '-'} />
          <Meta label={labels.speed} value={adapter.linkSpeed ?? '-'} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="gap-4" size="sm" variant="secondary" onPress={() => onToggle(adapter.name, true)}>
            <PlugZap size={16} />
            {labels.enable}
          </Button>
          <Button size="sm" variant="danger-soft" onPress={() => onToggle(adapter.name, false)}>
            {labels.disable}
          </Button>
        </div>
      </Card.Content>
    </Card>
  )
}

function VpnCard({
  vpn,
  labels,
  onToggle,
}: {
  vpn: VpnProfile
  labels: Messages
  onToggle: (name: string, connect: boolean) => Promise<void>
}) {
  const connected = vpn.connectionStatus?.toLowerCase() === 'connected'

  return (
    <Card variant="secondary" className="border border-slate-200/80">
      <Card.Content className="grid gap-4">
        <div className="flex justify-between gap-3">
          <div>
            <h4 className="font-semibold">{vpn.name}</h4>
            <p className="text-sm text-slate-500">{vpn.serverAddress ?? labels.noServerAddress}</p>
          </div>
          <Chip variant="soft" color={connected ? 'success' : 'default'}>
            {vpn.connectionStatus ?? 'Unknown'}
          </Chip>
        </div>
        <Meta label={labels.tunnelType} value={vpn.tunnelType ?? '-'} />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="primary" onPress={() => onToggle(vpn.name, true)}>
            {labels.connect}
          </Button>
          <Button size="sm" variant="secondary" onPress={() => onToggle(vpn.name, false)}>
            {labels.disconnect}
          </Button>
        </div>
      </Card.Content>
    </Card>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="break-all text-right text-slate-700">{value}</span>
    </div>
  )
}

function InlineWipTag() {
  return (
    <TagGroup aria-label="Work in progress" className="ml-0 shrink-0" size="sm" variant="surface">
      <Label className="sr-only">Status</Label>
      <TagGroup.List className="gap-0">
        <Tag id="wip" className="px-1.5 font-semibold tracking-[0.12em] uppercase">
          WIP
        </Tag>
      </TagGroup.List>
    </TagGroup>
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
    },
    {
      name: 'Wi-Fi',
      interfaceDescription: 'Wireless Network Adapter',
      status: 'Disconnected',
      macAddress: '66-77-88-99-AA-BB',
      linkSpeed: '-',
    },
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

async function listVpnProfiles() {
  if (isTauriRuntime) {
    return invoke<VpnProfile[]>('list_vpn_profiles')
  }

  return [
    {
      name: 'Office VPN',
      serverAddress: 'vpn.example.com',
      tunnelType: 'Automatic',
      connectionStatus: 'Disconnected',
    },
  ]
}
