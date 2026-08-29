import { useEffect, useMemo, useState } from "react";
import {
  AppstoreOutlined,
  BookOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
  CustomerServiceFilled,
  DownOutlined,
  EyeOutlined,
  FileTextOutlined,
  LinkOutlined,
  MenuFoldOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  ShopOutlined,
  ShoppingOutlined,
  UnorderedListOutlined
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Checkbox,
  Empty,
  Form,
  Image,
  Input,
  Layout,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
  message
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type {
  DistributionBatch,
  DistributionStrategy,
  OfferSnapshot,
  WechatStore
} from "../shared/contracts";
import logoUrl from "../../assets/ziying-distribution-icon-64-v2.png";
import {
  alibabaAuthorizationUrl,
  bindWechatStore,
  createDistributionBatch,
  importOffers,
  listDistributionBatches,
  listOffers,
  listStores,
  loadAppState,
  loadDistributionBatch,
  removeStore,
  type AppState
} from "./api";

type PageKey = "link" | "recommend" | "search" | "records";

const PAGE_TITLES: Record<PageKey, string> = {
  link: "链接铺货",
  recommend: "货源推荐",
  search: "货源搜索",
  records: "铺货记录"
};

const STRATEGIES: Array<{ value: DistributionStrategy; label: string }> = [
  { value: "ORDERED_AVERAGED", label: "顺序平均分配" },
  { value: "RANDOM_AVERAGED", label: "随机平均分配" },
  { value: "RANDOM", label: "随机分配" },
  { value: "REPEATED", label: "重复分配" }
];

const STRATEGY_LABELS = Object.fromEntries(STRATEGIES.map((item) => [item.value, item.label]));

const { Header, Sider, Content } = Layout;
const { Text, Title } = Typography;

export function App() {
  const [page, setPage] = useState<PageKey>(() => pageFromHash());
  const [appState, setAppState] = useState<AppState>();
  const [offers, setOffers] = useState<OfferSnapshot[]>([]);
  const [stores, setStores] = useState<WechatStore[]>([]);
  const [batches, setBatches] = useState<DistributionBatch[]>([]);
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [bindModalOpen, setBindModalOpen] = useState(false);
  const [storeLoading, setStoreLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  async function refreshWorkspace() {
    const [nextOffers, nextStores, nextBatches] = await Promise.all([
      listOffers(),
      listStores(),
      listDistributionBatches()
    ]);
    setOffers(nextOffers);
    setStores(nextStores);
    setBatches(nextBatches);
    setSelectedStoreIds((current) => current.filter((id) => nextStores.some((store) => store.id === id)));
  }

  useEffect(() => {
    loadAppState().then(async (state) => {
      setAppState(state);
      if (state.connected) await refreshWorkspace();
    }).catch((error) => messageApi.error(errorMessage(error, "无法读取应用状态")));
  }, [messageApi]);

  useEffect(() => {
    const handler = () => setPage(pageFromHash());
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  function navigate(next: PageKey) {
    window.location.hash = next;
    setPage(next);
  }

  async function handleBindStore(values: { name: string; appId: string; appSecret: string }) {
    setStoreLoading(true);
    try {
      const store = await bindWechatStore(values);
      await refreshWorkspace();
      setSelectedStoreIds((current) => [...new Set([...current, store.id])]);
      setBindModalOpen(false);
      messageApi.success(store.status === "NORMAL" ? "微信小店绑定成功" : "店铺已保存，请按提示修复配置");
    } catch (error) {
      messageApi.error(errorMessage(error, "店铺绑定失败"));
    } finally {
      setStoreLoading(false);
    }
  }

  async function handleRemoveStore(storeId: string) {
    await removeStore(storeId);
    await refreshWorkspace();
    messageApi.success("店铺已解绑");
  }

  const selectedStores = stores.filter((store) => selectedStoreIds.includes(store.id));

  return (
    <Layout className="app-shell">
      {contextHolder}
      <div className="platform-bar">
        <span className="platform-user">{appState?.session?.alibabaUserId ?? "1688用户"}</span>
        <div className="platform-links">
          <span>1688首页</span><span>1688服务市场</span><span>优选工作台首页</span><span className="buyer-chip">买家</span>
        </div>
      </div>
      <Header className="app-header">
        <div className="app-brand">
          <Image preview={false} src={logoUrl} width={38} height={38} alt="电潮分销" />
          <span>电潮分销</span>
          <MenuFoldOutlined className="fold-icon" />
        </div>
        <div className="header-account">
          <span>联系客服：</span>
          <CustomerServiceFilled className="service-icon" />
          <span className="account-avatar">{(appState?.session?.alibabaUserId ?? "用").slice(0, 1)}</span>
          <span>{appState?.session?.alibabaUserId ?? "未连接"}</span>
        </div>
      </Header>
      <Layout className="main-layout">
        <Sider width={240} className="sidebar" theme="light">
          <div className="nav-group-title"><ShoppingOutlined /><span>铺货</span><DownOutlined /></div>
          {(Object.keys(PAGE_TITLES) as PageKey[]).map((key) => (
            <button
              key={key}
              className={`nav-item ${page === key ? "active" : ""}`}
              onClick={() => navigate(key)}
            >
              {PAGE_TITLES[key]}
            </button>
          ))}
          <SidebarGroup icon={<AppstoreOutlined />} label="模板" />
          <SidebarGroup icon={<UnorderedListOutlined />} label="订单" />
          <SidebarGroup icon={<ShopOutlined />} label="店铺" onClick={() => setStoreModalOpen(true)} />
          <SidebarGroup icon={<BookOutlined />} label="使用教程" caret={false} />
        </Sider>
        <Content className="workspace">
          {!appState?.connected && appState?.mode === "real" ? (
            <Alert
              className="connection-alert"
              type="warning"
              showIcon
              message="请先连接1688账号"
              description="完成授权后才能读取真实商品、搜索货源并创建铺货任务。"
              action={<Button type="primary" href={alibabaAuthorizationUrl(`/#${page}`)}>连接1688账号</Button>}
            />
          ) : (
            <>
              {page === "link" && (
                <LinkDistributionPage
                  selectedStores={selectedStores}
                  onChooseStores={() => setStoreModalOpen(true)}
                  onOpenBind={() => setBindModalOpen(true)}
                  onCreated={async () => {
                    await refreshWorkspace();
                    navigate("records");
                  }}
                />
              )}
              {page === "recommend" && (
                <RecommendPage
                  offers={offers}
                  stores={selectedStores}
                  onNeedStores={() => setStoreModalOpen(true)}
                  onRefresh={refreshWorkspace}
                  onCreated={async () => { await refreshWorkspace(); navigate("records"); }}
                />
              )}
              {page === "search" && (
                <SearchPage
                  offers={offers}
                  stores={selectedStores}
                  onNeedStores={() => setStoreModalOpen(true)}
                  onRefresh={refreshWorkspace}
                  onCreated={async () => { await refreshWorkspace(); navigate("records"); }}
                />
              )}
              {page === "records" && <RecordsPage batches={batches} onRefresh={refreshWorkspace} />}
            </>
          )}
        </Content>
      </Layout>

      <StoreSelectorModal
        open={storeModalOpen}
        stores={stores}
        selectedIds={selectedStoreIds}
        onChange={setSelectedStoreIds}
        onClose={() => setStoreModalOpen(false)}
        onBind={() => { setStoreModalOpen(false); setBindModalOpen(true); }}
        onRemove={handleRemoveStore}
      />
      <BindStoreModal
        open={bindModalOpen}
        loading={storeLoading}
        onCancel={() => setBindModalOpen(false)}
        onSubmit={handleBindStore}
      />
    </Layout>
  );
}

function SidebarGroup({ icon, label, caret = true, onClick }: {
  icon: React.ReactNode;
  label: string;
  caret?: boolean;
  onClick?: () => void;
}) {
  return (
    <button className="sidebar-group" onClick={onClick}>
      <span>{icon}</span><span>{label}</span>{caret && <DownOutlined />}
    </button>
  );
}

function LinkDistributionPage({ selectedStores, onChooseStores, onOpenBind, onCreated }: {
  selectedStores: WechatStore[];
  onChooseStores: () => void;
  onOpenBind: () => void;
  onCreated: () => Promise<void>;
}) {
  const [references, setReferences] = useState("");
  const [strategy, setStrategy] = useState<DistributionStrategy>("ORDERED_AVERAGED");
  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  async function submit() {
    const values = uniqueLines(references);
    if (values.length === 0) return messageApi.warning("请输入1688商品链接");
    if (values.length > 20) return messageApi.warning("单次最多铺货20个商品");
    if (selectedStores.length === 0) return messageApi.warning("请先选择要铺货的店铺");
    setLoading(true);
    try {
      const imported = await importOffers(values);
      await createDistributionBatch({
        offerIds: imported.map((offer) => offer.offerId),
        storeIds: selectedStores.map((store) => store.id),
        strategy
      });
      messageApi.success(`已创建 ${imported.length * selectedStores.length} 个铺货任务`);
      setReferences("");
      await onCreated();
    } catch (error) {
      messageApi.error(errorMessage(error, "铺货任务创建失败"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="content-card link-page">
      {contextHolder}
      <div className="card-heading"><Title level={2}>链接铺货</Title><LinkOutlined /></div>
      <div className="form-block">
        <label className="required-label">商品链接(仅支持1688商品,示例:https://detail.1688.com/offer/977657000203.html)</label>
        <Input.TextArea
          value={references}
          onChange={(event) => setReferences(event.target.value)}
          rows={6}
          maxLength={10000}
          placeholder="请输入1688商品链接，可以输入多个，每行一个"
        />
        <div className="field-stack">
          <label>请选择链接分配方式</label>
          <Radio.Group
            className="strategy-buttons"
            value={strategy}
            onChange={(event) => setStrategy(event.target.value)}
            optionType="button"
            options={STRATEGIES}
          />
        </div>
        <div className="field-stack">
          <label className="required-label">请选择要铺货的店铺</label>
          <Space wrap>
            <Button type="primary" onClick={onChooseStores}>选择店铺</Button>
            <Button icon={<PlusOutlined />} onClick={onOpenBind}>绑定新店铺</Button>
          </Space>
          {selectedStores.length > 0 && (
            <div className="selected-store-row">
              {selectedStores.map((store) => <Tag key={store.id} color="processing">{store.name}</Tag>)}
            </div>
          )}
        </div>
        <Space className="primary-actions">
          <Button type="primary" size="large" loading={loading} onClick={submit}>立即铺货</Button>
          <Button size="large" onClick={() => { setReferences(""); setStrategy("ORDERED_AVERAGED"); }}>重置</Button>
        </Space>
        <div className="usage-guide">
          <h3>使用说明：</h3>
          <ol>
            <li>复制1688平台上的商品链接</li>
            <li>粘贴到上方输入框中，支持批量铺货（每行一个链接，单次最多20个）</li>
            <li>选择分配方式和目标店铺，点击“立即铺货”</li>
            <li>铺货进度可在“铺货记录”中查看</li>
          </ol>
        </div>
      </div>
    </section>
  );
}

function RecommendPage({ offers, stores, onNeedStores, onRefresh, onCreated }: {
  offers: OfferSnapshot[];
  stores: WechatStore[];
  onNeedStores: () => void;
  onRefresh: () => Promise<void>;
  onCreated: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const visible = offers.filter((offer) => !query.trim()
    || offer.title.toLowerCase().includes(query.trim().toLowerCase())
    || offer.offerId.includes(query.trim()));

  async function distribute() {
    if (selected.length === 0) return messageApi.warning("请先选择商品");
    if (stores.length === 0) { onNeedStores(); return; }
    setLoading(true);
    try {
      await createDistributionBatch({
        offerIds: selected,
        storeIds: stores.map((store) => store.id),
        strategy: "ORDERED_AVERAGED"
      });
      messageApi.success("批量铺货任务已创建");
      await onCreated();
    } catch (error) {
      messageApi.error(errorMessage(error, "创建任务失败"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="recommend-page">
      {contextHolder}
      <section className="recommend-hero content-card">
        <div className="recommend-head-row">
          <SourcingWordmark />
          <Input.Search
            className="recommend-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="请输入关键词"
            enterButton="搜索"
          />
          <Button className="batch-search-button">批量搜索</Button>
        </div>
        <div className="insight-grid">
          <InsightCard title="找榜单"><span className="rank-chip hot">热销榜</span><span className="rank-chip trend">趋势榜</span><span className="rank-chip topic">热搜榜</span></InsightCard>
          <InsightCard title="代发销量榜"><b>优质分销货源精选</b><Text type="secondary">按真实导入记录展示</Text></InsightCard>
          <InsightCard title="找服务"><b>平台精选代发服务</b><Text type="secondary">为铺货提供稳定货源</Text></InsightCard>
          <InsightCard title="分销等级"><b>先采后付专属提额</b><Text type="secondary">经营相关问题可查看学习中心</Text></InsightCard>
        </div>
        <div className="brand-banner"><b>1688品牌分销</b><span>01 选择目标品牌</span><span>02 申请品牌授权</span><span>03 选品铺货</span><a>前往品牌专区 ›</a></div>
      </section>
      <section className="content-card source-panel">
        <div className="source-panel-title"><Title level={3}>推荐货源</Title><Button icon={<ReloadOutlined />} onClick={onRefresh}>刷新</Button></div>
        <FilterRows />
        <div className="sort-row"><b>综合排序</b><span>代发价格</span><span>近30天代发订单数</span><span>近7天代发订单数</span><span>上架时间</span><span>30天复购率</span></div>
        {visible.length === 0 ? (
          <Empty className="source-empty" description="暂无已导入货源；先在链接铺货中导入真实1688商品" />
        ) : (
          <OfferGrid offers={visible} selected={selected} onChange={setSelected} />
        )}
      </section>
      <div className="batch-footer">
        <Checkbox
          checked={visible.length > 0 && visible.every((offer) => selected.includes(offer.offerId))}
          onChange={(event) => setSelected(event.target.checked ? visible.map((offer) => offer.offerId) : [])}
        >全选</Checkbox>
        <span>已选 <b>{selected.length}</b> 个商品</span>
        <Button type="primary" loading={loading} onClick={distribute}>批量铺货</Button>
      </div>
    </div>
  );
}

function SearchPage({ offers, stores, onNeedStores, onRefresh, onCreated }: {
  offers: OfferSnapshot[];
  stores: WechatStore[];
  onNeedStores: () => void;
  onRefresh: () => Promise<void>;
  onCreated: () => Promise<void>;
}) {
  const [mode, setMode] = useState("keyword");
  const [query, setQuery] = useState("");
  const [batchInput, setBatchInput] = useState("");
  const [batchOpen, setBatchOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const results = useMemo(() => offers.filter((offer) => !query.trim()
    || offer.title.toLowerCase().includes(query.trim().toLowerCase())
    || offer.offerId.includes(query.trim())), [offers, query]);

  async function searchOrImport() {
    if (!query.trim()) return;
    if (mode === "product") {
      setLoading(true);
      try {
        const imported = await importOffers([query.trim()]);
        await onRefresh();
        setSelected(imported.map((offer) => offer.offerId));
      } catch (error) {
        messageApi.error(errorMessage(error, "商品链接读取失败"));
      } finally { setLoading(false); }
    }
  }

  async function batchImport() {
    const values = uniqueLines(batchInput);
    if (values.length === 0) return;
    if (values.length > 20) return messageApi.warning("单次最多20条");
    setLoading(true);
    try {
      const imported = await importOffers(values);
      await onRefresh();
      setSelected(imported.map((offer) => offer.offerId));
      setBatchOpen(false);
      messageApi.success(`已读取${imported.length}个商品`);
    } catch (error) {
      messageApi.error(errorMessage(error, "批量读取失败"));
    } finally { setLoading(false); }
  }

  async function distribute() {
    if (selected.length === 0) return messageApi.warning("请先选择商品");
    if (stores.length === 0) { onNeedStores(); return; }
    await createDistributionBatch({
      offerIds: selected,
      storeIds: stores.map((store) => store.id),
      strategy: "ORDERED_AVERAGED"
    });
    await onCreated();
  }

  return (
    <section className="content-card search-page">
      {contextHolder}
      <SourcingWordmark large />
      <div className="search-tabs">
        {([
          ["keyword", "搜关键词"], ["image", "搜图片"], ["imageUrl", "图片链接"],
          ["product", "商品链接"], ["store", "店铺链接"]
        ] as const).map(([value, label]) => (
          <button key={value} className={mode === value ? "active" : ""} onClick={() => setMode(value)}>{label}</button>
        ))}
      </div>
      <div className="central-search-row">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onPressEnter={searchOrImport}
          placeholder={mode === "keyword" ? "请输入关键词" : mode === "product" ? "请输入1688商品链接" : "此搜索方式将在接口获权后开放"}
          disabled={["image", "imageUrl", "store"].includes(mode)}
        />
        <Button type="primary" loading={loading} onClick={searchOrImport}>搜索</Button>
        <Button onClick={() => setBatchOpen(true)}>批量搜索</Button>
      </div>
      {batchOpen && (
        <div className="batch-search-panel">
          <Input.TextArea
            value={batchInput}
            onChange={(event) => setBatchInput(event.target.value)}
            placeholder="可在此处批量粘贴商品链接或Offer ID，用换行隔开\n单次最多20条"
          />
          <div className="batch-search-actions">
            <Button type="primary" loading={loading} onClick={batchImport}>确定</Button>
            <Button onClick={() => setBatchOpen(false)}>取消</Button>
          </div>
        </div>
      )}
      {["image", "imageUrl", "store"].includes(mode) && (
        <Alert className="capability-alert" type="info" showIcon message="该搜索能力尚未取得当前1688应用接口权限" />
      )}
      {(query.trim() || selected.length > 0) && (
        <div className="search-results">
          <div className="search-result-title"><b>搜索结果</b><span>共 {results.length} 条</span></div>
          {results.length ? <OfferGrid offers={results} selected={selected} onChange={setSelected} /> : <Empty description="没有匹配的已导入商品" />}
          {selected.length > 0 && <Button type="primary" className="search-distribute" onClick={distribute}>批量铺货（{selected.length}）</Button>}
        </div>
      )}
    </section>
  );
}

function RecordsPage({ batches, onRefresh }: { batches: DistributionBatch[]; onRefresh: () => Promise<void> }) {
  const [detail, setDetail] = useState<DistributionBatch>();
  const [loading, setLoading] = useState(false);
  const columns: ColumnsType<DistributionBatch> = [
    { title: "记录ID", dataIndex: "recordNumber", width: 130 },
    { title: "分发类型", dataIndex: "strategy", render: (value) => STRATEGY_LABELS[value] ?? value },
    { title: "目标店铺数", dataIndex: "targetStoreCount", render: (value) => `${value} 个店铺` },
    { title: "任务数", dataIndex: "taskCount", render: (value) => `${value} 个任务` },
    { title: "修改规则ID", key: "ruleId", render: () => "-" },
    { title: "创建时间", dataIndex: "createdAt", render: formatDateTime },
    { title: "更新时间", dataIndex: "updatedAt", render: formatDateTime },
    {
      title: "操作",
      render: (_, batch) => <Button type="link" icon={<EyeOutlined />} onClick={async () => {
        setLoading(true);
        try { setDetail(await loadDistributionBatch(batch.id)); } finally { setLoading(false); }
      }}>详情</Button>
    }
  ];
  const jobColumns: ColumnsType<NonNullable<DistributionBatch["jobs"]>[number]> = [
    { title: "1688商品", dataIndex: "offerTitle", ellipsis: true },
    { title: "Offer ID", dataIndex: "offerId", width: 150 },
    { title: "目标店铺", dataIndex: "storeName", width: 160 },
    { title: "任务状态", dataIndex: "status", width: 120, render: (value) => <StatusTag status={value} /> },
    { title: "说明", dataIndex: "statusMessage", ellipsis: true }
  ];
  return (
    <section className="content-card records-page">
      <div className="card-heading records-heading"><Title level={2}>铺货记录</Title><Button type="primary" icon={<ReloadOutlined />} onClick={onRefresh}>刷新</Button></div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={batches}
        columns={columns}
        locale={{ emptyText: <Empty description="暂无铺货记录" /> }}
        pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
      />
      <Modal title={`铺货记录详情${detail ? ` #${detail.recordNumber}` : ""}`} open={Boolean(detail)} onCancel={() => setDetail(undefined)} footer={null} width={1000}>
        <Table rowKey="id" dataSource={detail?.jobs ?? []} columns={jobColumns} pagination={false} scroll={{ x: 860 }} />
      </Modal>
    </section>
  );
}

function StoreSelectorModal({ open, stores, selectedIds, onChange, onClose, onBind, onRemove }: {
  open: boolean;
  stores: WechatStore[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onClose: () => void;
  onBind: () => void;
  onRemove: (id: string) => Promise<void>;
}) {
  return (
    <Modal title="选择铺货店铺" open={open} onCancel={onClose} onOk={onClose} okText="确定" cancelText="取消" width={720}>
      <div className="store-modal-toolbar"><span>已绑定 {stores.length} 个微信小店</span><Button type="primary" icon={<PlusOutlined />} onClick={onBind}>绑定新店铺</Button></div>
      {stores.length === 0 ? <Empty description="尚未绑定微信小店" /> : (
        <Checkbox.Group value={selectedIds} onChange={(values) => onChange(values as string[])} className="store-grid">
          {stores.map((store) => (
            <div className={`store-card ${store.status !== "NORMAL" ? "disabled" : ""}`} key={store.id}>
              <Checkbox value={store.id} disabled={store.status !== "NORMAL"}>
                <div className="store-card-main"><ShopOutlined /><div><b>{store.name}</b><span>{store.appIdMasked}</span></div></div>
              </Checkbox>
              <div className="store-card-foot"><StatusTag status={store.status} />
                <Popconfirm title="确定解绑该店铺吗？" onConfirm={() => onRemove(store.id)} okText="解绑" cancelText="取消">
                  <Button type="link" danger size="small">解绑</Button>
                </Popconfirm>
              </div>
              {store.statusMessage && <Text type="secondary">{store.statusMessage}</Text>}
            </div>
          ))}
        </Checkbox.Group>
      )}
    </Modal>
  );
}

function BindStoreModal({ open, loading, onCancel, onSubmit }: {
  open: boolean;
  loading: boolean;
  onCancel: () => void;
  onSubmit: (values: { name: string; appId: string; appSecret: string }) => Promise<void>;
}) {
  const [form] = Form.useForm();
  return (
    <Modal
      title="绑定微信小店"
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      confirmLoading={loading}
      okText="验证并绑定"
      cancelText="取消"
      destroyOnHidden
    >
      <Alert type="info" showIcon message="请填写微信小店自研 AppID 与 AppSecret。凭证只提交到服务端并加密保存，不会在页面回显。" />
      <Form form={form} layout="vertical" onFinish={onSubmit} className="bind-store-form">
        <Form.Item name="name" label="店铺名称" rules={[{ required: true, message: "请输入店铺名称" }]}><Input placeholder="例如：微信小店旗舰店" /></Form.Item>
        <Form.Item name="appId" label="AppID" rules={[{ required: true, message: "请输入 AppID" }]}><Input autoComplete="off" /></Form.Item>
        <Form.Item name="appSecret" label="AppSecret" rules={[{ required: true, min: 8, message: "请输入 AppSecret" }]}><Input.Password autoComplete="new-password" /></Form.Item>
      </Form>
    </Modal>
  );
}

function SourcingWordmark({ large = false }: { large?: boolean }) {
  return <div className={`sourcing-wordmark ${large ? "large" : ""}`}><b>1688</b><strong>一件代发</strong><span>— 找 低 价 货 源 —</span></div>;
}

function InsightCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="insight-card"><h3>{title}</h3><div>{children}</div></div>;
}

function FilterRows() {
  return (
    <div className="filter-rows">
      <div><b>精选标签</b><Tag>淘宝体验分高</Tag><Tag>下游物流分高</Tag><Tag>晚揽必赔</Tag><Tag>支撑率高</Tag><Tag>铺货素材包</Tag><Tag>库存高稳定</Tag><Tag>源头工厂</Tag></div>
      <div><b>所属类目</b><span>个护/家清</span><span>日用餐厨饮具</span><span>收纳清洁用品</span><span>数码、电脑</span><span>办公、文化</span><span>内衣</span><span>服饰配件、饰品</span><span>女装</span><span>家居日用品</span></div>
      <div><b>密文面单支持</b><span>淘宝</span><span>抖音</span><span>拼多多</span><span>小红书</span><span>快手</span><span>京东</span><span>微信</span></div>
      <div><b>基础信息</b><span>包邮</span><span>7天无理由退货</span><span>一件代发</span><span>品牌授权</span><span>一件代发包邮</span></div>
    </div>
  );
}

function OfferGrid({ offers, selected, onChange }: {
  offers: OfferSnapshot[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div className="offer-grid">
      {offers.map((offer) => {
        const checked = selected.includes(offer.offerId);
        const minPrice = Math.min(...offer.skus.map((sku) => sku.priceCents));
        return (
          <article className={`offer-card ${checked ? "selected" : ""}`} key={offer.offerId} onClick={() => onChange(checked ? selected.filter((id) => id !== offer.offerId) : [...selected, offer.offerId])}>
            <div className="offer-check"><Checkbox checked={checked} /></div>
            <Image preview={false} src={offer.imageUrls[0] ?? logoUrl} fallback={logoUrl} alt={offer.title} referrerPolicy="no-referrer" />
            <div className="offer-card-body"><h3>{offer.title}</h3><div className="offer-price">¥{(minPrice / 100).toFixed(2)}</div><div className="offer-meta"><span>Offer {offer.offerId}</span><span>{offer.skus.length} 个SKU</span></div></div>
          </article>
        );
      })}
    </div>
  );
}

function StatusTag({ status }: { status: string }) {
  const config: Record<string, { color: string; text: string }> = {
    NORMAL: { color: "success", text: "正常" },
    CREDENTIAL_INVALID: { color: "error", text: "凭证失效" },
    WHITELIST_ABNORMAL: { color: "warning", text: "白名单异常" },
    QUEUED: { color: "default", text: "待处理" },
    RUNNING: { color: "processing", text: "处理中" },
    PROCESSING: { color: "processing", text: "处理中" },
    SUBMITTED: { color: "cyan", text: "提交成功" },
    REVIEWING: { color: "blue", text: "审核中" },
    LISTED: { color: "success", text: "已上架" },
    SUCCESS: { color: "success", text: "成功" },
    PARTIAL_SUCCESS: { color: "warning", text: "部分成功" },
    FAILED: { color: "error", text: "失败" }
  };
  const item = config[status] ?? { color: "default", text: status };
  return <Tag color={item.color}>{item.text}</Tag>;
}

function uniqueLines(value: string): string[] {
  return [...new Set(value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))];
}

function pageFromHash(): PageKey {
  const value = window.location.hash.replace(/^#/, "") as PageKey;
  return value in PAGE_TITLES ? value : "link";
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
