import {
  offerSearchResultSchema,
  type OfferSearchItem,
  type OfferSearchResult
} from "../../shared/contracts.js";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : undefined;
}

function firstValue(record: UnknownRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function nonnegativeInteger(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : undefined;
}

function moneyToCents(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const match = String(value).replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : undefined;
}

function normalizeUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    if (trimmed.startsWith("//")) return new URL(`https:${trimmed}`).toString();
    if (/^\/?img\//i.test(trimmed)) {
      return new URL(trimmed.replace(/^\//, ""), "https://cbu01.alicdn.com/").toString();
    }
    const url = new URL(trimmed);
    if (url.protocol === "http:") url.protocol = "https:";
    if (url.protocol !== "https:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function firstImage(value: unknown): string | undefined {
  const direct = normalizeUrl(value);
  if (direct) return direct;
  if (Array.isArray(value)) {
    for (const item of value) {
      const image = firstImage(item);
      if (image) return image;
    }
    return undefined;
  }
  const record = asRecord(value);
  if (!record) return undefined;
  return firstImage(firstValue(record, ["url", "imageUrl", "imageURI", "original", "images"]));
}

function findOfferArray(payload: unknown, preferredKeys: string[]): unknown[] {
  const root = asRecord(payload);
  if (!root) throw new Error("1688 搜索响应不是对象");
  const queue: UnknownRecord[] = [root];
  const visited = new Set<UnknownRecord>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const key of preferredKeys) {
      const value = current[key];
      if (Array.isArray(value)) return value;
      const nested = asRecord(value);
      if (nested) queue.unshift(nested);
    }
    for (const value of Object.values(current)) {
      const nested = asRecord(value);
      if (nested) queue.push(nested);
    }
  }
  return [];
}

function findPageInfo(payload: unknown): UnknownRecord | undefined {
  const root = asRecord(payload);
  if (!root) return undefined;
  const queue: UnknownRecord[] = [root];
  const visited = new Set<UnknownRecord>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const pageInfo = asRecord(current.pageInfo);
    if (pageInfo) return pageInfo;
    for (const value of Object.values(current)) {
      const nested = asRecord(value);
      if (nested) queue.push(nested);
    }
  }
  return undefined;
}

function offerIdOf(item: UnknownRecord): string | undefined {
  const direct = firstValue(item, ["offerId", "offerID", "productId", "productID", "id"]);
  if (direct !== undefined) {
    const normalized = String(direct);
    if (/^\d{6,30}$/.test(normalized)) return normalized;
  }
  const detailUrl = String(firstValue(item, ["detailUrl", "offerUrl", "productUrl"]) ?? "");
  return detailUrl.match(/\/offer\/(\d{6,30})(?:\.html)?/i)?.[1];
}

function tagsOf(item: UnknownRecord): string[] {
  const result: string[] = [];
  const add = (value: unknown) => {
    const label = String(value ?? "").trim();
    if (label && !result.includes(label)) result.push(label);
  };
  const tags = firstValue(item, ["tags", "tagList", "offerTags", "serviceTags"]);
  if (Array.isArray(tags)) {
    for (const tag of tags) {
      const record = asRecord(tag);
      add(record ? firstValue(record, ["name", "label", "value", "tagName"]) : tag);
    }
  } else if (typeof tags === "string") {
    for (const tag of tags.split(/[,，|]/)) add(tag);
  }
  if (item.isJxhy === true || item.jyFlag === true) add("精选货源");
  if (item.distributionFreePostage === true) add("代发包邮");
  const score = firstValue(item, ["yxScoreLevel", "yxStarLevel"]);
  if (score !== undefined && score !== null && String(score) !== "") add(`严选${score}级`);
  return result;
}

function supplierNameOf(item: UnknownRecord): string | undefined {
  const company = asRecord(firstValue(item, ["companyInfo", "supplierInfo", "sellerInfo"]));
  const value = firstValue(item, ["companyName", "supplierName", "sellerName"])
    ?? (company ? firstValue(company, ["companyName", "name", "supplierName"]) : undefined);
  return value === undefined || value === null ? undefined : String(value);
}

function soldCountOf(item: UnknownRecord): number | undefined {
  const history = asRecord(firstValue(item, ["offerHistoryTradeInfo", "historyTradeInfo", "tradeInfo"]));
  return nonnegativeInteger(firstValue(item, ["soldCount", "saleQuantity", "tradeQuantity", "monthSold"])
    ?? (history ? firstValue(history, ["tradeQuantity", "saleQuantity", "monthSold", "quantity"]) : undefined));
}

function mapItem(value: unknown, source: OfferSearchItem["source"]): OfferSearchItem | undefined {
  const item = asRecord(value);
  if (!item) return undefined;
  const offerId = offerIdOf(item);
  if (!offerId) return undefined;
  const title = String(firstValue(item, ["subject", "title", "offerTitle", "productTitle"]) ?? "未命名商品").trim();
  const imageUrl = firstImage(firstValue(item, ["offerImage", "image", "imageUrl", "mainImage", "mainImageUrl"]));
  const suppliedDetailUrl = normalizeUrl(firstValue(item, ["detailUrl", "offerUrl", "productUrl"]));
  const priceCents = moneyToCents(firstValue(item, [
    "consignPrice",
    "fenxiaoPrice",
    "multipleConsignPrice",
    "offerPrice",
    "price",
    "salePrice"
  ]));
  return {
    offerId,
    title: title || "未命名商品",
    ...(imageUrl ? { imageUrl } : {}),
    detailUrl: suppliedDetailUrl ?? `https://detail.1688.com/offer/${offerId}.html`,
    ...(priceCents !== undefined ? { priceCents } : {}),
    ...(soldCountOf(item) !== undefined ? { soldCount: soldCountOf(item) } : {}),
    ...(supplierNameOf(item) ? { supplierName: supplierNameOf(item) } : {}),
    tags: tagsOf(item),
    source
  };
}

function sortItems(
  items: OfferSearchItem[],
  sortBy: "comprehensive" | "price" | "sales",
  sortOrder: "asc" | "desc"
): OfferSearchItem[] {
  if (sortBy === "comprehensive") return items;
  const factor = sortOrder === "asc" ? 1 : -1;
  const field = sortBy === "price" ? "priceCents" : "soldCount";
  return [...items].sort((left, right) => {
    const leftValue = left[field];
    const rightValue = right[field];
    if (leftValue === undefined) return rightValue === undefined ? 0 : 1;
    if (rightValue === undefined) return -1;
    return (leftValue - rightValue) * factor;
  });
}

export interface SearchMappingOptions {
  page?: number;
  pageSize?: number;
  sortBy?: "comprehensive" | "price" | "sales";
  sortOrder?: "asc" | "desc";
  source?: "image" | "imageUrl";
}

export function mapAlibabaKeywordSearch(
  payload: unknown,
  options: SearchMappingOptions = {}
): OfferSearchResult {
  const pageInfo = findPageInfo(payload);
  const mapped = findOfferArray(payload, ["result", "items", "offers", "offerList"])
    .map((item) => mapItem(item, "keyword"))
    .filter((item): item is OfferSearchItem => Boolean(item));
  const page = positiveInteger(pageInfo?.currentPage ?? pageInfo?.pageNum, options.page ?? 1);
  const pageSize = positiveInteger(pageInfo?.pageSize, options.pageSize ?? Math.max(mapped.length, 1));
  const total = nonnegativeInteger(pageInfo?.totalRecords ?? pageInfo?.total) ?? mapped.length;
  return offerSearchResultSchema.parse({
    items: sortItems(mapped, options.sortBy ?? "comprehensive", options.sortOrder ?? "asc"),
    page,
    pageSize,
    total
  });
}

export function mapAlibabaImageSearch(
  payload: unknown,
  options: SearchMappingOptions = {}
): OfferSearchResult {
  const mapped = findOfferArray(payload, ["imageSearchResult", "result", "items", "offers"])
    .map((item) => mapItem(item, options.source ?? "image"))
    .filter((item): item is OfferSearchItem => Boolean(item));
  return offerSearchResultSchema.parse({
    items: sortItems(mapped, options.sortBy ?? "comprehensive", options.sortOrder ?? "asc"),
    page: 1,
    pageSize: Math.max(mapped.length, 1),
    total: mapped.length
  });
}
