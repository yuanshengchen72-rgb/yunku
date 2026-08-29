import type {
  DistributionBatch,
  DistributionStrategy,
  OfferSnapshot,
  WechatStore
} from "../shared/contracts.js";

export interface OfferSnapshotRepository {
  save(tenantId: string, snapshot: OfferSnapshot): Promise<void>;
  findByOfferId(tenantId: string, offerId: string): Promise<OfferSnapshot | undefined>;
  list(tenantId: string, query?: string): Promise<OfferSnapshot[]>;
}

export class InMemoryOfferSnapshotRepository implements OfferSnapshotRepository {
  private readonly records = new Map<string, OfferSnapshot>();

  async save(tenantId: string, snapshot: OfferSnapshot): Promise<void> {
    this.records.set(`${tenantId}:${snapshot.offerId}`, snapshot);
  }

  async findByOfferId(tenantId: string, offerId: string): Promise<OfferSnapshot | undefined> {
    return this.records.get(`${tenantId}:${offerId}`);
  }

  async list(tenantId: string, query = ""): Promise<OfferSnapshot[]> {
    const normalized = query.trim().toLowerCase();
    return [...this.records.entries()]
      .filter(([key]) => key.startsWith(`${tenantId}:`))
      .map(([, value]) => value)
      .filter((value) => !normalized
        || value.title.toLowerCase().includes(normalized)
        || value.offerId.includes(normalized))
      .sort((left, right) => right.importedAt.localeCompare(left.importedAt));
  }
}

export interface WechatStoreSecret {
  store: WechatStore;
  appId: string;
  appSecret: string;
}

export interface WechatStoreRepository {
  list(tenantId: string): Promise<WechatStore[]>;
  findSecret(tenantId: string, storeId: string): Promise<WechatStoreSecret | undefined>;
  save(tenantId: string, input: {
    id: string;
    name: string;
    appId: string;
    appSecret: string;
    status: WechatStore["status"];
    statusMessage?: string;
  }): Promise<WechatStore>;
  remove(tenantId: string, storeId: string): Promise<boolean>;
}

export class InMemoryWechatStoreRepository implements WechatStoreRepository {
  private readonly records = new Map<string, WechatStoreSecret>();

  async list(tenantId: string): Promise<WechatStore[]> {
    return [...this.records.entries()]
      .filter(([key]) => key.startsWith(`${tenantId}:`))
      .map(([, value]) => value.store)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async findSecret(tenantId: string, storeId: string): Promise<WechatStoreSecret | undefined> {
    return this.records.get(`${tenantId}:${storeId}`);
  }

  async save(tenantId: string, input: {
    id: string;
    name: string;
    appId: string;
    appSecret: string;
    status: WechatStore["status"];
    statusMessage?: string;
  }): Promise<WechatStore> {
    const previousEntry = [...this.records.entries()].find(([key, value]) =>
      key.startsWith(`${tenantId}:`) && value.appId === input.appId
    );
    const storeId = previousEntry?.[1].store.id ?? input.id;
    const previous = previousEntry?.[1] ?? this.records.get(`${tenantId}:${storeId}`);
    const now = new Date().toISOString();
    const store: WechatStore = {
      id: storeId,
      name: input.name,
      appIdMasked: maskAppId(input.appId),
      platform: "WECHAT_SHOP",
      status: input.status,
      ...(input.statusMessage ? { statusMessage: input.statusMessage } : {}),
      createdAt: previous?.store.createdAt ?? now,
      updatedAt: now
    };
    this.records.set(`${tenantId}:${storeId}`, {
      store,
      appId: input.appId,
      appSecret: input.appSecret
    });
    return store;
  }

  async remove(tenantId: string, storeId: string): Promise<boolean> {
    return this.records.delete(`${tenantId}:${storeId}`);
  }
}

export interface DistributionRepository {
  createBatch(tenantId: string, input: {
    offerIds: string[];
    stores: WechatStore[];
    offers: OfferSnapshot[];
    strategy: DistributionStrategy;
  }): Promise<DistributionBatch>;
  listBatches(tenantId: string): Promise<DistributionBatch[]>;
  findBatch(tenantId: string, batchId: string): Promise<DistributionBatch | undefined>;
}

export class InMemoryDistributionRepository implements DistributionRepository {
  private readonly records = new Map<string, DistributionBatch[]>();

  async createBatch(tenantId: string, input: {
    offerIds: string[];
    stores: WechatStore[];
    offers: OfferSnapshot[];
    strategy: DistributionStrategy;
  }): Promise<DistributionBatch> {
    const { randomUUID } = await import("node:crypto");
    const now = new Date().toISOString();
    const batches = this.records.get(tenantId) ?? [];
    const id = randomUUID();
    const offerById = new Map(input.offers.map((offer) => [offer.offerId, offer]));
    const jobs = input.offerIds.flatMap((offerId) => input.stores.map((store) => ({
      id: randomUUID(),
      batchId: id,
      offerId,
      offerTitle: offerById.get(offerId)?.title ?? offerId,
      storeId: store.id,
      storeName: store.name,
      status: "QUEUED" as const,
      statusMessage: "已创建铺货任务，等待执行",
      createdAt: now,
      updatedAt: now
    })));
    const batch: DistributionBatch = {
      id,
      recordNumber: batches.length + 1,
      strategy: input.strategy,
      targetStoreCount: input.stores.length,
      taskCount: jobs.length,
      status: "QUEUED",
      createdAt: now,
      updatedAt: now,
      jobs
    };
    this.records.set(tenantId, [batch, ...batches]);
    return batch;
  }

  async listBatches(tenantId: string): Promise<DistributionBatch[]> {
    return (this.records.get(tenantId) ?? []).map(({ jobs: _jobs, ...batch }) => batch);
  }

  async findBatch(tenantId: string, batchId: string): Promise<DistributionBatch | undefined> {
    return this.records.get(tenantId)?.find((batch) => batch.id === batchId);
  }
}

export function maskAppId(appId: string): string {
  if (appId.length <= 8) return `${appId.slice(0, 2)}****${appId.slice(-2)}`;
  return `${appId.slice(0, 6)}****${appId.slice(-4)}`;
}
