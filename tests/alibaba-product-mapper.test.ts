import { describe, expect, it } from "vitest";
import { mapAlibabaProductInfo } from "../src/connectors/alibaba1688/product-mapper.js";

describe("1688 product mapper", () => {
  it("maps a fenxiao product response to the internal snapshot", () => {
    const result = mapAlibabaProductInfo({
      success: true,
      productInfo: {
        productID: 789870588118,
        subject: "测试分销商品",
        categoryID: 1042954,
        image: { images: ["img/ibank/2026/test.jpg"] },
        description: "<p>详情</p>",
        skuInfos: [{
          specId: "sku-1",
          price: "12.34",
          consignPrice: "11.20",
          amountOnSale: 88,
          attributes: [{ attributeDisplayName: "颜色", attributeValue: "蓝色" }]
        }]
      }
    }, "789870588118");

    expect(result.title).toBe("测试分销商品");
    expect(result.categoryId).toBe("1042954");
    expect(result.imageUrls).toEqual(["https://cbu01.alicdn.com/img/ibank/2026/test.jpg"]);
    expect(result.skus[0]).toMatchObject({
      sourceSkuId: "sku-1",
      priceCents: 1120,
      availableStock: 88,
      attributes: { 颜色: "蓝色" }
    });
  });

  it("supports the product-prefixed aliases in the documented response model", () => {
    const result = mapAlibabaProductInfo({
      productInfo: {
        productID: 789870588119,
        subject: "兼容字段商品",
        categoryID: 1042954,
        productImage: { images: ["//cbu01.alicdn.com/alias.jpg"] },
        productSkuInfos: [{
          skuId: 3935963888523,
          jxhyPrice: 8.5,
          amountOnSale: 6,
          attributes: [{ attributeName: "红", attributeDisplayName: "颜色" }]
        }]
      }
    }, "789870588119");

    expect(result.imageUrls).toEqual(["https://cbu01.alicdn.com/alias.jpg"]);
    expect(result.skus[0]).toMatchObject({
      sourceSkuId: "3935963888523",
      priceCents: 850,
      availableStock: 6,
      attributes: { 颜色: "红" }
    });
  });

  it("upgrades legacy HTTP image URLs for HTTPS storefronts", () => {
    const result = mapAlibabaProductInfo({
      productInfo: {
        productID: 789870588120,
        subject: "HTTPS 图片商品",
        categoryID: 1042954,
        image: { images: ["http://cbu01.alicdn.com/legacy.jpg"] }
      }
    }, "789870588120");

    expect(result.imageUrls).toEqual(["https://cbu01.alicdn.com/legacy.jpg"]);
  });
});
