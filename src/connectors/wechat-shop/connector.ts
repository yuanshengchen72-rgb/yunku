import type { WechatStore } from "../../shared/contracts.js";

interface WechatShopConnectorOptions {
  apiBaseUrl?: string;
  fetchImplementation?: typeof fetch;
}

export interface WechatCredentialValidation {
  status: WechatStore["status"];
  statusMessage?: string;
}

export class WechatShopConnector {
  private readonly apiBaseUrl: string;
  private readonly fetchImplementation: typeof fetch;

  constructor(options: WechatShopConnectorOptions = {}) {
    this.apiBaseUrl = (options.apiBaseUrl ?? "https://api.weixin.qq.com").replace(/\/$/, "");
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async validateCredentials(appId: string, appSecret: string): Promise<WechatCredentialValidation> {
    let response: Response;
    try {
      response = await this.fetchImplementation(`${this.apiBaseUrl}/cgi-bin/stable_token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grant_type: "client_credential",
          appid: appId,
          secret: appSecret,
          force_refresh: false
        })
      });
    } catch {
      throw new Error("无法连接微信接口，请检查聚石塔公网出站配置");
    }

    if (response.status === 403) {
      return {
        status: "WHITELIST_ABNORMAL",
        statusMessage: "微信接口拒绝当前出口 IP，请将固定出口 IP 加入白名单"
      };
    }

    const payload = await response.json().catch(() => undefined) as {
      access_token?: string;
      errcode?: number;
      errmsg?: string;
    } | undefined;
    if (response.ok && payload?.access_token) return { status: "NORMAL" };

    if (payload?.errcode === 40164) {
      return {
        status: "WHITELIST_ABNORMAL",
        statusMessage: "当前固定出口 IP 不在微信小店白名单中"
      };
    }
    if ([40013, 40001, 40125].includes(payload?.errcode ?? -1)) {
      return {
        status: "CREDENTIAL_INVALID",
        statusMessage: "AppID 或 AppSecret 无效，请核对微信小店自研配置"
      };
    }
    throw new Error(payload?.errmsg
      ? `微信凭证验证失败：${payload.errmsg}`
      : `微信凭证验证失败（HTTP ${response.status}）`);
  }
}
