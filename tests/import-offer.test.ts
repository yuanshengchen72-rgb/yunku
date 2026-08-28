import { describe, expect, it } from "vitest";
import { ImportOfferService } from "../src/domain/import-offer.js";
import { InMemoryOfferSnapshotRepository } from "../src/domain/ports.js";
import { MockAlibaba1688Connector } from "../src/connectors/alibaba1688/mock-connector.js";

describe("ImportOfferService", () => {
  it("stores snapshots inside the requesting tenant", async () => {
    const repository = new InMemoryOfferSnapshotRepository();
    const service = new ImportOfferService(new MockAlibaba1688Connector(), repository);
    const result = await service.execute({ tenantId: "tenant-a", offerUrlOrId: "789870588118" });

    expect(result.offerId).toBe("789870588118");
    expect(await repository.findByOfferId("tenant-a", result.offerId)).toEqual(result);
    expect(await repository.findByOfferId("tenant-b", result.offerId)).toBeUndefined();
  });
});
