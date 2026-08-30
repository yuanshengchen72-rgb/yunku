import type {
  Alibaba1688Connector,
  GetProductInfoInput,
  SearchOffersInput
} from "./connector.js";
import type { OfferSearchResult, OfferSnapshot } from "../../shared/contracts.js";
import { Alibaba1688ApiClient, AlibabaApiError } from "./api-client.js";
import type { AlibabaAuthorization, AlibabaAuthorizationRepository } from "./auth-store.js";
import { AlibabaOAuthClient } from "./oauth.js";
import { mapAlibabaProductInfo } from "./product-mapper.js";
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
    const payload = await this.apiClient.call(
      "com.alibaba.fenxiao",
      "alibaba.fenxiao.productInfo.get",
      "1",
      authorization.accessToken,
      { offerId }
    );
    return mapAlibabaProductInfo(payload, offerId);
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
      return mapAlibabaKeywordSearch(payload, {
        page: input.page,
        pageSize: input.pageSize,
        sortBy: input.sortBy,
        sortOrder: input.sortOrder
      });
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
    return mapAlibabaImageSearch(payload, {
      source: input.mode,
      sortBy: input.sortBy,
      sortOrder: input.sortOrder
    });
  }

  private looksLikeExpiredToken(error: unknown) {
    if (!(error instanceof AlibabaApiError)) return false;
    return /token|授权|401/i.test(`${error.code ?? ""} ${error.message}`);
  }
}

function centsToYuan(cents: number): string {
  return (cents / 100).toFixed(2);
}

function stripDataUrlPrefix(value: string): string {
  return value.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
}
