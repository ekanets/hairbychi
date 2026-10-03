import axios, { AxiosError } from "axios";
import type { ApiErrorBody } from "./types";

const normalizeApiBaseUrl = (value: string) => value.replace(/\/+$/, "").replace(/\/api$/, "");

// Accept either the raw host (recommended) or a full /api URL, but never duplicate /api.
// The browser always calls same-origin /api. Vite (dev) and vercel.json (deploy)
// proxy that to VITE_API_BASE_URL. Railway does not send CORS headers, so a
// direct browser call to the API origin cannot read the catalog.
export const API_BASE_URL = normalizeApiBaseUrl(
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000",
);

export const apiClient = axios.create({
  baseURL: "/api",
  timeout: 20000,
  withCredentials: true,
});

const ADMIN_TOKEN_KEY = "bbc_admin_session_token";

export function getAdminToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string | null) {
  if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
  else localStorage.removeItem(ADMIN_TOKEN_KEY);
}

function isAdminRequest(url?: string) {
  if (!url) return false;
  const path = url.startsWith("http") ? new URL(url).pathname : url;
  return path.startsWith("/admin") || path.includes("/api/admin");
}

apiClient.interceptors.request.use((config) => {
  if (isAdminRequest(config.url)) {
    const token = getAdminToken();
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

export class ApiRequestError extends Error {
  code: string;
  fields?: Record<string, unknown>;

  constructor(code: string, message: string, fields?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.fields = fields;
  }
}

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorBody>) => {
    if (
      isAdminRequest(error.config?.url) &&
      (error.response?.status === 401 || error.response?.status === 403)
    ) {
      setAdminToken(null);
      window.dispatchEvent(new Event("bbc-admin-unauthorized"));
    }

    if (error.code === "ERR_NETWORK") {
      const message =
        error.config?.baseURL && error.config.baseURL.includes("railway")
          ? "The request was blocked by CORS or network policy. Check the Railway backend CORS settings and the VITE_API_BASE_URL value."
          : "Couldn't reach the server. Please try again.";

      return Promise.reject(new ApiRequestError("network_error", message));
    }

    const body = error.response?.data;
    if (body?.error) {
      return Promise.reject(new ApiRequestError(body.error.code, body.error.message, body.error.fields));
    }
    return Promise.reject(new ApiRequestError("network_error", "Couldn't reach the server. Please try again."));
  }
);
