export const API_URL = import.meta.env?.VITE_API_URL ?? '';

export function apiAsset(path: string): string { return `${API_URL}${path}`; }

/**
 * Fallo de `api()`. `message` es el `error` del cuerpo tal cual (o el texto de estado, o «Request failed»), porque los
 * traductores de cada pantalla lo usan de clave; `status` es el código HTTP y `network` marca que la petición no llegó
 * al servidor (sin `status`). Los textos para la pantalla salen de `lib/api-errors.ts`.
 */
export class ApiError extends Error {
  readonly status: number | undefined;
  readonly network: boolean;

  constructor(message: string, { status, network = false, cause }: { status?: number; network?: boolean; cause?: unknown } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'ApiError';
    this.status = status;
    this.network = network;
  }
}

function isAbort(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api${path}`, {
      ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch (caught) {
    // Una cancelación sigue siendo un `AbortError`; lo demás es que la petición no llegó (sin red, CORS, DNS…).
    if (isAbort(caught)) throw caught;
    throw new ApiError(caught instanceof Error ? caught.message : String(caught), { network: true, cause: caught });
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText })) as { error?: string };
    throw new ApiError(body.error ?? 'Request failed', { status: response.status });
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const socketUrl = API_URL || (typeof window === 'undefined' ? '' : window.location.origin);
