import { describe, expect, it, vi } from "vitest";
import { Alibaba1688ApiClient } from "../src/connectors/alibaba1688/api-client.js";
import {
  EncryptedInMemoryAlibabaAuthorizationRepository,
  TokenCipher
} from "../src/connectors/alibaba1688/auth-store.js";
import { AlibabaOAuthClient } from "../src/connectors/alibaba1688/oauth.js";
import { RealAlibaba1688Connector } from "../src/connectors/alibaba1688/real-connector.js";

function createConnector(fetchImplementation: typeof fetch) {
  const authorizations = new EncryptedInMemoryAlibabaAuthorizationRepository(
    new TokenCipher(Buffer.alloc(32, 7))
  );
  const apiClient = new Alibaba1688ApiClient({
    appKey: "3255489",
    appSecret: "test-secret",
    gatewayUrl: "https://gw.open.1688.com",
    fetchImplementation
  });
  const oauthClient = new AlibabaOAuthClient({
    appKey: "3255489",
    appSecret: "test-secret",
    callbackUrl: "https://example.com/callback",
    authorizeUrl: "https://auth.1688.com/oauth/authorize",
    gatewayUrl: "https://gw.open.1688.com",
    fetchImplementation
  });
  return { connector: new RealAlibaba1688Connector(apiClient, oauthClient, authorizations), authorizations };
}

describe("real 1688 search connector", () => {
  it("calls the documented domestic distribution keyword endpoint", async () => {
    const requestedUrls: string[] = [];
    let requestedBody = "";
    const { connector, authorizations } = createConnector((async (url, init) => {
      const requestedUrl = String(url);
      requestedUrls.push(requestedUrl);
      if (requestedUrl.includes("alibaba.fenxiao.productInfo.get")) {
        return new Response(JSON.stringify({
          success: true,
          productInfo: {
            productID: 832103057225,
            subject: "休闲裤详情",
            categoryID: 1031910,
            productImage: { images: ["//cbu01.alicdn.com/trousers.jpg"] },
            productSkuInfos: [{ skuId: "sku-1", consignPrice: 45, amountOnSale: 120 }],
            supplierInfo: { companyName: "广州裤装工厂", provinceName: "广东", cityName: "广州" },
            serviceList: [{ serviceName: "7天无理由退货" }]
          }
        }), { status: 200 });
      }
      requestedBody = String(init?.body);
      return new Response(JSON.stringify({
        success: true,
        result: [{ offerId: "832103057225", subject: "休闲裤", offerPrice: "49" }],
        pageInfo: { currentPage: 1, pageSize: 20, totalRecords: 1 }
      }), { status: 200 });
    }) as typeof fetch);
    await authorizations.upsert({
      tenantId: "tenant:search",
      alibabaUserId: "search",
      accessToken: "access-token",
      accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000)
    });

    const result = await connector.searchOffers({
      tenantId: "tenant:search",
      mode: "keyword",
      query: "休闲裤",
      page: 1,
      pageSize: 20,
      priceMinCents: 3000,
      tags: ["YX_SCORE_LEVEL_2"],
      sortBy: "price",
      sortOrder: "asc"
    });

    expect(requestedUrls[0]).toContain("/com.alibaba.fenxiao/product.keywords.search/3255489");
    expect(requestedUrls[1]).toContain("/com.alibaba.fenxiao/alibaba.fenxiao.productInfo.get/3255489");
    const form = new URLSearchParams(requestedBody);
    expect(JSON.parse(form.get("param") ?? "{}")).toMatchObject({
      keywords: "休闲裤",
      pageNum: 1,
      pageSize: 20,
      priceStart: "30.00",
      filter: ["YX_SCORE_LEVEL_2"]
    });
    expect(requestedBody).not.toContain("test-secret");
    expect(result.items[0]).toMatchObject({
      title: "休闲裤详情",
      priceCents: 4900,
      supplierName: "广州裤装工厂",
      supplierLocation: "广东 广州",
      skuCount: 1,
      availableStock: 120,
      serviceLabels: ["7天无理由退货"]
    });
  });

  it("calls the official image endpoint with a URL source", async () => {
    let requestedBody = "";
    const { connector, authorizations } = createConnector((async (url, init) => {
      if (String(url).includes("alibaba.fenxiao.productInfo.get")) {
        return new Response(JSON.stringify({
          success: true,
          productInfo: { productID: 1062554122477, subject: "短袖详情", categoryID: 1 }
        }), { status: 200 });
      }
      requestedBody = String(init?.body);
      return new Response(JSON.stringify({
        success: true,
        imageSearchResult: [{ offerId: "1062554122477", subject: "短袖", price: "38" }]
      }), { status: 200 });
    }) as typeof fetch);
    await authorizations.upsert({
      tenantId: "tenant:image",
      alibabaUserId: "image",
      accessToken: "access-token"
    });

    const result = await connector.searchOffers({
      tenantId: "tenant:image",
      mode: "imageUrl",
      imageUrl: "https://example.com/product.jpg",
      sortBy: "comprehensive",
      sortOrder: "asc"
    });

    const form = new URLSearchParams(requestedBody);
    expect(form.get("imgUrl")).toBe("https://example.com/product.jpg");
    expect(form.get("imgBase64")).toBeNull();
    expect(result.items[0]?.source).toBe("imageUrl");
  });

  it("sends an uploaded image as raw base64 without leaking the data URL prefix", async () => {
    let requestedBody = "";
    const { connector, authorizations } = createConnector((async (url, init) => {
      if (String(url).includes("alibaba.fenxiao.productInfo.get")) {
        return new Response(JSON.stringify({
          success: true,
          productInfo: { productID: 1062554122477, subject: "短袖详情", categoryID: 1 }
        }), { status: 200 });
      }
      requestedBody = String(init?.body);
      return new Response(JSON.stringify({
        success: true,
        imageSearchResult: [{ offerId: "1062554122477", subject: "短袖", price: "38" }]
      }), { status: 200 });
    }) as typeof fetch);
    await authorizations.upsert({
      tenantId: "tenant:image-upload",
      alibabaUserId: "image-upload",
      accessToken: "access-token"
    });

    await connector.searchOffers({
      tenantId: "tenant:image-upload",
      mode: "image",
      imageBase64: "data:image/png;base64,aGVsbG8=",
      sortBy: "comprehensive",
      sortOrder: "asc"
    });

    const form = new URLSearchParams(requestedBody);
    expect(form.get("imgBase64")).toBe("aGVsbG8=");
    expect(form.get("imgUrl")).toBeNull();
    expect(requestedBody).not.toContain("data%3Aimage");
  });

  it("keeps sparse search results when detail enrichment fails", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { connector, authorizations } = createConnector((async (url) => {
      if (String(url).includes("alibaba.fenxiao.productInfo.get")) {
        return new Response(JSON.stringify({ success: false, errorCode: "FORBIDDEN", errorMsg: "无权限" }), {
          status: 403
        });
      }
      return new Response(JSON.stringify({
        success: true,
        result: [{ offerId: "832103057225", subject: "仍然可展示的商品", offerPrice: "49" }],
        pageInfo: { currentPage: 1, pageSize: 20, totalRecords: 1 }
      }), { status: 200 });
    }) as typeof fetch);
    await authorizations.upsert({
      tenantId: "tenant:degraded",
      alibabaUserId: "degraded",
      accessToken: "access-token"
    });

    const result = await connector.searchOffers({
      tenantId: "tenant:degraded",
      mode: "keyword",
      query: "休闲裤",
      page: 1,
      pageSize: 20,
      sortBy: "comprehensive",
      sortOrder: "asc"
    });

    expect(result.items[0]).toMatchObject({
      offerId: "832103057225",
      title: "仍然可展示的商品",
      priceCents: 4900
    });
    expect(warning).toHaveBeenCalledWith(expect.stringContaining("1/1 个搜索结果未能补充商品详情"));
    warning.mockRestore();
  });
});
