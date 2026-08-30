import { z } from "zod";

export const importOfferRequestSchema = z.object({
  offerUrlOrId: z.string().trim().min(1).max(500)
});

export type ImportOfferRequest = z.infer<typeof importOfferRequestSchema>;

export const importOffersRequestSchema = z.object({
  offerUrlOrIds: z.array(z.string().trim().min(1).max(500)).min(1).max(20)
});

export type ImportOffersRequest = z.infer<typeof importOffersRequestSchema>;

export const offerSkuSchema = z.object({
  sourceSkuId: z.string(),
  attributes: z.record(z.string(), z.string()),
  priceCents: z.number().int().nonnegative(),
  availableStock: z.number().int().nonnegative()
});

export const offerSnapshotSchema = z.object({
  offerId: z.string(),
  title: z.string(),
  categoryId: z.string(),
  imageUrls: z.array(z.url()),
  detailHtml: z.string(),
  skus: z.array(offerSkuSchema).min(1),
  importedAt: z.iso.datetime()
});

export type OfferSnapshot = z.infer<typeof offerSnapshotSchema>;

export const distributionStrategySchema = z.enum([
  "ORDERED_AVERAGED",
  "RANDOM_AVERAGED",
  "RANDOM",
  "MANUAL"
]);

export type DistributionStrategy = z.infer<typeof distributionStrategySchema>;

export const storeStatusSchema = z.enum([
  "NORMAL",
  "CREDENTIAL_INVALID",
  "WHITELIST_ABNORMAL"
]);

export const wechatStoreSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  appIdMasked: z.string(),
  platform: z.literal("WECHAT_SHOP"),
  status: storeStatusSchema,
  statusMessage: z.string().optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
});

export type WechatStore = z.infer<typeof wechatStoreSchema>;

export const bindWechatStoreRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
  appId: z.string().trim().min(6).max(128),
  appSecret: z.string().trim().min(8).max(256)
});

export type BindWechatStoreRequest = z.infer<typeof bindWechatStoreRequestSchema>;

export const createDistributionBatchRequestSchema = z.object({
  offerIds: z.array(z.string().regex(/^\d{6,30}$/)).min(1).max(20),
  storeIds: z.array(z.string().uuid()).min(1),
  strategy: distributionStrategySchema,
  manualAssignments: z.array(z.object({
    offerId: z.string().regex(/^\d{6,30}$/),
    storeId: z.string().uuid()
  })).max(20).optional()
}).superRefine((value, context) => {
  if (value.strategy !== "MANUAL") return;
  const assignments = value.manualAssignments ?? [];
  const assignmentByOffer = new Map(assignments.map((item) => [item.offerId, item.storeId]));
  if (assignmentByOffer.size !== value.offerIds.length
    || value.offerIds.some((offerId) => !assignmentByOffer.has(offerId))) {
    context.addIssue({
      code: "custom",
      path: ["manualAssignments"],
      message: "手动分配时需要为每个商品选择一个店铺"
    });
  }
  if (assignments.some((item) => !value.offerIds.includes(item.offerId)
    || !value.storeIds.includes(item.storeId))) {
    context.addIssue({
      code: "custom",
      path: ["manualAssignments"],
      message: "手动分配包含未选择的商品或店铺"
    });
  }
});

export type CreateDistributionBatchRequest = z.infer<typeof createDistributionBatchRequestSchema>;

export const distributionJobStatusSchema = z.enum([
  "QUEUED",
  "PROCESSING",
  "SUBMITTED",
  "REVIEWING",
  "LISTED",
  "FAILED"
]);

export const distributionJobSchema = z.object({
  id: z.string().uuid(),
  batchId: z.string().uuid(),
  offerId: z.string(),
  offerTitle: z.string(),
  storeId: z.string().uuid(),
  storeName: z.string(),
  status: distributionJobStatusSchema,
  statusMessage: z.string().optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
});

export type DistributionJob = z.infer<typeof distributionJobSchema>;

export const distributionBatchSchema = z.object({
  id: z.string().uuid(),
  recordNumber: z.number().int().positive(),
  strategy: distributionStrategySchema,
  targetStoreCount: z.number().int().positive(),
  taskCount: z.number().int().positive(),
  status: z.enum(["QUEUED", "RUNNING", "SUCCESS", "PARTIAL_SUCCESS", "FAILED"]),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  jobs: z.array(distributionJobSchema).optional()
});

export type DistributionBatch = z.infer<typeof distributionBatchSchema>;
