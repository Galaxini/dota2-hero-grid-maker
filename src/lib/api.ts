const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const TOKEN_STORAGE_KEY = "dota2-grid-auth-token";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type ApiRequestOptions = {
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
  auth?: boolean;
};

export async function apiRequest<T>(
  path: string,
  { method = "GET", headers, body, signal, auth }: ApiRequestOptions = {},
): Promise<T> {
  const token = auth ? getAuthToken() : null;
  if (auth && !token) {
    throw new Error("Missing auth token");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const data = (await response.json()) as { message?: string };
      if (data?.message) {
        message = data.message;
      }
    } catch {
      // Ignore JSON parsing errors for non-JSON responses.
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

export type AuthResponse = {
  token: string;
};

export type GridRecord = {
  id: number;
  title: string;
  data: unknown;
  created_at: string;
};

export type AuthPayload = {
  email: string;
  password: string;
};

export function getAuthToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setAuthToken(token: string | null): void {
  if (typeof window === "undefined") {
    return;
  }
  if (token) {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

export async function registerUser(payload: AuthPayload): Promise<void> {
  await apiRequest<void>("/auth/register", {
    method: "POST",
    body: payload,
  });
}

export async function loginUser(payload: AuthPayload): Promise<string> {
  const data = await apiRequest<AuthResponse>("/auth/login", {
    method: "POST",
    body: payload,
  });
  setAuthToken(data.token);
  return data.token;
}

export async function getDefaultGrid(): Promise<GridRecord> {
  return apiRequest<GridRecord>("/default-grid");
}

export async function getUserGrids(): Promise<GridRecord[]> {
  return apiRequest<GridRecord[]>("/grids", { auth: true });
}

export async function createGrid(payload: {
  title: string;
  data: unknown;
}): Promise<GridRecord> {
  return apiRequest<GridRecord>("/grids", {
    method: "POST",
    body: payload,
    auth: true,
  });
}
