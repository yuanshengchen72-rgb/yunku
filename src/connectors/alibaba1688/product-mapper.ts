import { offerSnapshotSchema, type OfferSnapshot } from "../../shared/contracts.js";

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

function findProductRecord(payload: unknown): UnknownRecord {
  const root = asRecord(payload);
  if (!root) throw new Error("1688 商品详情响应不是对象");
  const queue: UnknownRecord[] = [root];
  const visited = new Set<UnknownRecord>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const title = firstValue(current, ["subject", "title", "offerTitle", "productTitle"]);
    const id = firstValue(current, ["offerId", "offerID", "productId", "productID"]);
    if (title !== undefined && id !== undefined) return current;
    for (const key of ["result", "data", "productInfo", "product", "model"]) {
      const child = asRecord(current[key]);
      if (child) queue.push(child);
    }
  }
  throw new Error("1688 商品详情响应中没有找到商品主体");
}

function imageUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    if (trimmed.startsWith("//")) return new URL(`https:${trimmed}`).toString();
    if (/^\/?img\//i.test(trimmed)) {
      return new URL(trimmed.replace(/^\//, ""), "https://cbu01.alicdn.com/").toString();
    }
    return new URL(trimmed).toString();
  } catch {
    return undefined;
  }
}

function imageUrls(product: UnknownRecord): string[] {
  const collected: string[] = [];
  const add = (value: unknown) => {
    const url = imageUrl(value);
    if (url && !collected.includes(url)) collected.push(url);
  };
  const addList = (value: unknown) => {
    if (!Array.isArray(value)) return;
    for (const item of value) {
      if (typeof item === "string") add(item);
      else {
        const record = asRecord(item);
        if (record) add(firstValue(record, ["url", "imageUrl", "imageURI", "original"]));
      }
    }
  };

  addList(firstValue(product, ["imageUrls", "images", "imageList", "mainImages"]));
  for (const key of ["image", "productImage"]) {
    const image = asRecord(product[key]);
    if (image) addList(firstValue(image, ["images", "imageUrls", "imageList"]));
  }
  add(firstValue(product, ["mainImage", "mainImageUrl", "imageUrl"]));
  return collected;
}

function moneyToCents(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : 0;
}

function nonnegativeInteger(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function skuAttributes(sku: UnknownRecord): Record<string, string> {
  const result: Record<string, string> = {};
  const attributes = firstValue(sku, ["attributes", "skuAttributes", "specAttrs"]);
  if (Array.isArray(attributes)) {
    for (const item of attributes) {
      const attribute = asRecord(item);
      if (!attribute) continue;
      const name = firstValue(attribute, ["attributeDisplayName", "name"])
        ?? (attribute.attributeValue !== undefined ? attribute.attributeName : undefined);
      const value = firstValue(attribute, ["attributeValue", "value", "valueName"])
        ?? (attribute.attributeDisplayName !== undefined ? attribute.attributeName : undefined);
      if (name !== undefined && value !== undefined) result[String(name)] = String(value);
    }
  } else {
    const record = asRecord(attributes);
    if (record) {
      for (const [key, value] of Object.entries(record)) {
        if (typeof value === "string" || typeof value === "number") result[key] = String(value);
      }
    }
  }
  return result;
}

function skuPrice(sku: UnknownRecord): unknown {
  return firstValue(sku, [
    "consignPrice",
    "jxhyPrice",
    "channelPrice",
    "price",
    "retailPrice",
    "salePrice",
    "unitPrice"
  ]);
}

function skus(product: UnknownRecord, offerId: string): OfferSnapshot["skus"] {
  const source = firstValue(product, [
    "skuInfos",
    "productSkuInfos",
    "skuList",
    "skus",
    "skuInfoList"
  ]);
  if (!Array.isArray(source) || source.length === 0) {
    return [{
      sourceSkuId: offerId,
      attributes: {},
      priceCents: moneyToCents(firstValue(product, [
        "consignPrice",
        "jxhyPrice",
        "referencePrice",
        "price",
        "salePrice",
        "unitPrice"
      ])),
      availableStock: nonnegativeInteger(firstValue(product, ["amountOnSale", "stock", "availableStock"]))
    }];
  }
  return source.map((item, index) => {
    const sku = asRecord(item) ?? {};
    return {
      sourceSkuId: String(firstValue(sku, ["specId", "skuId", "skuID", "id"]) ?? `${offerId}-${index + 1}`),
      attributes: skuAttributes(sku),
      priceCents: moneyToCents(skuPrice(sku)),
      availableStock: nonnegativeInteger(firstValue(sku, ["amountOnSale", "canBookCount", "stock", "availableStock"]))
    };
  });
}

export function mapAlibabaProductInfo(payload: unknown, requestedOfferId: string): OfferSnapshot {
  const product = findProductRecord(payload);
  const offerId = String(firstValue(product, ["offerId", "offerID", "productId", "productID"]) ?? requestedOfferId);
  return offerSnapshotSchema.parse({
    offerId,
    title: String(firstValue(product, ["subject", "title", "offerTitle", "productTitle"]) ?? "未命名商品"),
    categoryId: String(firstValue(product, ["categoryId", "categoryID", "category"] ) ?? "unknown"),
    imageUrls: imageUrls(product),
    detailHtml: String(firstValue(product, ["description", "detailHtml", "details", "detail"] ) ?? ""),
    skus: skus(product, offerId),
    importedAt: new Date().toISOString()
  });
}
