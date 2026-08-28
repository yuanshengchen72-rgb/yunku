import { randomUUID } from "node:crypto";

interface OAuthState {
  returnTo: string;
  expiresAt: number;
}

export class OAuthStateStore {
  private readonly states = new Map<string, OAuthState>();

  issue(returnTo = "/", ttlMs = 10 * 60 * 1000): string {
    const state = `dc_${randomUUID()}`;
    this.states.set(state, { returnTo: this.safeReturnTo(returnTo), expiresAt: Date.now() + ttlMs });
    return state;
  }

  consume(state: string): OAuthState | undefined {
    const value = this.states.get(state);
    this.states.delete(state);
    if (!value || value.expiresAt <= Date.now()) return undefined;
    return value;
  }

  isDianchaoState(state: string): boolean {
    return state.startsWith("dc_");
  }

  private safeReturnTo(value: string): string {
    return value.startsWith("/") && !value.startsWith("//") ? value : "/";
  }
}
