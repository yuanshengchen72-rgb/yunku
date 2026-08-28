import type { Alibaba1688Connector, GetProductInfoInput } from "./connector.js";
import type { OfferSnapshot } from "../../shared/contracts.js";

export class MockAlibaba1688Connector implements Alibaba1688Connector {
  async getProductInfo(input: GetProductInfoInput): Promise<OfferSnapshot> {
    return {
      offerId: input.offerId,
      title: `1688 模拟一件代发商品 ${input.offerId}`,
      categoryId: "mock-category-1001",
      imageUrls: [
        "https://images.unsplash.com/photo-1523275335684-37898b6baf30",
        "https://images.unsplash.com/photo-1505740420928-5e560c06d30e",
        "https://images.unsplash.com/photo-1542291026-7eec264c27ff"
      ],
      detailHtml: "<p>这是本地开发使用的模拟商品详情，不包含任何真实 1688 数据。</p>",
      skus: [
        {
          sourceSkuId: `${input.offerId}-black`,
          attributes: { 颜色: "黑色", 规格: "标准款" },
          priceCents: 2990,
          availableStock: 100
        },
        {
          sourceSkuId: `${input.offerId}-white`,
          attributes: { 颜色: "白色", 规格: "标准款" },
          priceCents: 3190,
          availableStock: 80
        }
      ],
      importedAt: new Date().toISOString()
    };
  }
}
