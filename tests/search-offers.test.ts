import { describe, expect, it } from "vitest";
import { buildApp } from "../src/server/app.js";
import type { ServerConfig } from "../src/server/config.js";

const testConfig: ServerConfig = {
  nodeEnv: "test",
  port: 3000,
  webOrigin: "http://localhost:5173",
  alibabaAppKey: "3255489",
  alibabaCallbackUrl: "http://localhost:3000/api/auth/1688/callback",
  alibabaAuthorizeUrl: "https://auth.1688.com/oauth/authorize",
  alibabaGatewayUrl: "https://gw.open.1688.com",
  connectorMode: "mock",
  devAuthEnabled: true
};

describe("1688 offer search API", () => {
  it("passes an authenticated keyword search to the 1688 connector", async () => {
    let received: unknown;
    const connector = {
      getProductInfo: async () => { throw new Error("not used"); },
      searchOffers: async (input: unknown) => {
        received = input;
        return {
          items: [{
            offerId: "832103057225",
            title: "加肥加长版男生休闲裤",
            imageUrl: "https://cbu01.alicdn.com/img/ibank/example.jpg",
            detailUrl: "https://detail.1688.com/offer/832103057225.html",
            priceCents: 4900,
            tags: ["一件代发"]
          }],
          page: 1,
          pageSize: 20,
          total: 1
        };
      }
    };
    const app = await buildApp({ config: testConfig, connector: connector as never });
    const sessionResponse = await app.inject({
      method: "POST",
      url: "/api/dev/session",
      payload: { alibabaUserId: "search-buyer" }
    });
    const { token, tenantId } = sessionResponse.json<{ token: string; tenantId: string }>();

    const response = await app.inject({
      method: "POST",
      url: "/api/1688/offers/search",
      headers: { authorization: `Bearer ${token}` },
      payload: { mode: "keyword", query: "休闲裤", page: 1, pageSize: 20 }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.items[0].offerId).toBe("832103057225");
    expect(received).toMatchObject({
      tenantId,
      mode: "keyword",
      query: "休闲裤",
      page: 1,
      pageSize: 20
    });
    await app.close();
  });
});
