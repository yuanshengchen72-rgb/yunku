import { describe, expect, it } from "vitest";
import {
  mapAlibabaProductInfo,
  mapAlibabaProductInfoSearchEnrichment
} from "../src/connectors/alibaba1688/product-mapper.js";

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

  it("extracts visible search-card fields from product details", () => {
    const result = mapAlibabaProductInfoSearchEnrichment({
      productInfo: {
        productID: 789870588121,
        subject: "详情补全商品",
        categoryID: 1042954,
        productImage: { images: ["//cbu01.alicdn.com/detail.jpg"] },
        productSkuInfos: [
          { skuId: "sku-1", consignPrice: 18.8, amountOnSale: 35 },
          { skuId: "sku-2", consignPrice: 20, amountOnSale: 15 }
        ],
        supplierInfo: {
          companyName: "广州测试服饰有限公司",
          provinceName: "广东",
          cityName: "广州"
        },
        productShippingInfo: { deliveryTime: "48小时内发货" },
        serviceList: [{ serviceName: "7天无理由退货" }, { name: "晚揽必赔" }]
      }
    }, "789870588121");

    expect(result).toMatchObject({
      title: "详情补全商品",
      imageUrl: "https://cbu01.alicdn.com/detail.jpg",
      priceCents: 1880,
      supplierName: "广州测试服饰有限公司",
      supplierLocation: "广东 广州",
      skuCount: 2,
      availableStock: 50,
      shipWithinHours: 48,
      serviceLabels: ["7天无理由退货", "晚揽必赔"]
    });
  });
});
