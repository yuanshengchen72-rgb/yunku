import { describe, expect, it, vi } from "vitest";
import { WechatShopConnector } from "../src/connectors/wechat-shop/connector.js";
import type { OfferSnapshot } from "../src/shared/contracts.js";

const offer: OfferSnapshot = {
  offerId: "789870588118",
  title: "测试男装短袖",
  categoryId: "201000000",
  imageUrls: ["https://img.example.com/main.jpg"],
  detailHtml: "<p>柔软透气</p>",
  skus: [{
    sourceSkuId: "sku-black-xl",
    attributes: { 颜色: "黑色", 尺码: "XL" },
    priceCents: 4200,
    availableStock: 99
  }],
  importedAt: "2026-08-30T00:00:00.000Z"
};

describe("WechatShopConnector product publishing", () => {
  it("uploads source images, classifies the category, selects freight and submits a product", async () => {
    const calls: Array<{ url: string; body?: unknown }> = [];
    const fetchImplementation = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({ url, body });

      if (url.endsWith("/cgi-bin/stable_token")) {
        return new Response(JSON.stringify({ access_token: "wx-access-token", expires_in: 7200 }), { status: 200 });
      }
      if (url.includes("/shop/ec/basics/img/upload")) {
        return new Response(JSON.stringify({ errcode: 0, errmsg: "ok", pic_file: { img_url: "https://mmecimage.cn/main.jpg" } }), { status: 200 });
      }
      if (url.includes("/channels/ec/product/category/classify")) {
        return new Response(JSON.stringify({
          errcode: 0,
          errmsg: "ok",
          categories: [{
            cats: [
              { cat_info: { cat_id: "100", cat_name: "服饰" }, has_permission: true },
              { cat_info: { cat_id: "101", cat_name: "男装" }, has_permission: true },
              { cat_info: { cat_id: "102", cat_name: "T恤" }, has_permission: true }
            ]
          }]
        }), { status: 200 });
      }
      if (url.includes("/channels/ec/merchant/getfreighttemplatelist")) {
        return new Response(JSON.stringify({ errcode: 0, errmsg: "ok", template_id_list: ["freight-1"] }), { status: 200 });
      }
      if (url.includes("/channels/ec/product/add")) {
        return new Response(JSON.stringify({
          errcode: 0,
          errmsg: "ok",
          data: { product_id: "wx-product-1", edit_status: 2, status: 0 }
        }), { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const connector = new WechatShopConnector({ fetchImplementation: fetchImplementation as typeof fetch });

    const result = await connector.publishProduct("wx-app-id", "wx-app-secret", offer);

    expect(result).toEqual({
      productId: "wx-product-1",
      status: "REVIEWING",
      statusMessage: "商品已提交微信小店审核（商品ID：wx-product-1）"
    });
    const addCall = calls.find((call) => call.url.includes("/channels/ec/product/add"));
    expect(addCall?.body).toMatchObject({
      out_product_id: offer.offerId,
      title: offer.title,
      head_imgs: ["https://mmecimage.cn/main.jpg"],
      cats_v2: [{ cat_id: "100" }, { cat_id: "101" }, { cat_id: "102" }],
      express_info: { template_id: "freight-1" },
      skus: [{
        out_product_id: offer.offerId,
        out_sku_id: "sku-black-xl",
        thumb_img: "https://mmecimage.cn/main.jpg",
        sale_price: 4200,
        stock_num: 99,
        sku_attrs: [{ attr_key: "颜色", attr_value: "黑色" }, { attr_key: "尺码", attr_value: "XL" }]
      }]
    });
  });
});
