import { createAlibabaApiSignature, toFormData, type AlibabaParameters } from "./signature.js";

export interface AlibabaApiClientOptions {
  appKey: string;
  appSecret: string;
  gatewayUrl: string;
  fetchImplementation?: typeof fetch;
}

export class AlibabaApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly payload?: unknown
  ) {
    super(message);
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export class Alibaba1688ApiClient {
  private readonly fetchImplementation: typeof fetch;

  constructor(private readonly options: AlibabaApiClientOptions) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async call(
    namespace: string,
    apiName: string,
    version: string,
    accessToken: string,
    businessParameters: AlibabaParameters
  ): Promise<unknown> {
    const urlPath = `param2/${version}/${namespace}/${apiName}/${this.options.appKey}`;
    const parameters: AlibabaParameters = {
      ...businessParameters,
      access_token: accessToken
    };
    const signature = createAlibabaApiSignature(urlPath, parameters, this.options.appSecret);
    const url = new URL(`/openapi/${urlPath}`, this.options.gatewayUrl);
    const body = toFormData({ ...parameters, _aop_signature: signature });
    body.set("_aop_signature", signature);

    const response = await this.fetchImplementation(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body
    });
    const text = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new AlibabaApiError(`1688 API 返回了非 JSON 内容（HTTP ${response.status}）`);
    }

    const record = asRecord(payload);
    const errorCode = record?.error_code ?? record?.errorCode;
    const errorMessage = record?.error_message ?? record?.errorMessage ?? record?.message;
    if (!response.ok || record?.success === false || record?.error !== undefined || errorCode) {
      throw new AlibabaApiError(
        typeof errorMessage === "string" ? errorMessage : `1688 API 调用失败（HTTP ${response.status}）`,
        errorCode === undefined ? undefined : String(errorCode),
        payload
      );
    }
    return payload;
  }
}
