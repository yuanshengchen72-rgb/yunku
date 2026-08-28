import type { OfferSnapshot } from "../../shared/contracts.js";

export interface GetProductInfoInput {
  tenantId: string;
  offerId: string;
}

export interface Alibaba1688Connector {
  getProductInfo(input: GetProductInfoInput): Promise<OfferSnapshot>;
}
