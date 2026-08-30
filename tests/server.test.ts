import { describe, expect, it } from "vitest";
import { buildApp } from "../src/server/app.js";
import type { ServerConfig } from "../src/server/config.js";
import { AlibabaOAuthClient } from "../src/connectors/alibaba1688/oauth.js";
import {
  EncryptedInMemoryAlibabaAuthorizationRepository,
  TokenCipher
} from "../src/connectors/alibaba1688/auth-store.js";

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

describe("server API", () => {
  it("returns a minimal health response without configuration details", async () => {
    const app = await buildApp({ config: testConfig });
    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    expect(response.headers["cache-control"]).toBe("no-store");
    await app.close();
  });

  it("exposes only the public connector mode through the runtime endpoint", async () => {
    const app = await buildApp({ config: testConfig });
    const response = await app.inject({ method: "GET", url: "/api/runtime" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ connectorMode: "mock" });
    expect(response.body).not.toContain(testConfig.alibabaAppKey);
    await app.close();
  });

  it("creates a development session and imports an offer", async () => {
    const app = await buildApp({ config: testConfig });
    const sessionResponse = await app.inject({
      method: "POST",
      url: "/api/dev/session",
      payload: { alibabaUserId: "buyer-1" }
    });
    const session = sessionResponse.json<{ token: string }>();

    const importResponse = await app.inject({
      method: "POST",
      url: "/api/1688/offers/import",
      headers: { authorization: `Bearer ${session.token}` },
      payload: { offerUrlOrId: "https://detail.1688.com/offer/789870588118.html" }
    });

    expect(importResponse.statusCode).toBe(200);
    expect(importResponse.json().data.offerId).toBe("789870588118");
    await app.close();
  });

  it("rejects an import without a session", async () => {
    const app = await buildApp({ config: testConfig });
    const response = await app.inject({
      method: "POST",
      url: "/api/1688/offers/import",
      payload: { offerUrlOrId: "789870588118" }
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("imports multiple offers in one request", async () => {
    const app = await buildApp({ config: testConfig });
    const sessionResponse = await app.inject({
      method: "POST",
      url: "/api/dev/session",
      payload: { alibabaUserId: "buyer-batch" }
    });
    const session = sessionResponse.json<{ token: string }>();
    const response = await app.inject({
      method: "POST",
      url: "/api/1688/offers/import-batch",
      headers: { authorization: `Bearer ${session.token}` },
      payload: { offerUrlOrIds: ["789870588118", "789870588119"] }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(2);
    await app.close();
  });

  it("binds a WeChat store without returning its secret", async () => {
    const app = await buildApp({ config: testConfig });
    const sessionResponse = await app.inject({
      method: "POST",
      url: "/api/dev/session",
      payload: { alibabaUserId: "buyer-store" }
    });
    const session = sessionResponse.json<{ token: string }>();
    const response = await app.inject({
      method: "POST",
      url: "/api/stores/wechat",
      headers: { authorization: `Bearer ${session.token}` },
      payload: {
        name: "微信测试店",
        appId: "wx1234567890",
        appSecret: "super-secret-value"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().data).toMatchObject({
      name: "微信测试店",
      platform: "WECHAT_SHOP",
      status: "NORMAL"
    });
    expect(response.body).not.toContain("super-secret-value");
    expect(response.body).not.toContain("wx1234567890");
    const firstStoreId = response.json().data.id as string;
    const rebound = await app.inject({
      method: "POST",
      url: "/api/stores/wechat",
      headers: { authorization: `Bearer ${session.token}` },
      payload: {
        name: "微信测试店（已更新）",
        appId: "wx1234567890",
        appSecret: "rotated-secret-value"
      }
    });
    expect(rebound.statusCode).toBe(201);
    expect(rebound.json().data.id).toBe(firstStoreId);
    const stores = await app.inject({
      method: "GET",
      url: "/api/stores",
      headers: { authorization: `Bearer ${session.token}` }
    });
    expect(stores.json().data).toHaveLength(1);
    await app.close();
  });

  it("creates one distribution task per offer and store", async () => {
    const app = await buildApp({ config: testConfig });
    const sessionResponse = await app.inject({
      method: "POST",
      url: "/api/dev/session",
      payload: { alibabaUserId: "buyer-distribution" }
    });
    const { token } = sessionResponse.json<{ token: string }>();
    const headers = { authorization: `Bearer ${token}` };

    await app.inject({
      method: "POST",
      url: "/api/1688/offers/import-batch",
      headers,
      payload: { offerUrlOrIds: ["789870588118", "789870588119"] }
    });
    const storeResponses = await Promise.all(["一店", "二店"].map((name, index) => app.inject({
      method: "POST",
      url: "/api/stores/wechat",
      headers,
      payload: {
        name,
        appId: `wx12345678${index}`,
        appSecret: `secret-value-${index}`
      }
    })));
    const storeIds = storeResponses.map((response) => response.json().data.id as string);
    const response = await app.inject({
      method: "POST",
      url: "/api/distribution/batches",
      headers,
      payload: {
        offerIds: ["789870588118", "789870588119"],
        storeIds,
        strategy: "ORDERED_AVERAGED"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().data).toMatchObject({ targetStoreCount: 2, taskCount: 4 });
    expect(response.json().data.jobs).toHaveLength(4);
    const list = await app.inject({ method: "GET", url: "/api/distribution/batches", headers });
    expect(list.json().data).toHaveLength(1);
    await app.close();
  });

  it("executes a newly created distribution task", async () => {
    const app = await buildApp({ config: testConfig });
    const sessionResponse = await app.inject({
      method: "POST",
      url: "/api/dev/session",
      payload: { alibabaUserId: "buyer-execution" }
    });
    const { token } = sessionResponse.json<{ token: string }>();
    const headers = { authorization: `Bearer ${token}` };

    await app.inject({
      method: "POST",
      url: "/api/1688/offers/import",
      headers,
      payload: { offerUrlOrId: "789870588118" }
    });
    const storeResponse = await app.inject({
      method: "POST",
      url: "/api/stores/wechat",
      headers,
      payload: {
        name: "执行测试店",
        appId: "wx1234567890",
        appSecret: "secret-value"
      }
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/distribution/batches",
      headers,
      payload: {
        offerIds: ["789870588118"],
        storeIds: [storeResponse.json().data.id],
        strategy: "ORDERED_AVERAGED"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().data.jobs).toHaveLength(1);
    expect(response.json().data.jobs[0].status).toBe("SUBMITTED");
    await app.close();
  });

  it("completes the 1688 OAuth callback and creates a cookie session", async () => {
    const authorizations = new EncryptedInMemoryAlibabaAuthorizationRepository(
      new TokenCipher(Buffer.alloc(32, 3))
    );
    const oauthClient = new AlibabaOAuthClient({
      appKey: "3255489",
      appSecret: "test-secret",
      callbackUrl: testConfig.alibabaCallbackUrl,
      authorizeUrl: testConfig.alibabaAuthorizeUrl,
      gatewayUrl: testConfig.alibabaGatewayUrl,
      fetchImplementation: (async () => new Response(JSON.stringify({
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 36000,
        memberId: "b2b-oauth-user"
      }), { status: 200 })) as typeof fetch
    });
    const app = await buildApp({ config: testConfig, oauthClient, authorizations });

    const start = await app.inject({ method: "GET", url: "/api/auth/1688/start?returnTo=%2F" });
    expect(start.statusCode).toBe(302);
    const authorizeUrl = new URL(start.headers.location!);
    const state = authorizeUrl.searchParams.get("state");
    expect(authorizeUrl.searchParams.get("client_id")).toBe("3255489");
    expect(authorizeUrl.searchParams.get("site")).toBe("1688");
    expect(authorizeUrl.searchParams.get("redirect_uri")).toBe(testConfig.alibabaCallbackUrl);
    expect(authorizeUrl.searchParams.has("_aop_signature")).toBe(false);

    const callback = await app.inject({
      method: "GET",
      url: `/api/auth/1688/callback?code=one-time-code&state=${encodeURIComponent(state!)}`
    });
    expect(callback.statusCode).toBe(302);
    const redirect = new URL(callback.headers.location!, "http://localhost");
    const loginTicket = redirect.searchParams.get("login_ticket");
    expect(loginTicket).toMatch(/^[0-9a-f-]{36}$/);
    const exchange = await app.inject({
      method: "POST",
      url: "/api/session/exchange",
      payload: { ticket: loginTicket }
    });
    expect(exchange.statusCode).toBe(200);
    const replay = await app.inject({
      method: "POST",
      url: "/api/session/exchange",
      payload: { ticket: loginTicket }
    });
    expect(replay.statusCode).toBe(400);
    const cookie = String(callback.headers["set-cookie"]).split(";")[0];
    const session = await app.inject({ method: "GET", url: "/api/session", headers: { cookie } });
    expect(session.json()).toMatchObject({
      alibabaUserId: "b2b-oauth-user",
      alibabaAuthorized: true
    });
    await app.close();
  });

  it("refuses an incomplete production real-mode configuration", async () => {
    await expect(buildApp({
      config: {
        ...testConfig,
        nodeEnv: "production",
        connectorMode: "real",
        devAuthEnabled: false
      }
    })).rejects.toThrow("ALIBABA_APP_SECRET");
  });
});
