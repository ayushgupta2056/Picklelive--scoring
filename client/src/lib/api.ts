export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: any, public issues?: { path: string; message: string }[]) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Network error – check your connection");
  }
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) {
    const issues = data?.issues as { path: string; message: string }[] | undefined;
    const msg = issues?.length ? `${data.error}: ${issues.map((i) => `${i.path ? i.path + " – " : ""}${i.message}`).join("; ")}` : data?.error ?? res.statusText;
    throw new ApiError(res.status, msg, data?.details, issues);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string, headers?: Record<string, string>) => request<T>("GET", url, undefined, headers),
  post: <T>(url: string, body?: unknown, headers?: Record<string, string>) => request<T>("POST", url, body ?? {}, headers),
  put: <T>(url: string, body?: unknown, headers?: Record<string, string>) => request<T>("PUT", url, body ?? {}, headers),
  patch: <T>(url: string, body?: unknown) => request<T>("PATCH", url, body ?? {}),
  del: <T>(url: string) => request<T>("DELETE", url),
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const errs = e.details?.errors as string[] | undefined;
    return errs?.length ? `${e.message}: ${errs.join("; ")}` : e.message;
  }
  return e instanceof Error ? e.message : String(e);
}
