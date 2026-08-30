import { useEffect, useMemo, useState } from "react";
import { EyeOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { Alert, Button, Checkbox, Empty, Image, Input, Modal, Radio, Select, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import type {
  DistributionBatch,
  DistributionJob,
  DistributionStrategy,
  OfferSearchItem,
  OfferSearchRequest,
  OfferSnapshot,
  WechatStore
} from "../shared/contracts";
import logoUrl from "../../assets/ziying-distribution-icon-64-v2.png";
import { createDistributionBatch, importOffers, loadDistributionBatch, searchOffers } from "./api";

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
  const [recommendations, setRecommendations] = useState<OfferSearchItem[]>([]);
  const [searched, setSearched] = useState(false);
  const [tagFilter, setTagFilter] = useState<string>("YX_SCORE_LEVEL_2");
  const [sortBy, setSortBy] = useState<"comprehensive" | "price" | "sales">("comprehensive");
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  void offers;

  async function loadRecommendations(nextSort = sortBy) {
    if (!query.trim()) return messageApi.warning("请输入货源关键词，例如男装、背包");
    setLoading(true);
    try {
      const response = await searchOffers({
        mode: "keyword",
        query: query.trim(),
        page: 1,
        pageSize: 50,
        ...(tagFilter ? { tags: [tagFilter] } : {}),
        sortBy: nextSort,
        sortOrder: nextSort === "price" ? "asc" : "desc"
      });
      setRecommendations(response.items);
      setSelected([]);
      setSearched(true);
      setSortBy(nextSort);
    } catch (error) { messageApi.error(errorMessage(error, "读取1688严选货源失败")); }
    finally { setLoading(false); }
  }

  async function distribute(offerIds = selected) {
    if (offerIds.length === 0) return messageApi.warning("请先选择商品");
    if (stores.length === 0) { onNeedStores(); return; }
    setLoading(true);
    try {
      const imported = await importOffers(offerIds);
      await onRefresh();
      await createDistributionBatch({ offerIds: imported.map((offer) => offer.offerId), storeIds: stores.map((store) => store.id), strategy: "ORDERED_AVERAGED" });
      messageApi.success(`已创建${imported.length}个铺货任务`);
      setSelected([]);
      await onCreated();
    } catch (error) { messageApi.error(errorMessage(error, "创建任务失败")); }
    finally { setLoading(false); }
  }

  return <div className="recommend-page">
    {contextHolder}
    <section className="recommend-hero content-card">
      <div className="recommend-head-row"><SourcingWordmark /><Input.Search className="recommend-search" value={query} onChange={(event) => setQuery(event.target.value)} onSearch={() => void loadRecommendations()} loading={loading} placeholder="输入关键词搜索1688严选低价货源" enterButton="搜索" /><Button className="batch-search-button" onClick={onOpenSearch}>批量搜索</Button></div>
      <div className="insight-grid">
        <InsightCard title="找货排序"><button className="rank-chip hot" onClick={() => void loadRecommendations("sales")}>代发销量</button><button className="rank-chip trend" onClick={() => void loadRecommendations("price")}>当前低价</button><button className="rank-chip topic" onClick={() => void loadRecommendations("comprehensive")}>综合推荐</button></InsightCard>
        <InsightCard title="数据来源"><b>1688国内分销词搜</b><Text type="secondary">展示官方接口真实返回</Text></InsightCard>
        <InsightCard title="低价口径"><b>当前返回集合价格排序</b><Text type="secondary">不承诺全网绝对最低</Text></InsightCard>
        <InsightCard title="铺货流程"><b>选品后读取完整商品详情</b><Text type="secondary">再提交到已绑定店铺</Text></InsightCard>
      </div>
      <button className="brand-banner" onClick={onOpenSearch}><b>1688官方搜货能力</b><span>01 关键词/图片找货</span><span>02 读取商品详情</span><span>03 选品铺货</span><span className="brand-link">进入完整搜货页 ›</span></button>
    </section>
    <section className="content-card source-panel"><div className="source-panel-title"><Title level={3}>严选低价货源</Title><Button icon={<ReloadOutlined />} loading={loading} disabled={!query.trim()} onClick={() => void loadRecommendations()}>刷新</Button></div><div className="recommend-filter-row"><b>官方筛选</b>{([{ value: "", label: "全部货源" }, ...OFFICIAL_SEARCH_TAGS] as const).map((filter) => <button key={filter.value || "all"} className={tagFilter === filter.value ? "active" : ""} onClick={() => setTagFilter(filter.value)}>{filter.label}</button>)}</div><div className="sort-row" aria-label="货源排序">{([['comprehensive', '综合排序'], ['sales', '代发销量'], ['price', '代发价格']] as const).map(([value, label]) => <button key={value} className={sortBy === value ? "active" : ""} onClick={() => void loadRecommendations(value)}>{label}</button>)}</div>
      {!searched ? <Empty className="source-empty" description="输入关键词后，从1688官方接口获取真实严选货源" /> : recommendations.length === 0 ? <Empty className="source-empty" description="1688接口没有返回匹配的严选货源" /> : <SearchOfferGrid offers={recommendations} selected={selected} onChange={setSelected} onDistributeOne={(offerId) => distribute([offerId])} />}
    </section>
    <div className="batch-footer"><Checkbox checked={recommendations.length > 0 && recommendations.every((offer) => selected.includes(offer.offerId))} onChange={(event) => setSelected(event.target.checked ? recommendations.map((offer) => offer.offerId) : [])}>全选</Checkbox><span>已选 <b>{selected.length}</b> 个商品</span><Button onClick={() => setSelected([])}>清空已选</Button><Button type="primary" loading={loading} disabled={selected.length === 0} onClick={() => distribute()}>批量铺货</Button></div>
  </div>;
}

type SearchMode = "keyword" | "image" | "imageUrl" | "product" | "store";

const OFFICIAL_SEARCH_TAGS = [
  { value: "YX_SCORE_LEVEL_1", label: "严选一级" },
  { value: "YX_SCORE_LEVEL_2", label: "严选二级" },
  { value: "fxBrandOffer", label: "品牌分销" },
  { value: "hasAIMaterials", label: "AI素材" }
] as const;

interface SelectedImage {
  id: string;
  name: string;
  dataUrl: string;
}

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
  const [searched, setSearched] = useState(false);
  const [results, setResults] = useState<OfferSearchItem[]>([]);
  const [resultTotal, setResultTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [quantityBegin, setQuantityBegin] = useState("");
  const [sortBy, setSortBy] = useState<"comprehensive" | "price" | "sales">("comprehensive");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  function requestFilters() {
    const min = yuanToCents(priceMin);
    const max = yuanToCents(priceMax);
    const quantity = Number(quantityBegin);
    return {
      ...(tagFilters.length ? { tags: tagFilters } : {}),
      ...(min !== undefined ? { priceMinCents: min } : {}),
      ...(max !== undefined ? { priceMaxCents: max } : {}),
      ...(Number.isInteger(quantity) && quantity > 0 ? { quantityBegin: quantity } : {}),
      sortBy,
      sortOrder
    };
  }

  async function runSearchRequests(requests: OfferSearchRequest[]) {
    const settled = await Promise.allSettled(requests.map((request) => searchOffers(request)));
    const successful = settled.filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof searchOffers>>> => result.status === "fulfilled");
    if (successful.length === 0) {
      const failed = settled.find((result): result is PromiseRejectedResult => result.status === "rejected");
      throw failed?.reason ?? new Error("1688搜货失败");
    }
    const unique = new Map<string, OfferSearchItem>();
    for (const response of successful) {
      for (const item of response.value.items) unique.set(item.offerId, item);
    }
    const merged = [...unique.values()];
    setResults(merged);
    setResultTotal(successful.reduce((sum, response) => sum + response.value.total, 0));
    setSelected((current) => current.filter((offerId) => unique.has(offerId)));
    const failureCount = settled.length - successful.length;
    if (failureCount > 0) messageApi.warning(`${failureCount}项搜索失败，其余真实结果已显示`);
  }

  async function searchOrImport(pageNumber = 1) {
    if (mode === "store") return messageApi.info("1688公开方案暂未提供任意店铺链接搜货接口");
    if (mode !== "image" && !query.trim()) return messageApi.warning("请输入搜索内容");
    const imageQueryIsUrl = mode === "image" && /^https?:\/\//i.test(query.trim());
    if (mode === "image" && images.length === 0 && !imageQueryIsUrl) return messageApi.warning("请上传图片或粘贴图片链接");
    setLoading(true);
    try {
      if (mode === "product") {
        const imported = await importOffers([query.trim()]);
        const mapped = imported.map(snapshotToSearchItem);
        setResults(mapped);
        setResultTotal(mapped.length);
        setSelected(mapped.map((offer) => offer.offerId));
        await onRefresh();
      } else if (mode === "keyword") {
        await runSearchRequests([{
          mode: "keyword",
          query: query.trim(),
          page: pageNumber,
          pageSize: 20,
          ...requestFilters()
        }]);
        setPage(pageNumber);
      } else if (mode === "imageUrl") {
        await runSearchRequests([{
          mode: "imageUrl",
          imageUrl: query.trim(),
          ...requestFilters()
        }]);
        setPage(1);
      } else if (imageQueryIsUrl) {
        await runSearchRequests([{
          mode: "imageUrl",
          imageUrl: query.trim(),
          ...requestFilters()
        }]);
        setPage(1);
      } else {
        await runSearchRequests(images.map((image) => ({
          mode: "image" as const,
          imageBase64: image.dataUrl,
          ...(query.trim() ? { imageKeywords: query.trim() } : {}),
          ...requestFilters()
        })));
        setPage(1);
      }
      setSearched(true);
    } catch (error) { messageApi.error(errorMessage(error, "1688搜货失败")); }
    finally { setLoading(false); }
  }

  async function batchSearch() {
    const values = uniqueLines(batchInput);
    if (values.length === 0) return messageApi.warning("请输入批量搜索内容");
    if (mode === "image" || mode === "store") return;
    const limit = mode === "product" ? 20 : 10;
    if (values.length > limit) return messageApi.warning(`单次最多${limit}条`);
    setLoading(true);
    try {
      if (mode === "product") {
        const imported = await importOffers(values);
        const mapped = imported.map(snapshotToSearchItem);
        setResults(mapped);
        setResultTotal(mapped.length);
        setSelected(mapped.map((offer) => offer.offerId));
        await onRefresh();
        messageApi.success(`已读取${imported.length}个真实商品`);
      } else if (mode === "keyword") {
        await runSearchRequests(values.map((value) => ({
          mode: "keyword" as const,
          query: value,
          page: 1,
          pageSize: 20,
          ...requestFilters()
        })));
      } else {
        await runSearchRequests(values.map((value) => ({
          mode: "imageUrl" as const,
          imageUrl: value,
          ...requestFilters()
        })));
      }
      setSearched(true); setBatchOpen(false);
    } catch (error) { messageApi.error(errorMessage(error, "批量搜索失败")); }
    finally { setLoading(false); }
  }

  async function chooseImages(files: FileList | null) {
    if (!files) return;
    const remaining = 10 - images.length;
    const candidates = [...files].slice(0, remaining);
    if (files.length > remaining) messageApi.warning("单次最多选择10张图片");
    const accepted: SelectedImage[] = [];
    for (const file of candidates) {
      if (!(["image/jpeg", "image/png"] as string[]).includes(file.type)) {
        messageApi.warning(`${file.name} 不是 jpg/jpeg/png 图片`);
        continue;
      }
      if (file.size > 3 * 1024 * 1024) {
        messageApi.warning(`${file.name} 超过1688官方图搜3MB限制`);
        continue;
      }
      accepted.push({
        id: `${file.name}-${file.size}-${file.lastModified}`,
        name: file.name,
        dataUrl: await fileToDataUrl(file)
      });
    }
    setImages((current) => [...current, ...accepted].slice(0, 10));
  }

  async function distribute(offerIds = selected) {
    if (offerIds.length === 0) return messageApi.warning("请先选择商品");
    if (stores.length === 0) { onNeedStores(); return; }
    setLoading(true);
    try {
      const imported = await importOffers(offerIds);
      await onRefresh();
      await createDistributionBatch({ offerIds: imported.map((offer) => offer.offerId), storeIds: stores.map((store) => store.id), strategy: "ORDERED_AVERAGED" });
      await onCreated();
    }
    catch (error) { messageApi.error(errorMessage(error, "创建铺货任务失败")); }
    finally { setLoading(false); }
  }

  function changeMode(value: SearchMode) {
    setMode(value);
    setQuery("");
    setBatchOpen(false);
    setSearched(false);
    setResults([]);
    setSelected([]);
    setPage(1);
  }

  function changeSort(next: "comprehensive" | "price" | "sales") {
    const nextOrder = next === sortBy && sortOrder === "asc" ? "desc" : "asc";
    setSortBy(next);
    setSortOrder(nextOrder);
    setResults((current) => sortSearchItems(current, next, nextOrder));
  }

  const searchPlaceholder = mode === "keyword"
    ? "请输入关键词"
    : mode === "image"
      ? "可粘贴图片链接，或上传图片（关键词选填）"
      : mode === "imageUrl"
        ? "请粘贴可公开访问的图片链接"
        : mode === "product"
          ? "请输入1688商品链接或Offer ID"
          : "官方暂未开放任意店铺链接搜货";
  const filterable = mode === "keyword" || mode === "image" || mode === "imageUrl";

  return <section className="content-card search-page">
    {contextHolder}<SourcingWordmark large />
    <div className="search-tabs">{(["keyword", "image", "imageUrl", "product", "store"] as SearchMode[]).map((value) => <button key={value} className={mode === value ? "active" : ""} onClick={() => changeMode(value)}>{searchModeLabel(value)}</button>)}</div>
    <div className="central-search-row"><Input value={query} onChange={(event) => setQuery(event.target.value)} onPressEnter={() => void searchOrImport()} placeholder={searchPlaceholder} disabled={mode === "store"} /><Button type="primary" loading={loading} disabled={mode === "store"} onClick={() => void searchOrImport()}>搜索</Button><Button disabled={mode === "store"} onClick={() => mode === "image" ? document.getElementById("image-search-file-input")?.click() : setBatchOpen((current) => !current)}>批量搜索</Button></div>
    {mode === "image" && <div className={`image-upload-panel ${searched ? "searched" : ""}`}><div className="image-upload-list">{images.map((image) => <div className="image-upload-item" key={image.id}><img src={image.dataUrl} alt={image.name} /><button aria-label={`移除${image.name}`} onClick={() => setImages((current) => current.filter((item) => item.id !== image.id))}>×</button></div>)}<label className="image-upload-button"><PlusOutlined /><span>点击上传</span><input id="image-search-file-input" type="file" accept="image/jpeg,image/png" multiple onChange={(event) => { void chooseImages(event.currentTarget.files); event.currentTarget.value = ""; }} /></label></div><p>最多10张；单张不超过3MB；支持 jpg、jpeg、png。图片将通过1688官方图搜逐张查询并合并去重。</p></div>}
    {batchOpen && <div className="batch-search-panel"><Input.TextArea value={batchInput} onChange={(event) => setBatchInput(event.target.value)} placeholder={mode === "product" ? "批量粘贴商品链接或Offer ID，每行一条，最多20条" : mode === "imageUrl" ? "批量粘贴图片链接，每行一条，最多10条" : "批量粘贴关键词，每行一条，最多10条"} /><div className="batch-search-actions"><Button type="primary" loading={loading} onClick={batchSearch}>确定</Button><Button onClick={() => setBatchOpen(false)}>取消</Button></div></div>}
    {mode === "store" && <Alert className="capability-alert" type="info" showIcon title="1688公开方案暂未提供任意店铺链接搜货接口" description="晓风的店铺搜索可能来自私有能力或多接口组合。电潮保留入口等待正式获权，不会使用合作供应商列表冒充店铺商品。" />}
    {filterable && searched && <div className="search-filter-panel"><div><b>官方筛选</b>{OFFICIAL_SEARCH_TAGS.map((filter) => <button key={filter.value} className={tagFilters.includes(filter.value) ? "active" : ""} onClick={() => setTagFilters((current) => current.includes(filter.value) ? current.filter((value) => value !== filter.value) : [...current, filter.value])}>{filter.label}</button>)}</div><div><b>价格区间</b><Input value={priceMin} type="number" min={0} placeholder="最低价/元" onChange={(event) => setPriceMin(event.target.value)} /><span>—</span><Input value={priceMax} type="number" min={0} placeholder="最高价/元" onChange={(event) => setPriceMax(event.target.value)} />{mode === "keyword" && <><b className="quantity-label">最小起批</b><Input value={quantityBegin} type="number" min={1} placeholder="件数" onChange={(event) => setQuantityBegin(event.target.value)} /></>}</div><div className="search-sort"><b>结果排序</b>{([['comprehensive', '综合排序'], ['sales', '代发销量'], ['price', '代发价格']] as const).map(([value, label]) => <button key={value} className={sortBy === value ? "active" : ""} onClick={() => changeSort(value)}>{label}{sortBy === value && value !== "comprehensive" ? (sortOrder === "asc" ? " ↑" : " ↓") : ""}</button>)}</div></div>}
    {searched && <div className="search-results"><div className="search-result-title"><b>1688搜索结果</b><span>当前显示 {results.length} 条{resultTotal !== results.length ? ` · 接口共返回 ${resultTotal} 条记录` : ""}</span></div>{results.length ? <SearchOfferGrid offers={results} selected={selected} onChange={setSelected} onDistributeOne={(offerId) => distribute([offerId])} /> : <Empty description="1688接口未返回匹配商品" />}{mode === "keyword" && batchInput.trim() === "" && resultTotal > 20 && <div className="search-pagination"><Button disabled={page <= 1 || loading} onClick={() => void searchOrImport(page - 1)}>上一页</Button><span>第 {page} 页</span><Button disabled={page * 20 >= resultTotal || loading} onClick={() => void searchOrImport(page + 1)}>下一页</Button></div>}{selected.length > 0 && <Button type="primary" loading={loading} className="search-distribute" onClick={() => distribute()}>批量铺货（{selected.length}）</Button>}</div>}
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

function SearchOfferGrid({ offers, selected, onChange, onDistributeOne }: { offers: OfferSearchItem[]; selected: string[]; onChange: (ids: string[]) => void; onDistributeOne: (offerId: string) => void }) {
  return <div className="offer-grid">{offers.map((offer) => {
    const checked = selected.includes(offer.offerId);
    const toggle = () => onChange(checked ? selected.filter((id) => id !== offer.offerId) : [...selected, offer.offerId]);
    const labels = [...new Set([...(offer.tags ?? []), ...(offer.serviceLabels ?? [])])];
    const monthlyVolume = offer.monthlySoldCount ?? offer.soldCount;
    const facts = [
      monthlyVolume === undefined ? undefined : ["月代发", String(monthlyVolume)],
      offer.availableStock === undefined ? undefined : ["可售库存", String(offer.availableStock)],
      offer.skuCount === undefined ? undefined : ["SKU", String(offer.skuCount)],
      offer.repurchaseRatePercent === undefined ? undefined : ["复购率", `${offer.repurchaseRatePercent}%`],
      offer.qualityScore === undefined ? undefined : ["质量分", String(offer.qualityScore)],
      offer.qualityRefundRatePercent === undefined ? undefined : ["品质退款", `${offer.qualityRefundRatePercent}%`]
    ].filter((value): value is string[] => Boolean(value));
    return <article className={`offer-card search-offer-card ${checked ? "selected" : ""}`} key={offer.offerId} role="button" tabIndex={0} onClick={toggle} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") toggle(); }}>
      <div className="offer-check"><Checkbox checked={checked} /></div>
      <Image preview={false} src={offer.imageUrl ?? logoUrl} fallback={logoUrl} alt={offer.title} referrerPolicy="no-referrer" />
      <div className="offer-card-body">
        <h3>{offer.title}</h3>
        {(offer.supplierName || offer.supplierLocation || offer.supplierYears !== undefined) && <div className="offer-supplier">
          {offer.supplierYears !== undefined && <b>{offer.supplierYears}年</b>}
          {offer.supplierLocation && <span>{offer.supplierLocation}</span>}
          {offer.supplierName && <span>{offer.supplierName}</span>}
        </div>}
        <div className="offer-price-row"><div className="offer-price">{offer.priceCents === undefined ? "价格以详情为准" : `¥${(offer.priceCents / 100).toFixed(2)}`}</div>{offer.shipWithinHours !== undefined && <span>{offer.shipWithinHours}H内发货</span>}</div>
        {labels.length > 0 && <div className="offer-tags">{labels.slice(0, 4).map((tag) => <Tag key={tag}>{tag}</Tag>)}</div>}
        {facts.length > 0 && <div className="offer-facts">{facts.map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div>}
        {(offer.encryptedWaybillChannels?.length || offer.distributionCount !== undefined || offer.supportsMaterials !== undefined) && <div className="offer-capabilities">
          {offer.encryptedWaybillChannels?.length ? <span>密文面单 {offer.encryptedWaybillChannels.join(" · ")}</span> : null}
          {offer.distributionCount !== undefined && <span>铺货数 {offer.distributionCount}</span>}
          {offer.supportsMaterials !== undefined && <span>铺货素材 {offer.supportsMaterials ? "已支持" : "未支持"}</span>}
        </div>}
        <div className="offer-meta"><a href={offer.detailUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>Offer {offer.offerId}</a></div>
        <Button type="primary" block onClick={(event) => { event.stopPropagation(); onDistributeOne(offer.offerId); }}>立即铺货</Button>
      </div>
    </article>;
  })}</div>;
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
function yuanToCents(value: string): number | undefined { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 && value.trim() ? Math.round(parsed * 100) : undefined; }
function fileToDataUrl(file: File): Promise<string> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("图片读取失败")); reader.onerror = () => reject(new Error(`无法读取图片：${file.name}`)); reader.readAsDataURL(file); }); }
function snapshotToSearchItem(offer: OfferSnapshot): OfferSearchItem { return { offerId: offer.offerId, title: offer.title, ...(offer.imageUrls[0] ? { imageUrl: offer.imageUrls[0] } : {}), detailUrl: `https://detail.1688.com/offer/${offer.offerId}.html`, priceCents: minimumPrice(offer), tags: [], source: "product" }; }
function sortSearchItems(items: OfferSearchItem[], sortBy: "comprehensive" | "price" | "sales", order: "asc" | "desc"): OfferSearchItem[] { if (sortBy === "comprehensive") return items; const field = sortBy === "price" ? "priceCents" : "soldCount"; const factor = order === "asc" ? 1 : -1; return [...items].sort((left, right) => { const leftValue = left[field]; const rightValue = right[field]; if (leftValue === undefined) return rightValue === undefined ? 0 : 1; if (rightValue === undefined) return -1; return (leftValue - rightValue) * factor; }); }
function formatDateTime(value: string): string { return new Date(value).toLocaleString("zh-CN", { hour12: false }); }
function errorMessage(error: unknown, fallback: string): string { return error instanceof Error ? error.message : fallback; }
