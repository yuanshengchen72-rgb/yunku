import { describe, expect, it } from "vitest";
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
    let requestedUrl = "";
    let requestedBody = "";
    const { connector, authorizations } = createConnector((async (url, init) => {
      requestedUrl = String(url);
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

    await connector.searchOffers({
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

    expect(requestedUrl).toContain("/com.alibaba.fenxiao/product.keywords.search/3255489");
    const form = new URLSearchParams(requestedBody);
    expect(JSON.parse(form.get("param") ?? "{}")).toMatchObject({
      keywords: "休闲裤",
      pageNum: 1,
      pageSize: 20,
      priceStart: "30.00",
      filter: ["YX_SCORE_LEVEL_2"]
    });
    expect(requestedBody).not.toContain("test-secret");
  });

  it("calls the official image endpoint with a URL source", async () => {
    let requestedBody = "";
    const { connector, authorizations } = createConnector((async (_url, init) => {
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
    const { connector, authorizations } = createConnector((async (_url, init) => {
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
});
