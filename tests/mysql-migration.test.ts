import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("MySQL migration compatibility", () => {
  it("uses nullable datetime columns for optional OAuth expiry timestamps", () => {
    const migration = readFileSync(
      new URL("../drizzle/0000_massive_gambit.sql", import.meta.url),
      "utf8"
    );

    expect(migration).toContain("`expires_at` datetime");
    expect(migration).toContain("`refresh_token_expires_at` datetime");
    expect(migration).not.toContain("DEFAULT (now())");
    expect(migration).toContain("DEFAULT CURRENT_TIMESTAMP");
  });
});
