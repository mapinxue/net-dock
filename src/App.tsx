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
import { CheckCircle2, ChevronDown, Network, PlugZap, RefreshCw, Shield, Wifi, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'

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

type VpnProfile = {
  name: string
  serverAddress?: string
  tunnelType?: string
  connectionStatus?: string
}

const isTauriRuntime = '__TAURI_INTERNALS__' in window

export default function App() {
  const [adapters, setAdapters] = useState<Adapter[]>([])
  const [dnsConfigs, setDnsConfigs] = useState<DnsConfig[]>([])
  const [vpns, setVpns] = useState<VpnProfile[]>([])
  const [selectedDnsInterface, setSelectedDnsInterface] = useState('')
  const [dnsInput, setDnsInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('adapters')

  const selectedDnsConfig = dnsConfigs.find(config => config.interfaceAlias === selectedDnsInterface)

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
      setDnsInput(dnsConfigText(nextDnsConfig) === '自动获取' ? '' : dnsConfigText(nextDnsConfig))
    }, notify ? '状态已刷新' : undefined)
  }

  async function toggleAdapter(name: string, enable: boolean) {
    await withLoading(async () => {
      if (isTauriRuntime) {
        await invoke(enable ? 'enable_adapter' : 'disable_adapter', { name })
      }
      await refresh(false)
    }, `${enable ? '已启用' : '已禁用'}网卡 ${name}`)
  }

  async function setDns() {
    if (!selectedDnsInterface) {
      toast.warning('请选择要配置 DNS 的接口')
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
    }, `已更新 ${selectedDnsInterface} DNS`)
  }

  async function clearDns() {
    if (!selectedDnsInterface) {
      toast.warning('请选择要恢复 DNS 的接口')
      return
    }

    await withLoading(async () => {
      if (isTauriRuntime) {
        await invoke('clear_dns_servers', { interfaceAlias: selectedDnsInterface })
      }
      await refresh(false)
    }, `已恢复 ${selectedDnsInterface} 自动 DNS`)
  }

  async function toggleVpn(name: string, connect: boolean) {
    await withLoading(async () => {
      if (isTauriRuntime) {
        await invoke(connect ? 'connect_vpn' : 'disconnect_vpn', { name })
      }
      await refresh(false)
    }, `${connect ? '已连接' : '已断开'} VPN ${name}`)
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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#fef3c7,_transparent_32%),linear-gradient(180deg,_#fffaf0_0%,_#f3f7fb_54%,_#edf4f8_100%)] text-slate-900">
      <section className="mx-auto flex min-h-screen max-w-7xl flex-col gap-5 px-5 py-5">
        <header className="flex items-center justify-between gap-6 max-lg:flex-wrap">
          <div className="flex shrink-0 items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-amber-300 font-black text-slate-950">
              ND
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Network Operations</p>
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
                  <Tabs.List aria-label="Network sections" className="w-fit">
                  <Tabs.Tab id="adapters" className="gap-4">
                    <Network size={16} />
                    网卡
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

            <Chip variant="soft">{adapters.length} 网卡</Chip>
            <Chip variant="soft">{vpns.length} VPN</Chip>
            <Button className="gap-4" variant="primary" isPending={loading} onPress={() => void refresh(true)}>
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner color="current" size="sm" /> : <RefreshCw size={18} />}
                  {isPending ? '刷新中' : '刷新'}
                </>
              )}
            </Button>
          </div>
        </header>

        <Tabs selectedKey={activeTab} onSelectionChange={key => setActiveTab(key.toString())} className="w-full">
          <Tabs.Panel id="adapters" className="pt-0">
            <Card variant="default" className="border border-slate-200/80 shadow-sm">
              <Card.Header>
                <Card.Title>网卡切换</Card.Title>
                <Card.Description>启用或禁用 Windows 网络适配器。</Card.Description>
              </Card.Header>
              <Separator />
              <Card.Content className="pt-4">
                {loading && adapters.length === 0 ? (
                  <EmptyLoading />
                ) : (
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3">
                    {adapters.map(adapter => (
                      <AdapterCard key={adapter.name} adapter={adapter} onToggle={toggleAdapter} />
                    ))}
                  </div>
                )}
              </Card.Content>
            </Card>
          </Tabs.Panel>

          <Tabs.Panel id="dns" className="pt-0">
            <Card variant="default" className="border border-slate-200/80 shadow-sm">
              <Card.Header>
                <Card.Title>DNS 控制</Card.Title>
                <Card.Description>为指定接口设置静态 DNS，或恢复系统自动 DNS。</Card.Description>
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
                      setDnsInput(dnsConfigText(config) === '自动获取' ? '' : dnsConfigText(config))
                    }}
                    placeholder="选择接口"
                    variant="secondary"
                  >
                    <Label>接口</Label>
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
                    <Label htmlFor="dns-input">DNS 服务器</Label>
                    <Input
                      id="dns-input"
                      className="w-full"
                      placeholder="例如 223.5.5.5, 119.29.29.29"
                      value={dnsInput}
                      onChange={event => setDnsInput(event.target.value)}
                      variant="secondary"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="primary" onPress={setDns}>
                      应用 DNS
                    </Button>
                    <Button variant="secondary" onPress={clearDns}>
                      自动获取
                    </Button>
                  </div>
                </div>

                <Alert status="accent">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>当前配置</Alert.Title>
                    <Alert.Description>{dnsConfigText(selectedDnsConfig)}</Alert.Description>
                  </Alert.Content>
                </Alert>
              </Card.Content>
            </Card>
          </Tabs.Panel>

          <Tabs.Panel id="vpn" className="pt-0">
            <Card variant="default" className="border border-slate-200/80 shadow-sm">
              <Card.Header>
                <Card.Title>VPN 控制</Card.Title>
                <Card.Description>连接或断开 Windows 已保存的 VPN 配置。</Card.Description>
              </Card.Header>
              <Separator />
              <Card.Content className="pt-4">
                {vpns.length === 0 ? (
                  <p className="text-sm text-slate-500">未发现 VPN 配置。</p>
                ) : (
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3">
                    {vpns.map(vpn => (
                      <VpnCard key={vpn.name} vpn={vpn} onToggle={toggleVpn} />
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

function AdapterCard({ adapter, onToggle }: { adapter: Adapter; onToggle: (name: string, enable: boolean) => Promise<void> }) {
  const isUp = adapter.status?.toLowerCase() === 'up'

  return (
    <Card variant="secondary" className="border border-slate-200/80">
      <Card.Content className="grid gap-4">
        <div className="flex justify-between gap-3">
          <div>
            <h4 className="font-semibold">{adapter.name}</h4>
            <p className="text-sm text-slate-500">{adapter.interfaceDescription ?? '未知适配器'}</p>
          </div>
          <Chip className="gap-4" variant="soft" color={isUp ? 'success' : 'default'}>
            {isUp ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
            {adapter.status ?? 'Unknown'}
          </Chip>
        </div>
        <div className="grid gap-2 text-sm">
          <Meta label="MAC" value={adapter.macAddress ?? '-'} />
          <Meta label="速率" value={adapter.linkSpeed ?? '-'} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="gap-4" size="sm" variant="secondary" onPress={() => onToggle(adapter.name, true)}>
            <PlugZap size={16} />
            启用
          </Button>
          <Button size="sm" variant="danger-soft" onPress={() => onToggle(adapter.name, false)}>
            禁用
          </Button>
        </div>
      </Card.Content>
    </Card>
  )
}

function VpnCard({ vpn, onToggle }: { vpn: VpnProfile; onToggle: (name: string, connect: boolean) => Promise<void> }) {
  const connected = vpn.connectionStatus?.toLowerCase() === 'connected'

  return (
    <Card variant="secondary" className="border border-slate-200/80">
      <Card.Content className="grid gap-4">
        <div className="flex justify-between gap-3">
          <div>
            <h4 className="font-semibold">{vpn.name}</h4>
            <p className="text-sm text-slate-500">{vpn.serverAddress ?? '未配置服务器地址'}</p>
          </div>
          <Chip variant="soft" color={connected ? 'success' : 'default'}>
            {vpn.connectionStatus ?? 'Unknown'}
          </Chip>
        </div>
        <Meta label="隧道类型" value={vpn.tunnelType ?? '-'} />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="primary" onPress={() => onToggle(vpn.name, true)}>
            连接
          </Button>
          <Button size="sm" variant="secondary" onPress={() => onToggle(vpn.name, false)}>
            断开
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

function EmptyLoading() {
  return (
    <div className="grid min-h-32 place-items-center">
      <div className="flex items-center gap-3 text-sm text-slate-500">
        <Spinner />
        <span>读取网络状态</span>
      </div>
    </div>
  )
}

function dnsConfigText(config?: DnsConfig) {
  if (!config || config.serverAddresses.length === 0) {
    return '自动获取'
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
