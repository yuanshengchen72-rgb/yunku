import { z } from "zod";

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  ALIBABA_APP_KEY: z.string().default("3432336"),
  ALIBABA_APP_SECRET: z.string().optional(),
  ALIBABA_CALLBACK_URL: z.url().default("http://localhost:3000/api/auth/1688/callback"),
  ALIBABA_AUTHORIZE_URL: z.url().default("https://auth.1688.com/oauth/authorize"),
  ALIBABA_GATEWAY_URL: z.url().default("https://gw.open.1688.com"),
  ALIBABA_CONNECTOR_MODE: z.enum(["mock", "real"]).default("mock"),
  TOKEN_ENCRYPTION_KEY: z.string().optional(),
  MYSQL_URL: z.string().optional()
});

export interface ServerConfig {
  nodeEnv: "development" | "test" | "production";
  port: number;
  webOrigin: string;
  alibabaAppKey: string;
  alibabaAppSecret?: string | undefined;
  alibabaCallbackUrl: string;
  alibabaAuthorizeUrl: string;
  alibabaGatewayUrl: string;
  connectorMode: "mock" | "real";
  tokenEncryptionKey?: string | undefined;
  mysqlUrl?: string | undefined;
  devAuthEnabled: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const parsed = configSchema.parse(env);
  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    webOrigin: parsed.WEB_ORIGIN,
    alibabaAppKey: parsed.ALIBABA_APP_KEY,
    alibabaAppSecret: parsed.ALIBABA_APP_SECRET,
    alibabaCallbackUrl: parsed.ALIBABA_CALLBACK_URL,
    alibabaAuthorizeUrl: parsed.ALIBABA_AUTHORIZE_URL,
    alibabaGatewayUrl: parsed.ALIBABA_GATEWAY_URL,
    connectorMode: parsed.ALIBABA_CONNECTOR_MODE,
    tokenEncryptionKey: parsed.TOKEN_ENCRYPTION_KEY,
    mysqlUrl: parsed.MYSQL_URL,
    devAuthEnabled: parsed.NODE_ENV !== "production"
  };
}
