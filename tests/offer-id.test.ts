import { describe, expect, it } from "vitest";
import { InvalidOfferReferenceError, parseOfferId } from "../src/domain/offer-id.js";

describe("parseOfferId", () => {
  it("accepts a raw offer id", () => {
    expect(parseOfferId(" 789870588118 ")).toBe("789870588118");
  });

  it("extracts an id from a 1688 detail url", () => {
    expect(parseOfferId("https://detail.1688.com/offer/789870588118.html?spm=test")).toBe("789870588118");
  });

  it("rejects non-1688 urls", () => {
    expect(() => parseOfferId("https://example.com/offer/789870588118.html")).toThrow(InvalidOfferReferenceError);
  });
});
