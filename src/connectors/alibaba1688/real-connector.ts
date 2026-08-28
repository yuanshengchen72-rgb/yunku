import type { Alibaba1688Connector, GetProductInfoInput } from "./connector.js";
import type { OfferSnapshot } from "../../shared/contracts.js";
import { Alibaba1688ApiClient, AlibabaApiError } from "./api-client.js";
import type { AlibabaAuthorization, AlibabaAuthorizationRepository } from "./auth-store.js";
import { AlibabaOAuthClient } from "./oauth.js";
import { mapAlibabaProductInfo } from "./product-mapper.js";

export class AlibabaAuthorizationRequiredError extends Error {}

export class RealAlibaba1688Connector implements Alibaba1688Connector {
  constructor(
    private readonly apiClient: Alibaba1688ApiClient,
    private readonly oauthClient: AlibabaOAuthClient,
    private readonly authorizations: AlibabaAuthorizationRepository
  ) {}

  async getProductInfo(input: GetProductInfoInput): Promise<OfferSnapshot> {
    let authorization = await this.authorizations.findByTenantId(input.tenantId);
    if (!authorization) {
      throw new AlibabaAuthorizationRequiredError("请先授权1688账号");
    }
    authorization = await this.refreshIfExpiring(authorization);

    try {
      return await this.fetchProduct(authorization, input.offerId);
    } catch (error) {
      if (!authorization.refreshToken || !this.looksLikeExpiredToken(error)) throw error;
      authorization = await this.oauthClient.refreshAuthorization(authorization);
      await this.authorizations.upsert(authorization);
      return this.fetchProduct(authorization, input.offerId);
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

  private looksLikeExpiredToken(error: unknown) {
    if (!(error instanceof AlibabaApiError)) return false;
    return /token|授权|401/i.test(`${error.code ?? ""} ${error.message}`);
  }
}
