import { randomUUID } from "node:crypto";
import type { TokenCipher } from "../connectors/alibaba1688/auth-store.js";

export const SESSION_COOKIE_NAME = "dianchao_session";

export interface Session {
  tenantId: string;
  alibabaUserId: string;
  expiresAt: Date;
}

interface EncryptedSessionPayload {
  version: 1;
  tenantId: string;
  alibabaUserId: string;
  expiresAt: string;
}

export class SessionStore {
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly cipher?: Pick<TokenCipher, "encrypt" | "decrypt">) {}

  create(session: Omit<Session, "expiresAt">, ttlMs = 8 * 60 * 60 * 1000) {
    const expiresAt = new Date(Date.now() + ttlMs);
    if (this.cipher) {
      const payload: EncryptedSessionPayload = {
        version: 1,
        tenantId: session.tenantId,
        alibabaUserId: session.alibabaUserId,
        expiresAt: expiresAt.toISOString()
      };
      return this.cipher.encrypt(JSON.stringify(payload));
    }
    const token = randomUUID();
    this.sessions.set(token, { ...session, expiresAt });
    return token;
  }

  get(token: string): Session | undefined {
    const session = this.sessions.get(token);
    if (session) {
      if (session.expiresAt.getTime() > Date.now()) return session;
      this.sessions.delete(token);
    }
    if (!this.cipher) return undefined;

    try {
      const payload = JSON.parse(this.cipher.decrypt(token)) as Partial<EncryptedSessionPayload>;
      if (
        payload.version !== 1
        || typeof payload.tenantId !== "string"
        || !payload.tenantId
        || typeof payload.alibabaUserId !== "string"
        || !payload.alibabaUserId
        || typeof payload.expiresAt !== "string"
      ) return undefined;
      const expiresAt = new Date(payload.expiresAt);
      if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) return undefined;
      return {
        tenantId: payload.tenantId,
        alibabaUserId: payload.alibabaUserId,
        expiresAt
      };
    } catch {
      return undefined;
    }
  }
}
