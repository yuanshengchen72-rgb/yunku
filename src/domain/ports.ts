import type { OfferSnapshot } from "../shared/contracts.js";

export interface OfferSnapshotRepository {
  save(tenantId: string, snapshot: OfferSnapshot): Promise<void>;
  findByOfferId(tenantId: string, offerId: string): Promise<OfferSnapshot | undefined>;
}

export class InMemoryOfferSnapshotRepository implements OfferSnapshotRepository {
  private readonly records = new Map<string, OfferSnapshot>();

  async save(tenantId: string, snapshot: OfferSnapshot): Promise<void> {
    this.records.set(`${tenantId}:${snapshot.offerId}`, snapshot);
  }

  async findByOfferId(tenantId: string, offerId: string): Promise<OfferSnapshot | undefined> {
    return this.records.get(`${tenantId}:${offerId}`);
  }
}
