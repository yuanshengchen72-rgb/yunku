import { describe, expect, it } from "vitest";
import {
  mapAlibabaImageSearch,
  mapAlibabaKeywordSearch
} from "../src/connectors/alibaba1688/search-mapper.js";

describe("1688 search response mapper", () => {
  it("maps the documented domestic distribution keyword result and page info", () => {
    const result = mapAlibabaKeywordSearch({
      success: true,
      result: [{
        offerId: 832103057225,
        subject: "加肥加长版男生休闲裤",
        offerImage: "//cbu01.alicdn.com/img/ibank/keyword.jpg",
        offerPrice: "49.00",
        companyInfo: {
          companyName: "测试供应商",
          province: "广东省",
          city: "深圳市",
          businessYears: 8
        },
        offerHistoryTradeInfo: {
          tradeQuantity: 160,
          monthSoldCount: 100,
          repurchaseRate: "32.5%"
        },
        offerTradeServiceInfo: {
          serviceLabels: ["48H晚揽必赔", "7天无理由退货"],
          shipWithinHours: 48
        },
        qualityEvaluation: {
          qualityScore: 4.8,
          qualityRefundRate: "0.8%"
        },
        encryptLogisticsOrderSupportChannel: ["淘宝", "抖音"],
        hasAIMaterials: true,
        distributionCount: 325,
        tags: ["一件代发", "48小时发货"]
      }],
      pageInfo: {
        currentPage: 2,
        pageSize: 20,
        totalRecords: 41
      }
    });

    expect(result).toMatchObject({ page: 2, pageSize: 20, total: 41 });
    expect(result.items[0]).toMatchObject({
      offerId: "832103057225",
      title: "加肥加长版男生休闲裤",
      imageUrl: "https://cbu01.alicdn.com/img/ibank/keyword.jpg",
      detailUrl: "https://detail.1688.com/offer/832103057225.html",
      priceCents: 4900,
      soldCount: 160,
      supplierName: "测试供应商",
      supplierLocation: "广东省 深圳市",
      supplierYears: 8,
      monthlySoldCount: 100,
      repurchaseRatePercent: 32.5,
      qualityScore: 4.8,
      qualityRefundRatePercent: 0.8,
      shipWithinHours: 48,
      distributionCount: 325,
      encryptedWaybillChannels: ["淘宝", "抖音"],
      supportsMaterials: true,
      serviceLabels: ["48H晚揽必赔", "7天无理由退货"],
      tags: ["一件代发", "48小时发货"],
      source: "keyword"
    });
  });

  it("maps and locally sorts the official image search result", () => {
    const result = mapAlibabaImageSearch({
      success: true,
      imageSearchResult: [{
        offerId: "1062554122477",
        subject: "男士翻领短袖",
        image: "http://cbu01.alicdn.com/img/ibank/image-a.jpg",
        consignPrice: "38.00",
        isJxhy: true
      }, {
        offerId: "1052476610298",
        subject: "短袖衬衫",
        image: "//cbu01.alicdn.com/img/ibank/image-b.jpg",
        consignPrice: "34.60"
      }]
    }, { source: "imageUrl", sortBy: "price", sortOrder: "asc" });

    expect(result.items.map((item) => item.offerId)).toEqual([
      "1052476610298",
      "1062554122477"
    ]);
    expect(result.items[1]).toMatchObject({
      imageUrl: "https://cbu01.alicdn.com/img/ibank/image-a.jpg",
      tags: ["精选货源"],
      source: "imageUrl"
    });
  });
});
