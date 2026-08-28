import { randomUUID } from "node:crypto";

export const SESSION_COOKIE_NAME = "dianchao_session";

export interface Session {
  tenantId: string;
  alibabaUserId: string;
  expiresAt: Date;
}

export class SessionStore {
  private readonly sessions = new Map<string, Session>();

  create(session: Omit<Session, "expiresAt">, ttlMs = 8 * 60 * 60 * 1000) {
    const token = randomUUID();
    this.sessions.set(token, { ...session, expiresAt: new Date(Date.now() + ttlMs) });
    return token;
  }

  get(token: string): Session | undefined {
    const session = this.sessions.get(token);
    if (!session) return undefined;
    if (session.expiresAt.getTime() <= Date.now()) {
      this.sessions.delete(token);
      return undefined;
    }
    return session;
  }
}
