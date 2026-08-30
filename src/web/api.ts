import type {
  BindWechatStoreRequest,
  CreateDistributionBatchRequest,
  DistributionBatch,
  OfferSearchRequest,
  OfferSearchResult,
  OfferSnapshot,
  WechatStore
} from "../shared/contracts";

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
  const [healthResponse, runtimeResponse] = await Promise.all([
    fetch("/api/health"),
    fetch("/api/runtime")
  ]);
  if (!healthResponse.ok || !runtimeResponse.ok) throw new Error("服务暂不可用");
  const runtime = (await runtimeResponse.json()) as { connectorMode: "mock" | "real" };
  let session = await loadSession();
  if (!session && runtime.connectorMode === "mock") {
    sessionStorage.removeItem(TOKEN_KEY);
    await createDevToken();
    session = await loadSession();
  }
  return {
    mode: runtime.connectorMode,
    session,
    connected: runtime.connectorMode === "mock" || Boolean(session?.alibabaAuthorized)
  };
}

export function alibabaAuthorizationUrl(returnTo = "/"): string {
  return `/api/auth/1688/start?returnTo=${encodeURIComponent(returnTo)}`;
}

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...devAuthorizationHeader(),
      ...init?.headers
    }
  });
  if (response.status === 204) return undefined as T;
  const body = (await response.json().catch(() => ({}))) as { data?: T; message?: string };
  if (!response.ok) throw new Error(body.message ?? "请求失败");
  return (body.data ?? body) as T;
}

export function importOffers(offerUrlOrIds: string[]): Promise<OfferSnapshot[]> {
  return apiRequest("/api/1688/offers/import-batch", {
    method: "POST",
    body: JSON.stringify({ offerUrlOrIds })
  });
}

export function listOffers(query = ""): Promise<OfferSnapshot[]> {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  return apiRequest(`/api/1688/offers${params.size ? `?${params}` : ""}`);
}

export function searchOffers(input: OfferSearchRequest): Promise<OfferSearchResult> {
  return apiRequest("/api/1688/offers/search", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function listStores(): Promise<WechatStore[]> {
  return apiRequest("/api/stores");
}

export function bindWechatStore(input: BindWechatStoreRequest): Promise<WechatStore> {
  return apiRequest("/api/stores/wechat", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function removeStore(storeId: string): Promise<void> {
  return apiRequest(`/api/stores/${storeId}`, { method: "DELETE" });
}

export function createDistributionBatch(input: CreateDistributionBatchRequest): Promise<DistributionBatch> {
  return apiRequest("/api/distribution/batches", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function listDistributionBatches(): Promise<DistributionBatch[]> {
  return apiRequest("/api/distribution/batches");
}

export function loadDistributionBatch(batchId: string): Promise<DistributionBatch> {
  return apiRequest(`/api/distribution/batches/${batchId}`);
}
