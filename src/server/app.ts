import path from "node:path";
import { randomBytes } from "node:crypto";
import Fastify, { type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import staticPlugin from "@fastify/static";
import { z } from "zod";
import { importOfferRequestSchema, importOffersRequestSchema } from "../shared/contracts.js";
import { InvalidOfferReferenceError } from "../domain/offer-id.js";
import { ImportOfferService } from "../domain/import-offer.js";
import {
  InMemoryOfferSnapshotRepository,
  type OfferSnapshotRepository
} from "../domain/ports.js";
import { MockAlibaba1688Connector } from "../connectors/alibaba1688/mock-connector.js";
import {
  AlibabaAuthorizationRequiredError,
  RealAlibaba1688Connector
} from "../connectors/alibaba1688/real-connector.js";
import { Alibaba1688ApiClient } from "../connectors/alibaba1688/api-client.js";
import {
  EncryptedInMemoryAlibabaAuthorizationRepository,
  TokenCipher,
  type AlibabaAuthorizationRepository
} from "../connectors/alibaba1688/auth-store.js";
import { AlibabaOAuthClient } from "../connectors/alibaba1688/oauth.js";
import type { Alibaba1688Connector } from "../connectors/alibaba1688/connector.js";
import type { ServerConfig } from "./config.js";
import { SESSION_COOKIE_NAME, SessionStore, type Session } from "./session-store.js";
import { OAuthStateStore } from "./oauth-state-store.js";
import { createMySqlRuntimeRepositories } from "../db/repositories.js";
import { LoginTicketStore } from "./login-ticket-store.js";

interface BuildAppOptions {
  config: ServerConfig;
  connector?: Alibaba1688Connector;
  sessions?: SessionStore;
  authorizations?: AlibabaAuthorizationRepository;
  offers?: OfferSnapshotRepository;
  oauthClient?: AlibabaOAuthClient;
  oauthStates?: OAuthStateStore;
  loginTickets?: LoginTicketStore;
}

function bearerToken(request: FastifyRequest): string | undefined {
  const value = request.headers.authorization;
  if (!value?.startsWith("Bearer ")) return undefined;
  return value.slice("Bearer ".length).trim();
}

export async function buildApp(options: BuildAppOptions) {
  if (!options.connector && options.config.connectorMode === "real") {
    validateRealConnectorConfig(options.config);
  }
  const app = Fastify({ logger: options.config.nodeEnv !== "test" });
  const sessions = options.sessions ?? new SessionStore();
  const oauthStates = options.oauthStates ?? new OAuthStateStore();
  const loginTickets = options.loginTickets ?? new LoginTicketStore();
  const tokenCipher = options.config.tokenEncryptionKey
    ? TokenCipher.fromBase64(options.config.tokenEncryptionKey)
    : new TokenCipher(randomBytes(32));
  const mysqlRuntime = options.config.mysqlUrl
    ? await createMySqlRuntimeRepositories(options.config.mysqlUrl, tokenCipher)
    : undefined;
  const authorizations = options.authorizations
    ?? mysqlRuntime?.authorizations
    ?? new EncryptedInMemoryAlibabaAuthorizationRepository(tokenCipher);
  const repository = options.offers
    ?? mysqlRuntime?.offers
    ?? new InMemoryOfferSnapshotRepository();
  const oauthClient = options.oauthClient ?? createOAuthClient(options.config);
  const connector =
    options.connector ??
    (options.config.connectorMode === "mock"
      ? new MockAlibaba1688Connector()
      : createRealConnector(options.config, oauthClient, authorizations));
  const importOffer = new ImportOfferService(connector, repository);

  if (mysqlRuntime) {
    app.addHook("onClose", async () => mysqlRuntime.pool.end());
  }

  await app.register(cookie);

  await app.register(cors, {
    origin: options.config.webOrigin,
    credentials: false
  });

  function requireSession(request: FastifyRequest): Session | undefined {
    const token = bearerToken(request) ?? request.cookies[SESSION_COOKIE_NAME];
    return token ? sessions.get(token) : undefined;
  }

  app.get("/api/health", async (_request, reply) => {
    reply.header("cache-control", "no-store");
    return { status: "ok" };
  });

  app.get("/api/auth/1688/start", async (request, reply) => {
    if (!oauthClient) {
      return reply.code(503).send({ code: "ALIBABA_NOT_CONFIGURED", message: "1688密钥尚未配置" });
    }
    const query = z.object({ returnTo: z.string().optional() }).parse(request.query);
    const state = oauthStates.issue(query.returnTo);
    return reply.redirect(oauthClient.buildAuthorizeUrl(state));
  });

  app.get("/api/auth/1688/callback", async (request, reply) => {
    if (!oauthClient) {
      return reply.code(503).send({ code: "ALIBABA_NOT_CONFIGURED", message: "1688密钥尚未配置" });
    }
    const query = z.object({
      code: z.string().min(1).optional(),
      state: z.string().optional(),
      error: z.string().optional(),
      error_description: z.string().optional()
    }).parse(request.query);
    if (query.error || !query.code) {
      return reply.code(400).send({
        code: "ALIBABA_AUTH_DENIED",
        message: query.error_description ?? "1688授权未完成"
      });
    }

    let returnTo = "/";
    if (query.state && oauthStates.isDianchaoState(query.state)) {
      const state = oauthStates.consume(query.state);
      if (!state) {
        return reply.code(400).send({ code: "INVALID_OAUTH_STATE", message: "授权请求已过期，请重新连接" });
      }
      returnTo = state.returnTo;
    }

    try {
      const authorization = await oauthClient.exchangeAuthorizationCode(query.code);
      await authorizations.upsert(authorization);
      const token = sessions.create({
        tenantId: authorization.tenantId,
        alibabaUserId: authorization.alibabaUserId
      });
      reply.setCookie(SESSION_COOKIE_NAME, token, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: options.config.nodeEnv === "production",
        maxAge: 8 * 60 * 60
      });
      const loginTicket = loginTickets.issue(token);
      const redirectUrl = new URL(returnTo, "http://dianchao.local");
      redirectUrl.searchParams.set("login_ticket", loginTicket);
      return reply.redirect(`${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`);
    } catch (error) {
      request.log.error({ err: error }, "alibaba oauth callback failed");
      return reply.code(502).send({ code: "ALIBABA_TOKEN_EXCHANGE_FAILED", message: "1688授权码换取令牌失败" });
    }
  });

  app.post("/api/session/exchange", async (request, reply) => {
    const parsed = z.object({ ticket: z.string().uuid() }).safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: "INVALID_LOGIN_TICKET", message: "登录票据格式不正确" });
    }
    const token = loginTickets.consume(parsed.data.ticket);
    if (!token || !sessions.get(token)) {
      return reply.code(400).send({ code: "INVALID_LOGIN_TICKET", message: "登录票据已过期，请重新进入应用" });
    }
    return { token };
  });

  app.post("/api/dev/session", async (request, reply) => {
    if (!options.config.devAuthEnabled) {
      return reply.code(404).send({ code: "NOT_FOUND" });
    }
    const body = z.object({ alibabaUserId: z.string().min(1).default("dev-1688-user") }).parse(request.body ?? {});
    const tenantId = `tenant:${body.alibabaUserId}`;
    const token = sessions.create({ tenantId, alibabaUserId: body.alibabaUserId });
    return { token, tenantId, alibabaUserId: body.alibabaUserId };
  });

  app.get("/api/session", async (request, reply) => {
    const session = requireSession(request);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    const authorization = await authorizations.findByTenantId(session.tenantId);
    return {
      tenantId: session.tenantId,
      alibabaUserId: session.alibabaUserId,
      mode: options.config.connectorMode,
      alibabaAuthorized: Boolean(authorization)
    };
  });

  app.get("/api/auth/1688/status", async (request) => {
    const session = requireSession(request);
    if (!session) return { connected: false };
    const authorization = await authorizations.findByTenantId(session.tenantId);
    return {
      connected: Boolean(authorization),
      alibabaUserId: authorization?.alibabaUserId,
      accessTokenExpiresAt: authorization?.accessTokenExpiresAt?.toISOString()
    };
  });

  app.post("/api/1688/offers/import", async (request, reply) => {
    const session = requireSession(request);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });

    try {
      const body = importOfferRequestSchema.parse(request.body);
      const snapshot = await importOffer.execute({
        tenantId: session.tenantId,
        offerUrlOrId: body.offerUrlOrId
      });
      return { data: snapshot };
    } catch (error) {
      if (error instanceof InvalidOfferReferenceError) {
        return reply.code(400).send({ code: "INVALID_OFFER_REFERENCE", message: error.message });
      }
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ code: "INVALID_REQUEST", message: "请求参数不正确" });
      }
      if (error instanceof AlibabaAuthorizationRequiredError) {
        return reply.code(409).send({ code: "ALIBABA_AUTH_REQUIRED", message: error.message });
      }
      request.log.error({ err: error }, "offer import failed");
      return reply.code(502).send({ code: "UPSTREAM_ERROR", message: "获取 1688 商品失败" });
    }
  });

  app.post("/api/1688/offers/import-batch", async (request, reply) => {
    const session = requireSession(request);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    try {
      const body = importOffersRequestSchema.parse(request.body);
      const data = [];
      for (const offerUrlOrId of body.offerUrlOrIds) {
        data.push(await importOffer.execute({ tenantId: session.tenantId, offerUrlOrId }));
      }
      return { data };
    } catch (error) {
      if (error instanceof InvalidOfferReferenceError || error instanceof z.ZodError) {
        return reply.code(400).send({ code: "INVALID_REQUEST", message: "商品链接或ID格式不正确" });
      }
      if (error instanceof AlibabaAuthorizationRequiredError) {
        return reply.code(409).send({ code: "ALIBABA_AUTH_REQUIRED", message: error.message });
      }
      request.log.error({ err: error }, "batch offer import failed");
      return reply.code(502).send({ code: "UPSTREAM_ERROR", message: "批量获取1688商品失败" });
    }
  });

  if (options.config.nodeEnv === "production") {
    const webRoot = path.resolve(process.cwd(), "dist/web");
    await app.register(staticPlugin, { root: webRoot, prefix: "/" });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) {
        return reply.code(404).send({ code: "NOT_FOUND" });
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}

function createOAuthClient(config: ServerConfig): AlibabaOAuthClient | undefined {
  if (!config.alibabaAppSecret) return undefined;
  return new AlibabaOAuthClient({
    appKey: config.alibabaAppKey,
    appSecret: config.alibabaAppSecret,
    callbackUrl: config.alibabaCallbackUrl,
    authorizeUrl: config.alibabaAuthorizeUrl,
    gatewayUrl: config.alibabaGatewayUrl
  });
}

function createRealConnector(
  config: ServerConfig,
  oauthClient: AlibabaOAuthClient | undefined,
  authorizations: AlibabaAuthorizationRepository
): RealAlibaba1688Connector {
  if (!config.alibabaAppSecret || !oauthClient) {
    throw new Error("真实1688模式需要配置 ALIBABA_APP_SECRET");
  }
  return new RealAlibaba1688Connector(
    new Alibaba1688ApiClient({
      appKey: config.alibabaAppKey,
      appSecret: config.alibabaAppSecret,
      gatewayUrl: config.alibabaGatewayUrl
    }),
    oauthClient,
    authorizations
  );
}

function validateRealConnectorConfig(config: ServerConfig) {
  if (!config.alibabaAppSecret) {
    throw new Error("真实1688模式需要配置 ALIBABA_APP_SECRET");
  }
  if (config.nodeEnv === "production" && !config.tokenEncryptionKey) {
    throw new Error("生产环境真实1688模式需要配置 TOKEN_ENCRYPTION_KEY");
  }
  if (config.nodeEnv === "production" && !config.mysqlUrl) {
    throw new Error("生产环境真实1688模式需要配置 MYSQL_URL 持久化授权令牌");
  }
}
