import { useEffect, useState } from "react";
import {
  BookOutlined,
  CustomerServiceFilled,
  DownOutlined,
  MenuFoldOutlined,
  PlusOutlined,
  ShopOutlined,
  ShoppingCartOutlined
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
  Tag,
  Typography,
  message
} from "antd";
import type { OfferSnapshot, WechatStore, DistributionBatch } from "../shared/contracts";
import logoUrl from "../../assets/ziying-distribution-icon-64-v2.png";
import {
  alibabaAuthorizationUrl,
  bindWechatStore,
  listDistributionBatches,
  listOffers,
  listStores,
  loadAppState,
  removeStore,
  type AppState
} from "./api";
import { LinkDistributionPage, RecommendPage, RecordsPage, SearchPage, StatusTag } from "./pages";

export type PageKey = "link" | "recommend" | "search" | "records";

export const PAGE_TITLES: Record<PageKey, string> = {
  link: "链接铺货",
  recommend: "低价货源推荐",
  search: "低价货源搜索",
  records: "铺货记录"
};

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

export function App() {
  const [page, setPage] = useState<PageKey>(() => pageFromHash());
  const [appState, setAppState] = useState<AppState>();
  const [offers, setOffers] = useState<OfferSnapshot[]>([]);
  const [stores, setStores] = useState<WechatStore[]>([]);
  const [batches, setBatches] = useState<DistributionBatch[]>([]);
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [bindModalOpen, setBindModalOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [storeLoading, setStoreLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  async function refreshWorkspace() {
    const [nextOffers, nextStores, nextBatches] = await Promise.all([
      listOffers(), listStores(), listDistributionBatches()
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
    try {
      await removeStore(storeId);
      await refreshWorkspace();
      messageApi.success("店铺已解绑");
    } catch (error) {
      messageApi.error(errorMessage(error, "店铺解绑失败"));
    }
  }

  const selectedStores = stores.filter((store) => selectedStoreIds.includes(store.id));

  return <Layout className="app-shell">
    {contextHolder}
    <div className="platform-bar">
      <span className="platform-user">{appState?.session?.alibabaUserId ?? "1688用户"}</span>
      <nav className="platform-links" aria-label="1688平台导航">
        <a href="https://www.1688.com" target="_blank" rel="noreferrer">1688首页</a>
        <a href="https://fuwu.1688.com" target="_blank" rel="noreferrer">1688服务市场</a>
        <a href="https://ufuwu.1688.com" target="_blank" rel="noreferrer">优选工作台首页</a>
        <span className="buyer-chip">买家</span>
      </nav>
    </div>
    <Header className="app-header">
      <div className="app-brand"><Image preview={false} src={logoUrl} width={38} height={38} alt="电潮分销" /><span>电潮分销</span><MenuFoldOutlined className="fold-icon" /></div>
      <div className="header-actions">
        <Button className="support-button" icon={<CustomerServiceFilled />} onClick={() => setSupportOpen(true)}>联系客服</Button>
        <Button type="text" icon={<BookOutlined />} onClick={() => setTutorialOpen(true)}>查看教程</Button>
        <div className="plan-box"><Tag>免费版</Tag><small>首版永久免费</small></div>
      </div>
    </Header>
    <Layout className="main-layout">
      <Sider width={184} className="sidebar" theme="light">
        <div className="mode-switch"><button className="active">铺货</button><button disabled title="下单功能不在当前版本范围">下单</button></div>
        <div className="nav-group-title"><ShoppingCartOutlined /><span>铺货</span><DownOutlined /></div>
        {(Object.keys(PAGE_TITLES) as PageKey[]).map((key) => <button key={key} className={`nav-item ${page === key ? "active" : ""}`} onClick={() => navigate(key)}>{PAGE_TITLES[key]}</button>)}
        <div className="nav-divider" />
        <button className="sidebar-group" onClick={() => setStoreModalOpen(true)}><ShopOutlined /><span>店铺管理</span><DownOutlined /></button>
        <button className="sidebar-group" onClick={() => setTutorialOpen(true)}><BookOutlined /><span>使用教程</span><span /></button>
      </Sider>
      <Content className="workspace">
        {!appState ? <section className="content-card state-card">正在加载电潮分销工作台…</section>
          : !appState.connected && appState.mode === "real" ? <Alert className="connection-alert" type="warning" showIcon title="请先连接1688账号" description="完成授权后才能读取真实商品、搜索货源并创建铺货任务。" action={<Button type="primary" href={alibabaAuthorizationUrl(`/#${page}`)}>连接1688账号</Button>} />
          : <>
            {page === "link" && <LinkDistributionPage selectedStores={selectedStores} onChooseStores={() => setStoreModalOpen(true)} onOpenBind={() => setBindModalOpen(true)} onCreated={async () => { await refreshWorkspace(); navigate("records"); }} />}
            {page === "recommend" && <RecommendPage offers={offers} stores={selectedStores} onNeedStores={() => setStoreModalOpen(true)} onRefresh={refreshWorkspace} onOpenSearch={() => navigate("search")} onCreated={async () => { await refreshWorkspace(); navigate("records"); }} />}
            {page === "search" && <SearchPage offers={offers} stores={selectedStores} onNeedStores={() => setStoreModalOpen(true)} onRefresh={refreshWorkspace} onCreated={async () => { await refreshWorkspace(); navigate("records"); }} />}
            {page === "records" && <RecordsPage batches={batches} stores={stores} onRefresh={refreshWorkspace} onGoDistribute={() => navigate("link")} />}
          </>}
      </Content>
    </Layout>
    <StoreSelectorModal open={storeModalOpen} stores={stores} selectedIds={selectedStoreIds} onChange={setSelectedStoreIds} onClose={() => setStoreModalOpen(false)} onBind={() => { setStoreModalOpen(false); setBindModalOpen(true); }} onRemove={handleRemoveStore} />
    <BindStoreModal open={bindModalOpen} loading={storeLoading} onCancel={() => setBindModalOpen(false)} onSubmit={handleBindStore} />
    <TutorialModal open={tutorialOpen} onClose={() => setTutorialOpen(false)} />
    <Modal title="联系电潮分销客服" open={supportOpen} onCancel={() => setSupportOpen(false)} footer={<Button type="primary" onClick={() => setSupportOpen(false)}>知道了</Button>}>
      <p>请在1688服务市场的已购服务订单中点击“联系服务商”，并附上铺货记录编号与完整错误说明。</p>
      <Alert type="info" showIcon title="请勿发送微信 AppSecret、1688 Token 或数据库密码。" />
    </Modal>
  </Layout>;
}

function StoreSelectorModal({ open, stores, selectedIds, onChange, onClose, onBind, onRemove }: { open: boolean; stores: WechatStore[]; selectedIds: string[]; onChange: (ids: string[]) => void; onClose: () => void; onBind: () => void; onRemove: (id: string) => Promise<void> }) {
  return <Modal title="店铺管理" open={open} onCancel={onClose} onOk={onClose} okText="确定" cancelText="取消" width={760}>
    <div className="store-modal-toolbar"><span>已绑定 {stores.length} 个微信小店</span><Button type="primary" icon={<PlusOutlined />} onClick={onBind}>添加店铺</Button></div>
    {stores.length === 0 ? <Empty description="尚未绑定微信小店" /> : <Checkbox.Group value={selectedIds} onChange={(values) => onChange(values as string[])} className="store-grid">
      {stores.map((store) => <div className={`store-card ${store.status !== "NORMAL" ? "disabled" : ""}`} key={store.id}><Checkbox value={store.id} disabled={store.status !== "NORMAL"}><div className="store-card-main"><ShopOutlined /><div><b>{store.name}</b><span>{store.appIdMasked}</span></div></div></Checkbox><div className="store-card-foot"><StatusTag status={store.status} /><Popconfirm title="确定解绑该店铺吗？" onConfirm={() => onRemove(store.id)} okText="解绑" cancelText="取消"><Button type="link" danger size="small">解绑</Button></Popconfirm></div>{store.statusMessage && <Text type="secondary">{store.statusMessage}</Text>}</div>)}
    </Checkbox.Group>}
  </Modal>;
}

function BindStoreModal({ open, loading, onCancel, onSubmit }: { open: boolean; loading: boolean; onCancel: () => void; onSubmit: (values: { name: string; appId: string; appSecret: string }) => Promise<void> }) {
  const [form] = Form.useForm();
  return <Modal title="绑定微信小店" open={open} onCancel={onCancel} onOk={() => form.submit()} confirmLoading={loading} okText="验证并绑定" cancelText="取消" destroyOnHidden>
    <Alert type="info" showIcon title="请填写微信小店自研 AppID 与 AppSecret。凭证仅提交到服务端并加密保存，不会在页面回显。" />
    <Form form={form} layout="vertical" onFinish={onSubmit} className="bind-store-form"><Form.Item name="name" label="店铺名称" rules={[{ required: true, message: "请输入店铺名称" }]}><Input placeholder="例如：微信小店旗舰店" /></Form.Item><Form.Item name="appId" label="AppID" rules={[{ required: true, message: "请输入 AppID" }]}><Input autoComplete="off" /></Form.Item><Form.Item name="appSecret" label="AppSecret" rules={[{ required: true, min: 8, message: "请输入 AppSecret" }]}><Input.Password autoComplete="new-password" /></Form.Item></Form>
  </Modal>;
}

function TutorialModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <Modal title="电潮分销使用教程" open={open} onCancel={onClose} footer={<Button type="primary" onClick={onClose}>知道了</Button>} width={760}>
    <ol className="tutorial-list"><li><b>绑定店铺</b><span>填写微信小店自研 AppID 和 AppSecret，并配置出口IP白名单。</span></li><li><b>复制商品</b><span>粘贴1至20条1688商品链接或Offer ID，选择分配方式和目标店铺。</span></li><li><b>预览铺货</b><span>确认商品、采购价、库存快照和目标店铺后提交任务。</span></li><li><b>查看结果</b><span>在铺货记录中筛选任务，完整失败原因可复制给客服。</span></li></ol>
    <Alert type="warning" showIcon title="AppSecret、AccessToken 不得发送给任何人；库存仅为导入快照，发布后不会自动同步。" />
  </Modal>;
}

function pageFromHash(): PageKey { const value = window.location.hash.replace(/^#/, "") as PageKey; return value in PAGE_TITLES ? value : "link"; }
function errorMessage(error: unknown, fallback: string): string { return error instanceof Error ? error.message : fallback; }
