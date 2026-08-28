import { describe, expect, it } from "vitest";
import {
  createAlibabaApiSignature,
  createAlibabaParameterSignature
} from "../src/connectors/alibaba1688/signature.js";

describe("1688 signatures", () => {
  it("matches the documented API signature vector", () => {
    expect(createAlibabaApiSignature(
      "param2/1/system/currentTime/1000000",
      { b: 2, a: 1 },
      "test123"
    )).toBe("33E54F4F7B989E3E0E912D3FBD2F1A03CA7CCE88");
  });

  it("is stable regardless of parameter insertion order", () => {
    const first = createAlibabaParameterSignature({ state: "x", client_id: "3432336" }, "secret");
    const second = createAlibabaParameterSignature({ client_id: "3432336", state: "x" }, "secret");
    expect(first).toBe(second);
  });
});
