import { describe, expect, it } from "vitest";
import { resolveDistributionAssignments } from "../src/domain/ports.js";
import { createDistributionBatchRequestSchema, type WechatStore } from "../src/shared/contracts.js";

const stores: WechatStore[] = ["一店", "二店"].map((name, index) => ({
  id: `00000000-0000-4000-8000-00000000000${index}`,
  name,
  appIdMasked: "wx1234****7890",
  platform: "WECHAT_SHOP",
  status: "NORMAL",
  createdAt: "2026-08-30T00:00:00.000Z",
  updatedAt: "2026-08-30T00:00:00.000Z"
}));

describe("distribution strategies", () => {
  const offerIds = ["1000001", "1000002", "1000003", "1000004"];

  it("assigns ordered offers evenly in store order", () => {
    const result = resolveDistributionAssignments({ offerIds, stores, strategy: "ORDERED_AVERAGED" });
    expect(result.map((item) => item.store.name)).toEqual(["一店", "二店", "一店", "二店"]);
  });

  it("assigns each offer to a random store", () => {
    const values = [0.1, 0.9, 0.2, 0.8];
    const result = resolveDistributionAssignments({
      offerIds,
      stores,
      strategy: "RANDOM",
      random: () => values.shift() ?? 0
    });
    expect(result.map((item) => item.store.name)).toEqual(["一店", "二店", "一店", "二店"]);
  });

  it("randomizes offer order while keeping store counts balanced", () => {
    const result = resolveDistributionAssignments({ offerIds, stores, strategy: "RANDOM_AVERAGED", random: () => 0 });
    expect(result.map((item) => item.offerId)).not.toEqual(offerIds);
    expect(result.filter((item) => item.store.name === "一店")).toHaveLength(2);
    expect(result.filter((item) => item.store.name === "二店")).toHaveLength(2);
  });

  it("honors the store selected for every manually assigned offer", () => {
    const result = resolveDistributionAssignments({
      offerIds: offerIds.slice(0, 2),
      stores,
      strategy: "MANUAL",
      manualAssignments: [
        { offerId: "1000001", storeId: stores[1]!.id },
        { offerId: "1000002", storeId: stores[0]!.id }
      ]
    });
    expect(result.map((item) => item.store.name)).toEqual(["二店", "一店"]);
  });

  it("rejects incomplete manual assignments at the API boundary", () => {
    const result = createDistributionBatchRequestSchema.safeParse({
      offerIds: ["1000001", "1000002"],
      storeIds: stores.map((store) => store.id),
      strategy: "MANUAL",
      manualAssignments: [{ offerId: "1000001", storeId: stores[0]!.id }]
    });
    expect(result.success).toBe(false);
  });
});
