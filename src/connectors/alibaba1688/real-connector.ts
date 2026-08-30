import type {
  Alibaba1688Connector,
  GetProductInfoInput,
  SearchOffersInput
} from "./connector.js";
import { offerSearchResultSchema, type OfferSearchItem, type OfferSearchResult, type OfferSnapshot } from "../../shared/contracts.js";
import { Alibaba1688ApiClient, AlibabaApiError } from "./api-client.js";
import type { AlibabaAuthorization, AlibabaAuthorizationRepository } from "./auth-store.js";
import { AlibabaOAuthClient } from "./oauth.js";
import { mapAlibabaProductInfo, mapAlibabaProductInfoSearchEnrichment } from "./product-mapper.js";
import { mapAlibabaImageSearch, mapAlibabaKeywordSearch } from "./search-mapper.js";

export class AlibabaAuthorizationRequiredError extends Error {}

export class RealAlibaba1688Connector implements Alibaba1688Connector {
  constructor(
    private readonly apiClient: Alibaba1688ApiClient,
    private readonly oauthClient: AlibabaOAuthClient,
    private readonly authorizations: AlibabaAuthorizationRepository
  ) {}

  async getProductInfo(input: GetProductInfoInput): Promise<OfferSnapshot> {
    return this.withAuthorization(input.tenantId, (authorization) => (
      this.fetchProduct(authorization, input.offerId)
    ));
  }

  async searchOffers(input: SearchOffersInput): Promise<OfferSearchResult> {
    return this.withAuthorization(input.tenantId, (authorization) => (
      this.fetchSearch(authorization, input)
    ));
  }

  private async withAuthorization<T>(
    tenantId: string,
    operation: (authorization: AlibabaAuthorization) => Promise<T>
  ): Promise<T> {
    let authorization = await this.authorizations.findByTenantId(tenantId);
    if (!authorization) {
      throw new AlibabaAuthorizationRequiredError("请先授权1688账号");
    }
    authorization = await this.refreshIfExpiring(authorization);

    try {
      return await operation(authorization);
    } catch (error) {
      if (!authorization.refreshToken || !this.looksLikeExpiredToken(error)) throw error;
      authorization = await this.oauthClient.refreshAuthorization(authorization);
      await this.authorizations.upsert(authorization);
      return operation(authorization);
    }
  }

  private async refreshIfExpiring(authorization: AlibabaAuthorization) {
    const expiresAt = authorization.accessTokenExpiresAt?.getTime();
    if (!expiresAt || expiresAt > Date.now() + 2 * 60 * 1000) return authorization;
    const refreshed = await this.oauthClient.refreshAuthorization(authorization);
    await this.authorizations.upsert(refreshed);
    return refreshed;
  }

  private async fetchProduct(authorization: AlibabaAuthorization, offerId: string) {
    const payload = await this.fetchProductPayload(authorization, offerId);
    return mapAlibabaProductInfo(payload, offerId);
  }

  private fetchProductPayload(authorization: AlibabaAuthorization, offerId: string) {
    return this.apiClient.call(
      "com.alibaba.fenxiao",
      "alibaba.fenxiao.productInfo.get",
      "1",
      authorization.accessToken,
      { offerId }
    );
  }

  private async fetchSearch(
    authorization: AlibabaAuthorization,
    input: SearchOffersInput
  ): Promise<OfferSearchResult> {
    if (input.mode === "keyword") {
      const param = {
        keywords: input.query,
        pageNum: input.page,
        pageSize: input.pageSize,
        ...(input.categoryIds?.length ? { categoryIds: input.categoryIds } : {}),
        ...(input.tags?.length ? { filter: input.tags } : {}),
        ...(input.priceMinCents !== undefined ? { priceStart: centsToYuan(input.priceMinCents) } : {}),
        ...(input.priceMaxCents !== undefined ? { priceEnd: centsToYuan(input.priceMaxCents) } : {}),
        ...(input.quantityBegin !== undefined ? { quantityBegin: input.quantityBegin } : {})
      };
      const payload = await this.apiClient.call(
        "com.alibaba.fenxiao",
        "product.keywords.search",
        "1",
        authorization.accessToken,
        { param: JSON.stringify(param) }
      );
      const result = mapAlibabaKeywordSearch(payload, {
        page: input.page,
        pageSize: input.pageSize,
        sortBy: input.sortBy,
        sortOrder: input.sortOrder
      });
      return this.enrichSearchResult(authorization, result);
    }

    const payload = await this.apiClient.call(
      "com.alibaba.product",
      "alibaba.public.image.similar.offer.search",
      "1",
      authorization.accessToken,
      {
        ...(input.mode === "image"
          ? { imgBase64: stripDataUrlPrefix(input.imageBase64) }
          : { imgUrl: input.imageUrl }),
        ...(input.imageKeywords ? { imageKeywords: input.imageKeywords } : {}),
        ...(input.tags?.length ? { filter: JSON.stringify(input.tags) } : {}),
        ...(input.priceMinCents !== undefined ? { priceStart: centsToYuan(input.priceMinCents) } : {}),
        ...(input.priceMaxCents !== undefined ? { priceEnd: centsToYuan(input.priceMaxCents) } : {})
      }
    );
    const result = mapAlibabaImageSearch(payload, {
      source: input.mode,
      sortBy: input.sortBy,
      sortOrder: input.sortOrder
    });
    return this.enrichSearchResult(authorization, result);
  }

  private async enrichSearchResult(
    authorization: AlibabaAuthorization,
    result: OfferSearchResult
  ): Promise<OfferSearchResult> {
    let failed = 0;
    const items = await mapWithConcurrency(result.items, 5, async (item) => {
      try {
        const payload = await this.fetchProductPayload(authorization, item.offerId);
        const enrichment = mapAlibabaProductInfoSearchEnrichment(payload, item.offerId);
        return mergeSearchItem(item, enrichment);
      } catch {
        failed += 1;
        return item;
      }
    });
    if (failed > 0) {
      console.warn(`[1688] ${failed}/${result.items.length} 个搜索结果未能补充商品详情，已保留原搜索数据`);
    }
    return offerSearchResultSchema.parse({ ...result, items });
  }

  private looksLikeExpiredToken(error: unknown) {
    if (!(error instanceof AlibabaApiError)) return false;
    return /token|授权|401/i.test(`${error.code ?? ""} ${error.message}`);
  }
}

function mergeSearchItem(
  item: OfferSearchItem,
  enrichment: ReturnType<typeof mapAlibabaProductInfoSearchEnrichment>
): OfferSearchItem {
  return {
    ...item,
    ...enrichment,
    priceCents: item.priceCents ?? enrichment.priceCents,
    tags: [...new Set(item.tags)],
    serviceLabels: [...new Set([...(item.serviceLabels ?? []), ...(enrichment.serviceLabels ?? [])])]
  };
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index]!, index);
    }
  });
  await Promise.all(workers);
  return results;
}

function centsToYuan(cents: number): string {
  return (cents / 100).toFixed(2);
}

function stripDataUrlPrefix(value: string): string {
  return value.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
}
