import type { OfferSnapshot, WechatStore } from "../../shared/contracts.js";

interface WechatShopConnectorOptions {
  apiBaseUrl?: string;
  fetchImplementation?: typeof fetch;
}

export interface WechatCredentialValidation {
  status: WechatStore["status"];
  statusMessage?: string;
}

export interface WechatProductPublication {
  productId: string;
  status: "SUBMITTED" | "REVIEWING" | "LISTED";
  statusMessage: string;
}

export class WechatShopConnector {
  private readonly apiBaseUrl: string;
  private readonly fetchImplementation: typeof fetch;

  constructor(options: WechatShopConnectorOptions = {}) {
    this.apiBaseUrl = (options.apiBaseUrl ?? "https://api.weixin.qq.com").replace(/\/$/, "");
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async validateCredentials(appId: string, appSecret: string): Promise<WechatCredentialValidation> {
    try {
      await this.getAccessToken(appId, appSecret);
      return { status: "NORMAL" };
    } catch (error) {
      if (error instanceof WechatApiError && error.code === 40164) {
        return {
          status: "WHITELIST_ABNORMAL",
          statusMessage: "当前固定出口 IP 不在微信小店白名单中"
        };
      }
      if (error instanceof WechatApiError && [40013, 40001, 40125].includes(error.code)) {
        return {
          status: "CREDENTIAL_INVALID",
          statusMessage: "AppID 或 AppSecret 无效，请核对微信小店自研配置"
        };
      }
      throw error;
    }
  }

  async publishProduct(
    appId: string,
    appSecret: string,
    offer: OfferSnapshot
  ): Promise<WechatProductPublication> {
    const accessToken = await this.getAccessToken(appId, appSecret);
    const uploadedImages = new Map<string, string>();
    for (const imageUrl of offer.imageUrls.slice(0, 9)) {
      const payload = await this.postWechat<{
        pic_file?: { img_url?: string };
      }>("/shop/ec/basics/img/upload", accessToken, { img_url: imageUrl }, {
        upload_type: "1",
        resp_type: "1"
      });
      const uploadedUrl = payload.pic_file?.img_url;
      if (!uploadedUrl) throw new Error("微信小店图片转存失败：接口未返回图片地址");
      uploadedImages.set(imageUrl, uploadedUrl);
    }
    const headImages = offer.imageUrls.slice(0, 9).map((url) => uploadedImages.get(url)!).filter(Boolean);
    if (headImages.length === 0) throw new Error("商品没有可发布的主图");

    const classification = await this.postWechat<{
      categories?: Array<{
        cats?: Array<{
          cat_info?: { cat_id?: string };
          has_permission?: boolean;
        }>;
      }>;
    }>("/channels/ec/product/category/classify", accessToken, {
      req_type: 1,
      title: offer.title.slice(0, 60),
      head_imgs: headImages
    });
    const matchedCategory = classification.categories?.find((candidate) =>
      candidate.cats?.length
      && candidate.cats.every((level) => level.cat_info?.cat_id)
      && candidate.cats.at(-1)?.has_permission === true
    );
    if (!matchedCategory?.cats?.length) {
      throw new Error("微信小店没有匹配类目的经营权限，请先在店铺后台申请对应类目");
    }

    const freightTemplates = await this.postWechat<{ template_id_list?: string[] }>(
      "/channels/ec/merchant/getfreighttemplatelist",
      accessToken,
      { offset: 0, limit: 10 }
    );
    const freightTemplateId = freightTemplates.template_id_list?.[0];
    if (!freightTemplateId) throw new Error("微信小店尚未配置运费模板，请先在店铺后台创建一个运费模板");

    const response = await this.postWechat<{
      data?: { product_id?: string; edit_status?: number; status?: number };
    }>("/channels/ec/product/add", accessToken, {
      out_product_id: offer.offerId,
      title: offer.title.slice(0, 60),
      short_title: offer.title.slice(0, 18),
      head_imgs: headImages,
      desc_info: {
        imgs: headImages,
        desc: plainText(offer.detailHtml).slice(0, 3000)
      },
      cats_v2: matchedCategory.cats.map((level) => ({ cat_id: level.cat_info!.cat_id! })),
      brand_id: "2100000000",
      deliver_method: 0,
      express_info: { template_id: freightTemplateId },
      product_type: 1,
      release_mode: 1,
      listing: 0,
      skus: offer.skus.map((sku, index) => ({
        out_product_id: offer.offerId,
        out_sku_id: sku.sourceSkuId.slice(0, 64),
        thumb_img: headImages[index % headImages.length],
        sale_price: sku.priceCents,
        market_price: Math.max(sku.priceCents + 1, Math.ceil(sku.priceCents * 1.2)),
        stock_num: sku.availableStock,
        sku_code: sku.sourceSkuId.slice(0, 20),
        sku_attrs: Object.entries(sku.attributes).map(([key, value]) => ({
          attr_key: key.slice(0, 20),
          attr_value: value.slice(0, 50)
        }))
      }))
    });
    const productId = response.data?.product_id;
    if (!productId) throw new Error("微信小店发品成功但未返回商品ID");
    if (response.data?.status === 5) {
      return {
        productId,
        status: "LISTED",
        statusMessage: `商品已上架微信小店（商品ID：${productId}）`
      };
    }
    if (response.data?.edit_status === 2) {
      return {
        productId,
        status: "REVIEWING",
        statusMessage: `商品已提交微信小店审核（商品ID：${productId}）`
      };
    }
    return {
      productId,
      status: "SUBMITTED",
      statusMessage: `商品已提交微信小店（商品ID：${productId}）`
    };
  }

  private async getAccessToken(appId: string, appSecret: string): Promise<string> {
    let response: Response;
    try {
      response = await this.fetchImplementation(`${this.apiBaseUrl}/cgi-bin/stable_token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grant_type: "client_credential",
          appid: appId,
          secret: appSecret,
          force_refresh: false
        })
      });
    } catch {
      throw new Error("无法连接微信接口，请检查聚石塔公网出站配置");
    }

    if (response.status === 403) throw new WechatApiError(40164, "微信接口拒绝当前出口 IP，请将固定出口 IP 加入白名单");

    const payload = await response.json().catch(() => undefined) as {
      access_token?: string;
      errcode?: number;
      errmsg?: string;
    } | undefined;
    if (response.ok && payload?.access_token) return payload.access_token;
    throw new WechatApiError(
      payload?.errcode ?? response.status,
      payload?.errmsg ?? `微信凭证验证失败（HTTP ${response.status}）`
    );
  }

  private async postWechat<T extends object>(
    path: string,
    accessToken: string,
    body: object,
    query: Record<string, string> = {}
  ): Promise<T> {
    const url = new URL(`${this.apiBaseUrl}${path}`);
    url.searchParams.set("access_token", accessToken);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    let response: Response;
    try {
      response = await this.fetchImplementation(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
    } catch {
      throw new Error("无法连接微信接口，请检查聚石塔公网出站配置");
    }
    const payload = await response.json().catch(() => undefined) as (T & {
      errcode?: number;
      errmsg?: string;
    }) | undefined;
    if (!response.ok || !payload || (payload.errcode !== undefined && payload.errcode !== 0)) {
      throw new WechatApiError(
        payload?.errcode ?? response.status,
        payload?.errmsg ?? `微信接口请求失败（HTTP ${response.status}）`
      );
    }
    return payload;
  }
}

class WechatApiError extends Error {
  constructor(readonly code: number, message: string) {
    super(`微信接口错误 ${code}：${message}`);
  }
}

function plainText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}
