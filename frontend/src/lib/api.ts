export const API_URL = import.meta.env?.VITE_API_URL ?? '';

export function apiAsset(path: string): string { return `${API_URL}${path}`; }

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}/api${path}`, {
    ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText })) as { error?: string };
    throw new Error(body.error ?? 'Request failed');
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const socketUrl = API_URL || (typeof window === 'undefined' ? '' : window.location.origin);
