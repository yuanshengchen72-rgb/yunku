import type { OfferSnapshot } from "../shared/contracts";

const TOKEN_KEY = "dianchao.dev.session";

export interface AppState {
  mode: "mock" | "real";
  session?: {
    tenantId: string;
    alibabaUserId: string;
    alibabaAuthorized: boolean;
  } | undefined;
  connected: boolean;
}

async function createDevToken(): Promise<string> {
  const existing = sessionStorage.getItem(TOKEN_KEY);
  if (existing) return existing;
  const response = await fetch("/api/dev/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ alibabaUserId: "dev-1688-user" })
  });
  if (!response.ok) throw new Error("无法创建本地开发会话");
  const body = (await response.json()) as { token: string };
  sessionStorage.setItem(TOKEN_KEY, body.token);
  return body.token;
}

function devAuthorizationHeader(): Record<string, string> {
  const token = sessionStorage.getItem(TOKEN_KEY);
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function exchangeLoginTicketFromUrl(): Promise<void> {
  const url = new URL(window.location.href);
  const ticket = url.searchParams.get("login_ticket");
  if (!ticket) return;
  const response = await fetch("/api/session/exchange", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ticket })
  });
  const body = (await response.json()) as { token?: string; message?: string };
  url.searchParams.delete("login_ticket");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  if (!response.ok || !body.token) throw new Error(body.message ?? "登录票据交换失败");
  sessionStorage.setItem(TOKEN_KEY, body.token);
}

async function loadSession() {
  const response = await fetch("/api/session", {
    credentials: "same-origin",
    headers: devAuthorizationHeader()
  });
  if (response.status === 401) return undefined;
  if (!response.ok) throw new Error("无法读取登录状态");
  return response.json() as Promise<AppState["session"] & { mode: "mock" | "real" }>;
}

export async function loadAppState(): Promise<AppState> {
  await exchangeLoginTicketFromUrl();
  const healthResponse = await fetch("/api/health");
  if (!healthResponse.ok) throw new Error("服务暂不可用");
  const health = (await healthResponse.json()) as { connectorMode: "mock" | "real" };
  let session = await loadSession();
  if (!session && health.connectorMode === "mock") {
    await createDevToken();
    session = await loadSession();
  }
  return {
    mode: health.connectorMode,
    session,
    connected: health.connectorMode === "mock" || Boolean(session?.alibabaAuthorized)
  };
}

export function alibabaAuthorizationUrl(returnTo = "/"): string {
  return `/api/auth/1688/start?returnTo=${encodeURIComponent(returnTo)}`;
}

export async function importOffers(offerUrlOrIds: string[]): Promise<OfferSnapshot[]> {
  const response = await fetch("/api/1688/offers/import-batch", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      ...devAuthorizationHeader()
    },
    body: JSON.stringify({ offerUrlOrIds })
  });

  const body = (await response.json()) as { data?: OfferSnapshot[]; message?: string };
  if (!response.ok || !body.data) throw new Error(body.message ?? "导入商品失败");
  return body.data;
}
