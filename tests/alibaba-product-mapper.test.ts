import { describe, expect, it } from "vitest";
import { mapAlibabaProductInfo } from "../src/connectors/alibaba1688/product-mapper.js";

describe("1688 product mapper", () => {
  it("maps a fenxiao product response to the internal snapshot", () => {
    const result = mapAlibabaProductInfo({
      result: {
        productInfo: {
          offerId: 789870588118,
          subject: "测试分销商品",
          categoryId: 1042954,
          image: { images: ["https://cbu01.alicdn.com/test.jpg"] },
          description: "<p>详情</p>",
          skuInfos: [{
            specId: "sku-1",
            price: "12.34",
            amountOnSale: 88,
            attributes: [{ attributeDisplayName: "颜色", attributeValue: "蓝色" }]
          }]
        }
      }
    }, "789870588118");

    expect(result.title).toBe("测试分销商品");
    expect(result.skus[0]).toMatchObject({
      sourceSkuId: "sku-1",
      priceCents: 1234,
      availableStock: 88,
      attributes: { 颜色: "蓝色" }
    });
  });
});
