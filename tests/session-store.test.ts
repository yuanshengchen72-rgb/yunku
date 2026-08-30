import { describe, expect, it } from "vitest";
import { TokenCipher } from "../src/connectors/alibaba1688/auth-store.js";
import { SessionStore } from "../src/server/session-store.js";

describe("SessionStore", () => {
  it("restores an encrypted session after the process-local store is recreated", () => {
    const cipher = new TokenCipher(Buffer.alloc(32, 9));
    const firstStore = new SessionStore(cipher);
    const token = firstStore.create({ tenantId: "tenant:buyer-1", alibabaUserId: "buyer-1" });

    const restartedStore = new SessionStore(cipher);
    expect(restartedStore.get(token)).toMatchObject({
      tenantId: "tenant:buyer-1",
      alibabaUserId: "buyer-1"
    });
  });

  it("rejects expired or unauthentic session tokens", () => {
    const cipher = new TokenCipher(Buffer.alloc(32, 4));
    const store = new SessionStore(cipher);
    const expired = store.create({ tenantId: "tenant:expired", alibabaUserId: "expired" }, -1);

    expect(store.get(expired)).toBeUndefined();
    expect(store.get("not-a-valid-session-token")).toBeUndefined();
    expect(new SessionStore(new TokenCipher(Buffer.alloc(32, 5))).get(
      store.create({ tenantId: "tenant:buyer-2", alibabaUserId: "buyer-2" })
    )).toBeUndefined();
  });
});
