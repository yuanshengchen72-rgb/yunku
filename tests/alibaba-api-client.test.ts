import { describe, expect, it } from "vitest";
import {
  Alibaba1688ApiClient,
  AlibabaApiError
} from "../src/connectors/alibaba1688/api-client.js";
import { createAlibabaApiSignature } from "../src/connectors/alibaba1688/signature.js";

describe("1688 API client", () => {
  it("calls the distribution product detail endpoint with a signed offerId", async () => {
    let requestedUrl = "";
    let requestedBody = "";
    const client = new Alibaba1688ApiClient({
      appKey: "3432336",
      appSecret: "test-secret",
      gatewayUrl: "https://gw.open.1688.com",
      fetchImplementation: (async (url, init) => {
        requestedUrl = String(url);
        requestedBody = String(init?.body);
        return new Response(JSON.stringify({
          success: true,
          result: { productInfo: { offerId: 789870588118, subject: "测试商品" } }
        }), { status: 200 });
      }) as typeof fetch
    });

    await client.call(
      "com.alibaba.fenxiao",
      "alibaba.fenxiao.productInfo.get",
      "1",
      "access-token",
      { offerId: "789870588118" }
    );

    expect(requestedUrl).toBe(
      "https://gw.open.1688.com/openapi/param2/1/com.alibaba.fenxiao/alibaba.fenxiao.productInfo.get/3432336"
    );
    const form = new URLSearchParams(requestedBody);
    expect(form.get("offerId")).toBe("789870588118");
    expect(form.get("access_token")).toBe("access-token");
    expect(form.get("_aop_signature")).toBe(createAlibabaApiSignature(
      "param2/1/com.alibaba.fenxiao/alibaba.fenxiao.productInfo.get/3432336",
      { offerId: "789870588118", access_token: "access-token" },
      "test-secret"
    ));
    expect(requestedBody).not.toContain("test-secret");
  });

  it("normalizes gateway errors without exposing request credentials", async () => {
    const client = new Alibaba1688ApiClient({
      appKey: "3432336",
      appSecret: "test-secret",
      gatewayUrl: "https://gw.open.1688.com",
      fetchImplementation: (async () => new Response(JSON.stringify({
        error_code: "401",
        error_message: "access token expired"
      }), { status: 200 })) as typeof fetch
    });

    await expect(client.call(
      "com.alibaba.fenxiao",
      "alibaba.fenxiao.productInfo.get",
      "1",
      "expired-token",
      { offerId: "789870588118" }
    )).rejects.toMatchObject<Partial<AlibabaApiError>>({
      code: "401",
      message: "access token expired"
    });
  });
});
