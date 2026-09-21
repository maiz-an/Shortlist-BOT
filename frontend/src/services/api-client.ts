const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5871/api';
const API_TOKEN = import.meta.env.VITE_API_TOKEN ?? '';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        ...(isForm ? {} : { 'Content-Type': 'application/json' }),
        ...(API_TOKEN ? { 'X-Api-Token': API_TOKEN } : {}),
      },
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the backend. Is it running on port 5871?');
  }

  const text = await res.text();
  if (!res.ok) {
    let message = res.statusText;
    try {
      const parsed = JSON.parse(text) as { message?: string | string[] };
      message = Array.isArray(parsed.message) ? parsed.message.join(', ') : (parsed.message ?? message);
    } catch {
      if (text) message = text.slice(0, 200);
    }
    throw new ApiError(res.status, message);
  }
  return (text ? JSON.parse(text) : undefined) as T;
}

const body = (data?: unknown) => (data === undefined ? undefined : JSON.stringify(data));

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) => request<T>(path, { method: 'POST', body: body(data) }),
  put: <T>(path: string, data?: unknown) => request<T>(path, { method: 'PUT', body: body(data) }),
  patch: <T>(path: string, data?: unknown) => request<T>(path, { method: 'PATCH', body: body(data) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', body: form }),
  /** URL for browser-navigated resources (file download) that cannot send headers. */
  url: (path: string) => `${API_BASE_URL}${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(API_TOKEN)}`,
};
