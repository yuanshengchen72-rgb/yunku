import { parseOfferId } from "./offer-id.js";
import type { Alibaba1688Connector } from "../connectors/alibaba1688/connector.js";
import type { OfferSnapshotRepository } from "./ports.js";

export interface ImportOfferInput {
  tenantId: string;
  offerUrlOrId: string;
}

export class ImportOfferService {
  constructor(
    private readonly connector: Alibaba1688Connector,
    private readonly repository: OfferSnapshotRepository
  ) {}

  async execute(input: ImportOfferInput) {
    const offerId = parseOfferId(input.offerUrlOrId);
    const snapshot = await this.connector.getProductInfo({
      tenantId: input.tenantId,
      offerId
    });
    await this.repository.save(input.tenantId, snapshot);
    return snapshot;
  }
}
