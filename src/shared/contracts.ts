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
