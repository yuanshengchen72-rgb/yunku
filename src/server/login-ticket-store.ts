import { randomUUID } from "node:crypto";

interface LoginTicket {
  sessionToken: string;
  expiresAt: number;
}

export class LoginTicketStore {
  private readonly tickets = new Map<string, LoginTicket>();

  issue(sessionToken: string, ttlMs = 60 * 1000): string {
    const ticket = randomUUID();
    this.tickets.set(ticket, { sessionToken, expiresAt: Date.now() + ttlMs });
    return ticket;
  }

  consume(ticket: string): string | undefined {
    const value = this.tickets.get(ticket);
    this.tickets.delete(ticket);
    if (!value || value.expiresAt <= Date.now()) return undefined;
    return value.sessionToken;
  }
}
