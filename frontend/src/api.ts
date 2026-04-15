import type {
  AuditListResponse,
  ContainerSummary,
  HealthStatus,
  ImageSummary,
  Network,
  PullProgressResponse,
  PullStartResponse,
  Volume,
} from "./types";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function normalizeApiBase(rawBase?: string) {
  const base = (rawBase || "").trim().replace(/\/+$/, "");
  if (!base) return "/api";
  return base.endsWith("/api") ? base : `${base}/api`;
}

const API_BASE = normalizeApiBase(import.meta.env.VITE_API_BASE);
const AUTH_TOKEN_STORAGE_KEY = "docker_manage.auth_token";

type RequestOptions = {
  auth?: boolean;
};

export function getStoredAuthToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || "";
}

export function setStoredAuthToken(token: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token.trim());
}

export function clearStoredAuthToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
}

type ListQuery = {
  limit?: number;
  from?: number;
  q?: string;
  status?: string;
};

type ListPageResult<T> = {
  items: T[];
  total: number;
  from: number;
  nextFrom: number;
  hasMore: boolean;
};

function withListQuery(path: string, query?: ListQuery) {
  if (!query) return path;

  const params = new URLSearchParams();
  if (typeof query.limit === "number" && Number.isFinite(query.limit) && query.limit > 0) {
    params.set("limit", String(Math.floor(query.limit)));
  }
  if (typeof query.from === "number" && Number.isFinite(query.from) && query.from >= 0) {
    params.set("from", String(Math.floor(query.from)));
  }
  if (typeof query.q === "string" && query.q.trim()) {
    params.set("q", query.q.trim());
  }
  if (typeof query.status === "string" && query.status.trim()) {
    params.set("status", query.status.trim());
  }

  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

function buildRequestInit(init?: RequestInit, options?: RequestOptions) {
  const headers = new Headers(init?.headers);
  if (options?.auth !== false) {
    const token = getStoredAuthToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  return {
    ...init,
    headers,
  };
}

async function fetchApi(path: string, init?: RequestInit, options?: RequestOptions) {
  return fetch(`${API_BASE}${path}`, buildRequestInit(init, options));
}

async function getErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      const data = (await response.json()) as { error?: string; message?: string };
      if (data.error) return data.error;
      if (data.message) return data.message;
    } catch {
      // fallback to text
    }
  }

  const text = (await response.text()).trim();
  return text || `请求失败: ${response.status}`;
}

async function request<T>(path: string, init?: RequestInit, options?: RequestOptions): Promise<T> {
  const response = await fetchApi(path, init, options);
  if (!response.ok) {
    throw new ApiError(response.status, await getErrorMessage(response));
  }
  return response.json() as Promise<T>;
}

async function requestListPage<T>(path: string): Promise<ListPageResult<T>> {
  const response = await fetchApi(path);
  if (!response.ok) {
    throw new ApiError(response.status, await getErrorMessage(response));
  }

  const items = (await response.json()) as T[];
  const total = Number(response.headers.get("x-total-count") || "0");
  const from = Number(response.headers.get("x-list-from") || "0");
  const nextFrom = Number(response.headers.get("x-next-from") || String(from + items.length));
  const hasMore = (response.headers.get("x-has-more") || "").toLowerCase() === "true";

  return {
    items,
    total: Number.isFinite(total) && total >= 0 ? total : items.length,
    from: Number.isFinite(from) && from >= 0 ? from : 0,
    nextFrom: Number.isFinite(nextFrom) && nextFrom >= 0 ? nextFrom : from + items.length,
    hasMore,
  };
}

export const apiBase = API_BASE;

export const api = {
  auth: {
    login: (token: string) =>
      request<{ message: string }>(
        "/auth/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        },
        { auth: false }
      ),
    me: () => request<{ message: string }>("/auth/me"),
  },
  health: () => request<HealthStatus>("/health"),
  images: (query?: ListQuery) => request<ImageSummary[]>(withListQuery("/images", query)),
  imagesPage: (query?: ListQuery) => requestListPage<ImageSummary>(withListQuery("/images", query)),
  pullImage: (image: string) =>
    request<PullStartResponse>(`/images/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image }),
    }),
  pullImageProgress: (taskId: string, from = 0) =>
    request<PullProgressResponse>(
      `/images/pull/${encodeURIComponent(taskId)}?from=${encodeURIComponent(String(from))}`
    ),
  containers: (query?: ListQuery) => request<ContainerSummary[]>(withListQuery("/containers", query)),
  containersPage: (query?: ListQuery) => requestListPage<ContainerSummary>(withListQuery("/containers", query)),
  createContainer: (payload: {
    image: string;
    name?: string;
    env?: string[];
    ports?: string[];
    volumes?: string[];
    network?: string;
    command?: string[];
  }) =>
    request<{ message: string }>(`/containers/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  startContainer: (id: string) =>
    request<{ message: string }>(`/containers/${encodeURIComponent(id)}/start`, {
      method: "POST",
    }),
  stopContainer: (id: string) =>
    request<{ message: string }>(`/containers/${encodeURIComponent(id)}/stop`, {
      method: "POST",
    }),
  restartContainer: (id: string) =>
    request<{ message: string }>(`/containers/${encodeURIComponent(id)}/restart`, {
      method: "POST",
    }),
  removeContainer: (id: string) =>
    request<{ message: string }>(`/containers/${encodeURIComponent(id)}?force=true`, {
      method: "DELETE",
    }),
  volumes: (query?: ListQuery) => request<Volume[]>(withListQuery("/volumes", query)),
  networks: (query?: ListQuery) => request<Network[]>(withListQuery("/networks", query)),
  logs: (id: string) => request<string[]>(`/containers/${encodeURIComponent(id)}/logs?tail=200`),
  audit: (limit = 200, from = 0, q = "", result = "", signal?: AbortSignal) => {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    params.set("from", String(from));
    if (q.trim()) params.set("q", q.trim());
    if (result.trim()) params.set("result", result.trim());
    return request<AuditListResponse>(`/audit?${params.toString()}`, { signal });
  },
};
