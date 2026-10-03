import { apiClient } from "../api/client";
import type { Paginated } from "../api/types";

/**
 * The API's `next` link is an absolute Railway URL. Rewrite it onto the
 * same-origin `/api` proxy so later pages are not blocked by CORS.
 * The client base URL is already `/api`, so the `/api` prefix is stripped.
 */
function follow(next: string | null): string | null {
  if (!next) return next;
  try {
    const url = new URL(next, window.location.origin);
    if (url.origin === window.location.origin && !next.startsWith("http")) return next;
    const path = `${url.pathname}${url.search}`;
    return path.startsWith("/api") ? path.slice(4) || "/" : path;
  } catch {
    return next;
  }
}

/** Fetches every page of a paginated endpoint and concatenates `results`. */
export async function fetchAllPages<T>(path: string, params?: Record<string, unknown>): Promise<T[]> {
  const all: T[] = [];
  let url: string | null = path;
  let isFirst = true;

  while (url) {
    const res: { data: Paginated<T> } = isFirst
      ? await apiClient.get<Paginated<T>>(url, { params })
      : await apiClient.get<Paginated<T>>(url);
    all.push(...res.data.results);
    url = follow(res.data.next);
    isFirst = false;
  }
  return all;
}
