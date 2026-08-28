import { z } from "zod";
import {
  createAlibabaParameterSignature,
  toFormData,
  type AlibabaParameters
} from "./signature.js";
import type { AlibabaAuthorization } from "./auth-store.js";

export interface AlibabaOAuthClientOptions {
  appKey: string;
  appSecret: string;
  callbackUrl: string;
  authorizeUrl: string;
  gatewayUrl: string;
  fetchImplementation?: typeof fetch;
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().optional(),
  expires_in: z.coerce.number().positive().optional(),
  refresh_token_timeout: z.string().optional(),
  resource_owner: z.union([z.string(), z.number()]).optional(),
  aliId: z.union([z.string(), z.number()]).optional(),
  memberId: z.union([z.string(), z.number()]).optional()
}).passthrough();

function parseRefreshTokenTimeout(value?: string): Date | undefined {
  if (!value) return undefined;
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})([+-]\d{4})?$/.exec(value);
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second, offset = "+0800"] = match;
  const isoOffset = `${offset.slice(0, 3)}:${offset.slice(3)}`;
  const parsed = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}${isoOffset}`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function normalizeTokenResponse(
  payload: unknown,
  current?: Pick<AlibabaAuthorization, "tenantId" | "alibabaUserId" | "memberId">
): AlibabaAuthorization {
  const result = tokenResponseSchema.parse(payload);
  const alibabaUserId = String(
    result.memberId ?? result.resource_owner ?? result.aliId ?? current?.alibabaUserId ?? ""
  );
  if (!alibabaUserId) {
    throw new Error("1688 令牌响应未包含可识别的授权账号ID");
  }
  return {
    tenantId: current?.tenantId ?? `tenant:${alibabaUserId}`,
    alibabaUserId,
    memberId: result.memberId === undefined ? current?.memberId : String(result.memberId),
    accessToken: result.access_token,
    refreshToken: result.refresh_token,
    accessTokenExpiresAt: result.expires_in
      ? new Date(Date.now() + result.expires_in * 1000)
      : undefined,
    refreshTokenExpiresAt: parseRefreshTokenTimeout(result.refresh_token_timeout)
  };
}

export class AlibabaOAuthClient {
  private readonly fetchImplementation: typeof fetch;

  constructor(private readonly options: AlibabaOAuthClientOptions) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  buildAuthorizeUrl(state: string): string {
    const parameters: AlibabaParameters = {
      client_id: this.options.appKey,
      response_type: "code",
      redirect_uri: this.options.callbackUrl,
      site: "1688",
      state
    };
    const url = new URL(this.options.authorizeUrl);
    const query = toFormData(parameters);
    query.set(
      "_aop_signature",
      createAlibabaParameterSignature(parameters, this.options.appSecret)
    );
    url.search = query.toString();
    return url.toString();
  }

  async exchangeAuthorizationCode(code: string): Promise<AlibabaAuthorization> {
    const payload = await this.requestToken({
      grant_type: "authorization_code",
      need_refresh_token: "true",
      client_id: this.options.appKey,
      client_secret: this.options.appSecret,
      redirect_uri: this.options.callbackUrl,
      code
    });
    return normalizeTokenResponse(payload);
  }

  async refreshAuthorization(current: AlibabaAuthorization): Promise<AlibabaAuthorization> {
    if (!current.refreshToken) throw new Error("当前1688授权没有 refresh_token，需要重新授权");
    const payload = await this.requestToken({
      grant_type: "refresh_token",
      client_id: this.options.appKey,
      client_secret: this.options.appSecret,
      refresh_token: current.refreshToken
    });
    const refreshed = normalizeTokenResponse(payload, current);
    return {
      ...refreshed,
      alibabaUserId: refreshed.alibabaUserId || current.alibabaUserId,
      memberId: refreshed.memberId ?? current.memberId,
      refreshToken: refreshed.refreshToken ?? current.refreshToken,
      refreshTokenExpiresAt: refreshed.refreshTokenExpiresAt ?? current.refreshTokenExpiresAt
    };
  }

  private async requestToken(parameters: AlibabaParameters): Promise<unknown> {
    const tokenUrl = new URL(
      `/openapi/http/1/system.oauth2/getToken/${this.options.appKey}`,
      this.options.gatewayUrl
    );
    const response = await this.fetchImplementation(tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: toFormData(parameters)
    });
    const text = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`1688 令牌接口返回了非 JSON 内容（HTTP ${response.status}）`);
    }
    if (!response.ok) {
      throw new Error(`1688 令牌交换失败（HTTP ${response.status}）`);
    }
    return payload;
  }
}
