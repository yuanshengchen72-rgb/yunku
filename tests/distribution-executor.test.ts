import { describe, expect, it, vi } from "vitest";
import { DistributionExecutor } from "../src/domain/distribution-executor.js";
import {
  InMemoryDistributionRepository,
  InMemoryOfferSnapshotRepository,
  InMemoryWechatStoreRepository
} from "../src/domain/ports.js";
import type { OfferSnapshot } from "../src/shared/contracts.js";

describe("DistributionExecutor", () => {
  it("resumes a queued batch that existed before the executor started", async () => {
    const tenantId = "buyer-restart";
    const offers = new InMemoryOfferSnapshotRepository();
    const stores = new InMemoryWechatStoreRepository();
    const distributions = new InMemoryDistributionRepository();
    const offer: OfferSnapshot = {
      offerId: "789870588118",
      title: "待续跑商品",
      categoryId: "201000000",
      imageUrls: ["https://img.example.com/main.jpg"],
      detailHtml: "<p>商品详情</p>",
      skus: [{
        sourceSkuId: "sku-1",
        attributes: { 颜色: "黑色" },
        priceCents: 4200,
        availableStock: 99
      }],
      importedAt: "2026-08-30T00:00:00.000Z"
    };
    await offers.save(tenantId, offer);
    const store = await stores.save(tenantId, {
      id: "a6b54cb0-fc3f-4bb7-977c-27e1d7fa76f4",
      name: "恒品男装",
      appId: "wx-app-id",
      appSecret: "wx-app-secret",
      status: "NORMAL"
    });
    const batch = await distributions.createBatch(tenantId, {
      offerIds: [offer.offerId],
      stores: [store],
      offers: [offer],
      strategy: "ORDERED_AVERAGED"
    });
    const publishProduct = vi.fn(async () => ({
      productId: "wx-product-1",
      status: "REVIEWING" as const,
      statusMessage: "商品已提交微信小店审核（商品ID：wx-product-1）"
    }));

    const executor = new DistributionExecutor(distributions, stores, offers, { publishProduct });
    await executor.drainPending();

    const completed = await distributions.findBatch(tenantId, batch.id);
    expect(publishProduct).toHaveBeenCalledOnce();
    expect(completed?.status).toBe("SUCCESS");
    expect(completed?.jobs?.[0]).toMatchObject({
      status: "REVIEWING",
      statusMessage: "商品已提交微信小店审核（商品ID：wx-product-1）"
    });
  });
});
