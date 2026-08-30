import type {
  OfferSearchRequest,
  OfferSearchResult,
  OfferSnapshot
} from "../../shared/contracts.js";

export interface GetProductInfoInput {
  tenantId: string;
  offerId: string;
}

export type SearchOffersInput = OfferSearchRequest & { tenantId: string };

export interface Alibaba1688Connector {
  getProductInfo(input: GetProductInfoInput): Promise<OfferSnapshot>;
  searchOffers(input: SearchOffersInput): Promise<OfferSearchResult>;
}
