import type {
  DistributionBatch,
  DistributionJob,
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
    manualAssignments?: Array<{ offerId: string; storeId: string }>;
  }): Promise<DistributionBatch>;
  listBatches(tenantId: string): Promise<DistributionBatch[]>;
  findBatch(tenantId: string, batchId: string): Promise<DistributionBatch | undefined>;
  updateExecution(tenantId: string, batchId: string, input: {
    status: DistributionBatch["status"];
    jobs: Array<{
      id: string;
      status: DistributionJob["status"];
      statusMessage?: string;
    }>;
  }): Promise<DistributionBatch | undefined>;
  listPending(limit?: number): Promise<Array<{ tenantId: string; batchId: string }>>;
}

export class InMemoryDistributionRepository implements DistributionRepository {
  private readonly records = new Map<string, DistributionBatch[]>();

  async createBatch(tenantId: string, input: {
    offerIds: string[];
    stores: WechatStore[];
    offers: OfferSnapshot[];
    strategy: DistributionStrategy;
    manualAssignments?: Array<{ offerId: string; storeId: string }>;
  }): Promise<DistributionBatch> {
    const { randomUUID } = await import("node:crypto");
    const now = new Date().toISOString();
    const batches = this.records.get(tenantId) ?? [];
    const id = randomUUID();
    const offerById = new Map(input.offers.map((offer) => [offer.offerId, offer]));
    const assignments = resolveDistributionAssignments(input);
    const jobs = assignments.map(({ offerId, store }) => ({
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
    }));
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

  async updateExecution(tenantId: string, batchId: string, input: {
    status: DistributionBatch["status"];
    jobs: Array<{
      id: string;
      status: DistributionJob["status"];
      statusMessage?: string;
    }>;
  }): Promise<DistributionBatch | undefined> {
    const batches = this.records.get(tenantId);
    const batch = batches?.find((candidate) => candidate.id === batchId);
    if (!batch) return undefined;
    const now = new Date().toISOString();
    const updates = new Map(input.jobs.map((job) => [job.id, job]));
    batch.jobs = batch.jobs?.map((job) => {
      const update = updates.get(job.id);
      return update ? {
        ...job,
        status: update.status,
        ...(update.statusMessage ? { statusMessage: update.statusMessage } : {}),
        updatedAt: now
      } : job;
    });
    batch.status = input.status;
    batch.updatedAt = now;
    return batch;
  }

  async listPending(limit = 20): Promise<Array<{ tenantId: string; batchId: string }>> {
    const pending: Array<{ tenantId: string; batchId: string }> = [];
    for (const [tenantId, batches] of this.records) {
      for (const batch of batches) {
        if (batch.status === "QUEUED" || batch.status === "RUNNING") {
          pending.push({ tenantId, batchId: batch.id });
          if (pending.length >= limit) return pending;
        }
      }
    }
    return pending;
  }
}

export function resolveDistributionAssignments(input: {
  offerIds: string[];
  stores: WechatStore[];
  strategy: DistributionStrategy;
  manualAssignments?: Array<{ offerId: string; storeId: string }>;
  random?: () => number;
}): Array<{ offerId: string; store: WechatStore }> {
  if (input.stores.length === 0) return [];
  const storeById = new Map(input.stores.map((store) => [store.id, store]));
  if (input.strategy === "MANUAL") {
    const manualByOffer = new Map((input.manualAssignments ?? []).map((item) => [item.offerId, item.storeId]));
    return input.offerIds.map((offerId) => {
      const store = storeById.get(manualByOffer.get(offerId) ?? "");
      if (!store) throw new Error(`商品 ${offerId} 尚未选择铺货店铺`);
      return { offerId, store };
    });
  }

  const random = input.random ?? Math.random;
  if (input.strategy === "RANDOM") {
    return input.offerIds.map((offerId) => ({
      offerId,
      store: input.stores[Math.floor(random() * input.stores.length)]!
    }));
  }

  const offerIds = input.strategy === "RANDOM_AVERAGED"
    ? shuffle(input.offerIds, random)
    : [...input.offerIds];
  return offerIds.map((offerId, index) => ({
    offerId,
    store: input.stores[index % input.stores.length]!
  }));
}

function shuffle<T>(values: T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target]!, result[index]!];
  }
  return result;
}

export function maskAppId(appId: string): string {
  if (appId.length <= 8) return `${appId.slice(0, 2)}****${appId.slice(-2)}`;
  return `${appId.slice(0, 6)}****${appId.slice(-4)}`;
}
