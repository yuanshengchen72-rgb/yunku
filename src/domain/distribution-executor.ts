import type { WechatProductPublication } from "../connectors/wechat-shop/connector.js";
import type { DistributionBatch, DistributionJob, OfferSnapshot } from "../shared/contracts.js";
import type {
  DistributionRepository,
  OfferSnapshotRepository,
  WechatStoreRepository
} from "./ports.js";

export interface WechatProductPublisher {
  publishProduct(appId: string, appSecret: string, offer: OfferSnapshot): Promise<WechatProductPublication>;
}

export class DistributionExecutor {
  private readonly running = new Set<string>();

  constructor(
    private readonly distributions: DistributionRepository,
    private readonly stores: WechatStoreRepository,
    private readonly offers: OfferSnapshotRepository,
    private readonly publisher: WechatProductPublisher
  ) {}

  async runBatch(tenantId: string, batchId: string): Promise<DistributionBatch | undefined> {
    const executionKey = `${tenantId}:${batchId}`;
    if (this.running.has(executionKey)) return this.distributions.findBatch(tenantId, batchId);
    this.running.add(executionKey);
    try {
      const batch = await this.distributions.findBatch(tenantId, batchId);
      if (!batch?.jobs?.length) return batch;

      const executableJobs = batch.jobs.filter((job) =>
        job.status === "QUEUED" || job.status === "PROCESSING"
      );
      if (executableJobs.length === 0) return this.finishBatch(tenantId, batch);

      await this.distributions.updateExecution(tenantId, batchId, {
        status: "RUNNING",
        jobs: executableJobs.map((job) => ({
          id: job.id,
          status: "PROCESSING",
          statusMessage: "正在向微信小店提交商品"
        }))
      });

      for (const job of executableJobs) {
        const result = await this.executeJob(tenantId, job);
        await this.distributions.updateExecution(tenantId, batchId, {
          status: "RUNNING",
          jobs: [result]
        });
      }

      const current = await this.distributions.findBatch(tenantId, batchId);
      return current ? this.finishBatch(tenantId, current) : undefined;
    } finally {
      this.running.delete(executionKey);
    }
  }

  async drainPending(limit = 20): Promise<void> {
    const pending = await this.distributions.listPending(limit);
    for (const batch of pending) await this.runBatch(batch.tenantId, batch.batchId);
  }

  private async executeJob(tenantId: string, job: DistributionJob): Promise<{
    id: string;
    status: DistributionJob["status"];
    statusMessage?: string;
  }> {
    try {
      const [storeSecret, offer] = await Promise.all([
        this.stores.findSecret(tenantId, job.storeId),
        this.offers.findByOfferId(tenantId, job.offerId)
      ]);
      if (!storeSecret) throw new Error("目标微信小店已解绑或不存在");
      if (storeSecret.store.status !== "NORMAL") {
        throw new Error(storeSecret.store.statusMessage ?? "目标微信小店当前不可用");
      }
      if (!offer) throw new Error("1688商品快照不存在，请重新导入后再铺货");
      const publication = await this.publisher.publishProduct(
        storeSecret.appId,
        storeSecret.appSecret,
        offer
      );
      return {
        id: job.id,
        status: publication.status,
        statusMessage: publication.statusMessage
      };
    } catch (error) {
      return {
        id: job.id,
        status: "FAILED",
        statusMessage: errorMessage(error)
      };
    }
  }

  private async finishBatch(
    tenantId: string,
    batch: DistributionBatch
  ): Promise<DistributionBatch | undefined> {
    const jobs = batch.jobs ?? [];
    const successfulCount = jobs.filter((job) =>
      job.status === "SUBMITTED" || job.status === "REVIEWING" || job.status === "LISTED"
    ).length;
    const failedCount = jobs.filter((job) => job.status === "FAILED").length;
    const status: DistributionBatch["status"] = failedCount === 0
      ? "SUCCESS"
      : successfulCount === 0
        ? "FAILED"
        : "PARTIAL_SUCCESS";
    return this.distributions.updateExecution(tenantId, batch.id, { status, jobs: [] });
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.slice(0, 1000);
  return "微信小店发品失败，请稍后重试";
}
