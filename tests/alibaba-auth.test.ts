import { describe, expect, it } from "vitest";
import {
  EncryptedInMemoryAlibabaAuthorizationRepository,
  TokenCipher
} from "../src/connectors/alibaba1688/auth-store.js";
import { AlibabaOAuthClient } from "../src/connectors/alibaba1688/oauth.js";

describe("1688 authorization", () => {
  it("encrypts tokens before storing and restores them", async () => {
    const repository = new EncryptedInMemoryAlibabaAuthorizationRepository(
      new TokenCipher(Buffer.alloc(32, 7))
    );
    await repository.upsert({
      tenantId: "tenant:b2b-1",
      alibabaUserId: "b2b-1",
      accessToken: "access-secret",
      refreshToken: "refresh-secret"
    });
    await expect(repository.findByTenantId("tenant:b2b-1")).resolves.toMatchObject({
      accessToken: "access-secret",
      refreshToken: "refresh-secret"
    });
  });

  it("exchanges a code and normalizes the 1688 account", async () => {
    let requestedBody = "";
    const oauth = new AlibabaOAuthClient({
      appKey: "3255489",
      appSecret: "test-secret",
      callbackUrl: "https://example.com/api/auth/1688/callback",
      authorizeUrl: "https://auth.1688.com/oauth/authorize",
      gatewayUrl: "https://gw.open.1688.com",
      fetchImplementation: (async (_url, init) => {
        requestedBody = String(init?.body);
        return new Response(JSON.stringify({
          access_token: "access-token",
          refresh_token: "refresh-token",
          expires_in: "36000",
          memberId: "b2b-123"
        }), { status: 200 });
      }) as typeof fetch
    });

    const authorization = await oauth.exchangeAuthorizationCode("one-time-code");
    expect(requestedBody).toContain("grant_type=authorization_code");
    expect(requestedBody).toContain("code=one-time-code");
    expect(authorization).toMatchObject({
      tenantId: "tenant:b2b-123",
      alibabaUserId: "b2b-123",
      accessToken: "access-token"
    });
  });
});
