import { useEffect, useMemo, useState } from "react";
import { EyeOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { Alert, Button, Checkbox, Empty, Image, Input, Modal, Radio, Select, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { DistributionBatch, DistributionJob, DistributionStrategy, OfferSnapshot, WechatStore } from "../shared/contracts";
import logoUrl from "../../assets/ziying-distribution-icon-64-v2.png";
import { createDistributionBatch, importOffers, loadDistributionBatch } from "./api";

const { Text, Title } = Typography;

const STRATEGIES: Array<{ value: DistributionStrategy; label: string }> = [
  { value: "ORDERED_AVERAGED", label: "顺序平均分配" },
  { value: "RANDOM_AVERAGED", label: "随机平均分配" },
  { value: "RANDOM", label: "随机分配" },
  { value: "MANUAL", label: "手动分配" }
];

export function LinkDistributionPage({ selectedStores, onChooseStores, onOpenBind, onCreated }: {
  selectedStores: WechatStore[];
  onChooseStores: () => void;
  onOpenBind: () => void;
  onCreated: () => Promise<void>;
}) {
  const [references, setReferences] = useState("");
  const [strategy, setStrategy] = useState<DistributionStrategy>("ORDERED_AVERAGED");
  const [loading, setLoading] = useState(false);
  const [previewOffers, setPreviewOffers] = useState<OfferSnapshot[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [manualStores, setManualStores] = useState<Record<string, string>>({});
  const [messageApi, contextHolder] = message.useMessage();

  async function preview() {
    const values = uniqueLines(references);
    if (values.length === 0) return messageApi.warning("请输入1688商品链接");
    if (values.length > 20) return messageApi.warning("单次最多铺货20个商品");
    if (selectedStores.length === 0) return messageApi.warning("请先选择要铺货的店铺");
    setLoading(true);
    try {
      const imported = await importOffers(values);
      setPreviewOffers(imported);
      setManualStores(Object.fromEntries(imported.map((offer, index) => [offer.offerId, selectedStores[index % selectedStores.length]!.id])));
      setPreviewOpen(true);
    } catch (error) {
      messageApi.error(errorMessage(error, "读取1688商品失败"));
    } finally { setLoading(false); }
  }

  async function confirmDistribution() {
    if (strategy === "MANUAL" && previewOffers.some((offer) => !manualStores[offer.offerId])) return messageApi.warning("请为每个商品选择铺货店铺");
    setLoading(true);
    try {
      await createDistributionBatch({
        offerIds: previewOffers.map((offer) => offer.offerId),
        storeIds: selectedStores.map((store) => store.id),
        strategy,
        ...(strategy === "MANUAL" ? { manualAssignments: previewOffers.map((offer) => ({ offerId: offer.offerId, storeId: manualStores[offer.offerId]! })) } : {})
      });
      messageApi.success(`已创建 ${previewOffers.length} 个铺货任务`);
      setPreviewOpen(false);
      setPreviewOffers([]);
      setReferences("");
      await onCreated();
    } catch (error) {
      messageApi.error(errorMessage(error, "铺货任务创建失败"));
    } finally { setLoading(false); }
  }

  const previewColumns: ColumnsType<OfferSnapshot> = [
    { title: "商品", render: (_, offer) => <div className="preview-product"><Image preview={false} src={offer.imageUrls[0] ?? logoUrl} fallback={logoUrl} width={52} height={52} /><div><b>{offer.title}</b><span>Offer {offer.offerId} · {offer.skus.length}个SKU</span></div></div> },
    { title: "采购价", width: 120, render: (_, offer) => `¥${(Math.min(...offer.skus.map((sku) => sku.priceCents)) / 100).toFixed(2)} 起` },
    { title: "库存快照", width: 110, render: (_, offer) => offer.skus.reduce((sum, sku) => sum + sku.availableStock, 0) },
    { title: "目标店铺", width: 190, render: (_, offer, index) => strategy === "MANUAL"
      ? <Select value={manualStores[offer.offerId] ?? null} options={selectedStores.map((store) => ({ value: store.id, label: store.name }))} onChange={(storeId) => { if (storeId) setManualStores((current) => ({ ...current, [offer.offerId]: storeId })); }} />
      : <Tag color="blue">{assignmentDescription(strategy, selectedStores, index)}</Tag> }
  ];

  return <section className="content-card link-page">
    {contextHolder}
    <div className="inner-tabs"><button className="active">商品复制</button><button disabled title="AI选品不在当前版本范围">AI选品</button></div>
    <div className="form-block">
      <label className="required-label">商品复制（仅支持1688商品，示例：https://detail.1688.com/offer/651234566292.html）</label>
      <Input.TextArea value={references} onChange={(event) => setReferences(event.target.value)} rows={8} maxLength={10000} placeholder="请输入1688商品链接，多个链接按回车键分隔后再复制" showCount />
      <div className="field-stack"><label>请选择链接分配方式</label><Radio.Group value={strategy} onChange={(event) => setStrategy(event.target.value)} options={STRATEGIES} /></div>
      <div className="field-stack"><label className="required-label">请选择要铺货的店铺</label><Space wrap><Button type="primary" icon={<PlusOutlined />} onClick={onChooseStores}>添加店铺</Button><Button onClick={onOpenBind}>绑定新店铺</Button></Space>
        <div className="store-category"><Checkbox checked={selectedStores.length > 0} onChange={onChooseStores}>全部店铺（{selectedStores.length}）</Checkbox><div>{selectedStores.map((store) => <Tag key={store.id} color="processing">{store.name}</Tag>)}</div></div>
      </div>
      <div className="preview-action"><Button type="primary" size="large" loading={loading} disabled={!references.trim() || selectedStores.length === 0} onClick={preview}>预览铺货</Button>{(!references.trim() || selectedStores.length === 0) && <Text type="secondary">输入商品链接并选择店铺后即可预览</Text>}</div>
    </div>
    <Modal title={`铺货预览（${previewOffers.length}个商品）`} open={previewOpen} onCancel={() => setPreviewOpen(false)} width={1060} okText="确认铺货" cancelText="返回修改" confirmLoading={loading} onOk={confirmDistribution}>
      <Alert className="preview-alert" type="info" showIcon title="库存为导入时快照，发布后不会自动同步；商品提交后可在铺货记录查看结果。" />
      <Table rowKey="offerId" dataSource={previewOffers} columns={previewColumns} pagination={false} scroll={{ y: 430 }} />
    </Modal>
  </section>;
}

export function RecommendPage({ offers, stores, onNeedStores, onRefresh, onOpenSearch, onCreated }: {
  offers: OfferSnapshot[];
  stores: WechatStore[];
  onNeedStores: () => void;
  onRefresh: () => Promise<void>;
  onOpenSearch: () => void;
  onCreated: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "in_stock" | "high_stock">("all");
  const [skuFilter, setSkuFilter] = useState<"all" | "single" | "multiple">("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sortBy, setSortBy] = useState<"comprehensive" | "price" | "stock" | "newest">("comprehensive");
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const categories = [...new Set(offers.map((offer) => offer.categoryId).filter(Boolean))].slice(0, 8);
  const visible = [...offers].filter((offer) => {
    const totalStock = offer.skus.reduce((sum, sku) => sum + sku.availableStock, 0);
    if (query.trim() && !offer.title.toLowerCase().includes(query.trim().toLowerCase()) && !offer.offerId.includes(query.trim())) return false;
    if (categoryFilter && offer.categoryId !== categoryFilter) return false;
    if (stockFilter === "in_stock" && totalStock === 0) return false;
    if (stockFilter === "high_stock" && totalStock < 100) return false;
    if (skuFilter === "single" && offer.skus.length !== 1) return false;
    if (skuFilter === "multiple" && offer.skus.length <= 1) return false;
    return true;
  }).sort((left, right) => {
    if (sortBy === "price") return minimumPrice(left) - minimumPrice(right);
    if (sortBy === "stock") return totalStock(right) - totalStock(left);
    if (sortBy === "newest") return new Date(right.importedAt).getTime() - new Date(left.importedAt).getTime();
    return 0;
  });

  async function distribute(offerIds = selected) {
    if (offerIds.length === 0) return messageApi.warning("请先选择商品");
    if (stores.length === 0) { onNeedStores(); return; }
    setLoading(true);
    try {
      await createDistributionBatch({ offerIds, storeIds: stores.map((store) => store.id), strategy: "ORDERED_AVERAGED" });
      messageApi.success(`已创建${offerIds.length}个铺货任务`);
      setSelected([]);
      await onCreated();
    } catch (error) { messageApi.error(errorMessage(error, "创建任务失败")); }
    finally { setLoading(false); }
  }

  return <div className="recommend-page">
    {contextHolder}
    <section className="recommend-hero content-card">
      <div className="recommend-head-row"><SourcingWordmark /><Input.Search className="recommend-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="请输入关键词" enterButton="搜索" /><Button className="batch-search-button" onClick={onOpenSearch}>批量搜索</Button></div>
      <div className="insight-grid">
        <InsightCard title="找榜单"><a className="rank-chip hot" href="https://air.1688.com/app/channel-fe/search/index.html#/downstream_list?listType=hotSale&rangeType=week" target="_blank" rel="noreferrer">热销榜</a><a className="rank-chip trend" href="https://air.1688.com/app/channel-fe/search/index.html#/downstream_list?listType=trend&rangeType=week" target="_blank" rel="noreferrer">趋势榜</a><a className="rank-chip topic" href="https://air.1688.com/app/channel-fe/search/index.html#/downstream_list?listType=hotQuery&rangeType=month" target="_blank" rel="noreferrer">热搜榜</a></InsightCard>
        <InsightCard title="代发销量榜"><b>优质分销货源精选</b><Text type="secondary">按真实导入记录展示</Text></InsightCard>
        <InsightCard title="找服务"><b>平台精选代发服务</b><Text type="secondary">为铺货提供稳定货源</Text></InsightCard>
        <InsightCard title="分销等级"><b>先采后付专属提额</b><Text type="secondary">经营问题可查看学习中心</Text></InsightCard>
      </div>
      <a className="brand-banner" href="https://air.1688.com/app/channel-fe/distribution-work/brand.html#/gallery" target="_blank" rel="noreferrer"><b>1688品牌分销</b><span>01 选择目标品牌</span><span>02 申请品牌授权</span><span>03 选品铺货</span><span className="brand-link">前往品牌专区 ›</span></a>
    </section>
    <section className="content-card source-panel"><div className="source-panel-title"><Title level={3}>推荐货源</Title><Button icon={<ReloadOutlined />} onClick={onRefresh}>刷新</Button></div><FilterRows categories={categories} category={categoryFilter} stock={stockFilter} sku={skuFilter} onCategory={setCategoryFilter} onStock={setStockFilter} onSku={setSkuFilter} /><div className="sort-row" aria-label="货源排序">{([['comprehensive', '综合排序'], ['price', '代发价格'], ['stock', '库存数量'], ['newest', '上架时间']] as const).map(([value, label]) => <button key={value} className={sortBy === value ? "active" : ""} onClick={() => setSortBy(value)}>{label}</button>)}</div>
      {visible.length === 0 ? <Empty className="source-empty" description="暂无已导入货源；可先在链接铺货中导入真实1688商品" /> : <OfferGrid offers={visible} selected={selected} onChange={setSelected} onDistributeOne={(offerId) => distribute([offerId])} />}
    </section>
    <div className="batch-footer"><Checkbox checked={visible.length > 0 && visible.every((offer) => selected.includes(offer.offerId))} onChange={(event) => setSelected(event.target.checked ? visible.map((offer) => offer.offerId) : [])}>全选</Checkbox><span>已选 <b>{selected.length}</b> 个商品</span><Button onClick={() => setSelected([])}>清空已选</Button><Button type="primary" loading={loading} disabled={selected.length === 0} onClick={() => distribute()}>批量铺货</Button></div>
  </div>;
}

type SearchMode = "keyword" | "image" | "imageUrl" | "product" | "store";

export function SearchPage({ offers, stores, onNeedStores, onRefresh, onCreated }: {
  offers: OfferSnapshot[];
  stores: WechatStore[];
  onNeedStores: () => void;
  onRefresh: () => Promise<void>;
  onCreated: () => Promise<void>;
}) {
  const [mode, setMode] = useState<SearchMode>("keyword");
  const [query, setQuery] = useState("");
  const [batchInput, setBatchInput] = useState("");
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchQueries, setBatchQueries] = useState<string[]>([]);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const unsupported = ["image", "imageUrl", "store"].includes(mode);
  const results = useMemo(() => offers.filter((offer) => {
    const terms = batchQueries.length ? batchQueries : query.trim() ? [query.trim()] : [];
    return terms.length === 0 || terms.some((term) => offer.title.toLowerCase().includes(term.toLowerCase()) || offer.offerId.includes(term));
  }), [offers, query, batchQueries]);

  async function searchOrImport() {
    if (!query.trim()) return messageApi.warning("请输入搜索内容");
    if (unsupported) return messageApi.info("当前1688应用尚未取得该搜索接口权限");
    setSearched(true);
    setBatchQueries([]);
    if (mode !== "product") return;
    setLoading(true);
    try { const imported = await importOffers([query.trim()]); await onRefresh(); setSelected(imported.map((offer) => offer.offerId)); }
    catch (error) { messageApi.error(errorMessage(error, "商品链接读取失败")); }
    finally { setLoading(false); }
  }

  async function batchSearch() {
    const values = uniqueLines(batchInput);
    if (values.length === 0) return messageApi.warning("请输入批量搜索内容");
    const limit = mode === "product" ? 20 : 10;
    if (values.length > limit) return messageApi.warning(`单次最多${limit}条`);
    setLoading(true);
    try {
      if (mode === "product") { const imported = await importOffers(values); await onRefresh(); setSelected(imported.map((offer) => offer.offerId)); messageApi.success(`已读取${imported.length}个商品`); }
      else { setBatchQueries(values); messageApi.success(`已按${values.length}个关键词筛选已导入商品`); }
      setSearched(true); setBatchOpen(false);
    } catch (error) { messageApi.error(errorMessage(error, "批量搜索失败")); }
    finally { setLoading(false); }
  }

  async function distribute(offerIds = selected) {
    if (offerIds.length === 0) return messageApi.warning("请先选择商品");
    if (stores.length === 0) { onNeedStores(); return; }
    setLoading(true);
    try { await createDistributionBatch({ offerIds, storeIds: stores.map((store) => store.id), strategy: "ORDERED_AVERAGED" }); await onCreated(); }
    catch (error) { messageApi.error(errorMessage(error, "创建铺货任务失败")); }
    finally { setLoading(false); }
  }

  return <section className="content-card search-page">
    {contextHolder}<SourcingWordmark large />
    <div className="search-tabs">{(["keyword", "image", "imageUrl", "product", "store"] as SearchMode[]).map((value) => <button key={value} className={mode === value ? "active" : ""} onClick={() => { setMode(value); setBatchOpen(false); setSearched(false); }}>{searchModeLabel(value)}</button>)}</div>
    <div className="central-search-row"><Input value={query} onChange={(event) => setQuery(event.target.value)} onPressEnter={searchOrImport} placeholder={mode === "keyword" ? "请输入关键词" : mode === "product" ? "请输入1688商品链接" : "当前搜索方式尚未取得接口权限"} disabled={unsupported} /><Button type="primary" loading={loading} disabled={unsupported} onClick={searchOrImport}>搜索</Button><Button disabled={unsupported} onClick={() => setBatchOpen((current) => !current)}>批量搜索</Button></div>
    {batchOpen && <div className="batch-search-panel"><Input.TextArea value={batchInput} onChange={(event) => setBatchInput(event.target.value)} placeholder={mode === "product" ? "批量粘贴商品链接或Offer ID，每行一条，最多20条" : "批量粘贴关键词，每行一条，最多10条"} /><div className="batch-search-actions"><Button type="primary" loading={loading} onClick={batchSearch}>确定</Button><Button onClick={() => setBatchOpen(false)}>取消</Button></div></div>}
    {unsupported && <Alert className="capability-alert" type="info" showIcon title="该搜索能力尚未取得当前1688应用接口权限" description="按钮已明确禁用，不会使用模拟数据冒充1688接口结果。" />}
    {searched && <div className="search-results"><div className="search-result-title"><b>搜索结果</b><span>共 {results.length} 条</span></div>{results.length ? <OfferGrid offers={results} selected={selected} onChange={setSelected} onDistributeOne={(offerId) => distribute([offerId])} /> : <Empty description="没有匹配的已导入商品" />}{selected.length > 0 && <Button type="primary" loading={loading} className="search-distribute" onClick={() => distribute()}>批量铺货（{selected.length}）</Button>}</div>}
  </section>;
}

type JobRow = DistributionJob & { batchRecordNumber: number; batchStatus: DistributionBatch["status"]; batchStrategy: DistributionStrategy };

export function RecordsPage({ batches, stores, onRefresh, onGoDistribute }: { batches: DistributionBatch[]; stores: WechatStore[]; onRefresh: () => Promise<void>; onGoDistribute: () => void }) {
  const emptyFilters = { storeId: "", title: "", offerId: "", productId: "", status: "", from: "", to: "" };
  const [draft, setDraft] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [rows, setRows] = useState<JobRow[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [previewRows, setPreviewRows] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadRows() {
    setLoading(true);
    try { const details = await Promise.all(batches.map((batch) => loadDistributionBatch(batch.id))); setRows(details.flatMap((batch) => (batch.jobs ?? []).map((job) => ({ ...job, batchRecordNumber: batch.recordNumber, batchStatus: batch.status, batchStrategy: batch.strategy })))); }
    finally { setLoading(false); }
  }
  useEffect(() => { void loadRows(); }, [batches]);

  const filteredRows = rows.filter((row) => {
    if (filters.storeId && row.storeId !== filters.storeId) return false;
    if (filters.title && !row.offerTitle.toLowerCase().includes(filters.title.toLowerCase())) return false;
    if (filters.offerId && !row.offerId.includes(filters.offerId)) return false;
    if (filters.productId && !(row.statusMessage ?? "").includes(filters.productId)) return false;
    if (filters.status && row.status !== filters.status) return false;
    if (filters.from && new Date(row.createdAt) < new Date(`${filters.from}T00:00:00`)) return false;
    if (filters.to && new Date(row.createdAt) > new Date(`${filters.to}T23:59:59`)) return false;
    return true;
  });

  const columns: ColumnsType<JobRow> = [
    { title: "来源商品信息", width: 250, render: (_, row) => <div className="record-product"><b>{row.offerTitle}</b><span>记录 #{row.batchRecordNumber} · Offer {row.offerId}</span></div> },
    { title: "来源商品链接", width: 130, render: (_, row) => <a href={`https://detail.1688.com/offer/${row.offerId}.html`} target="_blank" rel="noreferrer">查看1688商品</a> },
    { title: "铺货模板", dataIndex: "batchStrategy", width: 130, render: strategyLabel },
    { title: "目标店铺", dataIndex: "storeName", width: 150 },
    { title: "铺货状态", dataIndex: "status", width: 110, render: (value) => <StatusTag status={value} /> },
    { title: "铺货失败原因", dataIndex: "statusMessage", render: (value, row) => row.status === "FAILED" ? <Text className="failure-reason" copyable>{value || "发布失败，未返回原因"}</Text> : <Text type="secondary">-</Text> },
    { title: "创建时间", dataIndex: "createdAt", width: 170, render: formatDateTime },
    { title: "完成时间", dataIndex: "updatedAt", width: 170, render: formatDateTime },
    { title: "操作", width: 90, fixed: "right", render: (_, row) => <Button type="link" icon={<EyeOutlined />} onClick={() => setPreviewRows([row])}>详情</Button> }
  ];

  async function refresh() { setLoading(true); try { await onRefresh(); } finally { setLoading(false); } }

  return <section className="content-card records-page">
    <div className="card-heading"><Title level={2}>铺货记录</Title><Button icon={<ReloadOutlined />} loading={loading} onClick={refresh}>刷新</Button></div>
    <div className="record-filters"><Select allowClear value={draft.storeId || undefined} placeholder="全部店铺" options={stores.map((store) => ({ value: store.id, label: store.name }))} onChange={(value) => setDraft({ ...draft, storeId: value ?? "" })} /><label>商品名称<Input value={draft.title} placeholder="请输入" onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><label>1688商品ID<Input value={draft.offerId} placeholder="请输入" onChange={(event) => setDraft({ ...draft, offerId: event.target.value })} /></label><label>微信商品ID<Input value={draft.productId} placeholder="请输入" onChange={(event) => setDraft({ ...draft, productId: event.target.value })} /></label><Select allowClear value={draft.status || undefined} placeholder="全部铺货状态" options={["QUEUED", "PROCESSING", "SUBMITTED", "REVIEWING", "LISTED", "FAILED"].map((value) => ({ value, label: statusLabel(value) }))} onChange={(value) => setDraft({ ...draft, status: value ?? "" })} /><label>创建时间<div className="date-range"><Input type="date" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} /><span>—</span><Input type="date" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} /></div></label><div className="filter-actions"><Button type="primary" icon={<SearchOutlined />} onClick={() => setFilters(draft)}>搜索</Button><Button icon={<ReloadOutlined />} onClick={() => { setDraft(emptyFilters); setFilters(emptyFilters); }}>重置</Button></div></div>
    <div className="records-toolbar"><Button type="link" onClick={onGoDistribute}>前往电潮铺货 ›</Button></div>
    <Table rowKey="id" loading={loading} dataSource={filteredRows} columns={columns} scroll={{ x: 1350 }} rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }} locale={{ emptyText: <Empty description="暂无数据" /> }} pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }} />
    <div className="records-bottom"><Checkbox checked={filteredRows.length > 0 && selectedRowKeys.length === filteredRows.length} onChange={(event) => setSelectedRowKeys(event.target.checked ? filteredRows.map((row) => row.id) : [])}>全选</Checkbox><span>已选（{selectedRowKeys.length}）条</span><Button type="primary" disabled={selectedRowKeys.length === 0} onClick={() => setPreviewRows(rows.filter((row) => selectedRowKeys.includes(row.id)))}>铺货预览</Button></div>
    <Modal title={`铺货任务详情（${previewRows.length}条）`} open={previewRows.length > 0} onCancel={() => setPreviewRows([])} footer={<Button onClick={() => setPreviewRows([])}>关闭</Button>} width={980}><Table rowKey="id" dataSource={previewRows} columns={columns.filter((column) => column.title !== "操作")} pagination={false} scroll={{ x: 1200 }} /></Modal>
  </section>;
}

function SourcingWordmark({ large = false }: { large?: boolean }) { return <div className={`sourcing-wordmark ${large ? "large" : ""}`}><b>1688</b><strong>一件代发</strong><span>— 找 低 价 货 源 —</span></div>; }
function InsightCard({ title, children }: { title: string; children: React.ReactNode }) { return <div className="insight-card"><h3>{title}</h3><div>{children}</div></div>; }
function FilterRows({ categories, category, stock, sku, onCategory, onStock, onSku }: {
  categories: string[];
  category: string;
  stock: "all" | "in_stock" | "high_stock";
  sku: "all" | "single" | "multiple";
  onCategory: (value: string) => void;
  onStock: (value: "all" | "in_stock" | "high_stock") => void;
  onSku: (value: "all" | "single" | "multiple") => void;
}) {
  return <div className="filter-rows">
    <div><b>精选标签</b>{([['all', '全部货源'], ['in_stock', '有库存'], ['high_stock', '库存100+']] as const).map(([value, label]) => <button key={value} className={stock === value ? "active" : ""} onClick={() => onStock(value)}>{label}</button>)}</div>
    <div><b>所属类目</b><button className={!category ? "active" : ""} onClick={() => onCategory("")}>全部类目</button>{categories.map((value) => <button key={value} className={category === value ? "active" : ""} onClick={() => onCategory(value)}>类目 {value}</button>)}</div>
    <div><b>规格数量</b>{([['all', '全部规格'], ['single', '单规格'], ['multiple', '多规格']] as const).map(([value, label]) => <button key={value} className={sku === value ? "active" : ""} onClick={() => onSku(value)}>{label}</button>)}</div>
  </div>;
}

function OfferGrid({ offers, selected, onChange, onDistributeOne }: { offers: OfferSnapshot[]; selected: string[]; onChange: (ids: string[]) => void; onDistributeOne: (offerId: string) => void }) {
  return <div className="offer-grid">{offers.map((offer) => { const checked = selected.includes(offer.offerId); const minPrice = Math.min(...offer.skus.map((sku) => sku.priceCents)); const toggle = () => onChange(checked ? selected.filter((id) => id !== offer.offerId) : [...selected, offer.offerId]); return <article className={`offer-card ${checked ? "selected" : ""}`} key={offer.offerId} role="button" tabIndex={0} onClick={toggle} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") toggle(); }}><div className="offer-check"><Checkbox checked={checked} /></div><Image preview={false} src={offer.imageUrls[0] ?? logoUrl} fallback={logoUrl} alt={offer.title} referrerPolicy="no-referrer" /><div className="offer-card-body"><h3>{offer.title}</h3><div className="offer-price">¥{(minPrice / 100).toFixed(2)}</div><div className="offer-meta"><span>Offer {offer.offerId}</span><span>{offer.skus.length} 个SKU</span></div><Button type="primary" block onClick={(event) => { event.stopPropagation(); onDistributeOne(offer.offerId); }}>立即铺货</Button></div></article>; })}</div>;
}

export function StatusTag({ status }: { status: string }) {
  const config: Record<string, { color: string; text: string }> = { NORMAL: { color: "success", text: "正常" }, CREDENTIAL_INVALID: { color: "error", text: "凭证失效" }, WHITELIST_ABNORMAL: { color: "warning", text: "白名单异常" }, QUEUED: { color: "default", text: "待处理" }, RUNNING: { color: "processing", text: "处理中" }, PROCESSING: { color: "processing", text: "处理中" }, SUBMITTED: { color: "cyan", text: "提交成功" }, REVIEWING: { color: "blue", text: "审核中" }, LISTED: { color: "success", text: "已上架" }, SUCCESS: { color: "success", text: "成功" }, PARTIAL_SUCCESS: { color: "warning", text: "部分成功" }, FAILED: { color: "error", text: "铺货失败" } };
  const item = config[status] ?? { color: "default", text: status };
  return <Tag color={item.color}>{item.text}</Tag>;
}

function assignmentDescription(strategy: DistributionStrategy, stores: WechatStore[], index: number): string { if (strategy === "RANDOM") return "提交时随机店铺"; if (strategy === "RANDOM_AVERAGED") return "提交时随机均分"; return stores[index % stores.length]?.name ?? "未分配"; }
function strategyLabel(strategy: DistributionStrategy): string { return STRATEGIES.find((item) => item.value === strategy)?.label ?? strategy; }
function minimumPrice(offer: OfferSnapshot): number { return Math.min(...offer.skus.map((sku) => sku.priceCents)); }
function totalStock(offer: OfferSnapshot): number { return offer.skus.reduce((sum, sku) => sum + sku.availableStock, 0); }
function statusLabel(status: string): string { return status === "FAILED" ? "铺货失败" : status === "LISTED" ? "已上架" : status === "REVIEWING" ? "审核中" : status === "SUBMITTED" ? "提交成功" : status === "PROCESSING" ? "处理中" : "待处理"; }
function searchModeLabel(mode: SearchMode): string { return ({ keyword: "搜关键词", image: "搜图片", imageUrl: "图片链接", product: "商品链接", store: "店铺链接" })[mode]; }
function uniqueLines(value: string): string[] { return [...new Set(value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))]; }
function formatDateTime(value: string): string { return new Date(value).toLocaleString("zh-CN", { hour12: false }); }
function errorMessage(error: unknown, fallback: string): string { return error instanceof Error ? error.message : fallback; }
