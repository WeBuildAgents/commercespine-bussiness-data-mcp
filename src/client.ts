export class ServiceError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(status === 401 ? "Session expired or revoked. Run sellerplex-ppc login again." : `Service request failed (${status}, ${code}).`);
    this.name = "ServiceError";
  }
}

export function serviceOrigin(input: string): string {
  const url = new URL(input);
  if (url.username || url.password || url.search || url.hash || !/^\/(?:[a-zA-Z0-9_-]+\/?)*$/.test(url.pathname)) {
    throw new Error("Service must be a URL without credentials, query or fragment; a simple deployment path prefix is allowed.");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new Error("Use HTTPS, except for a loopback development service.");
  }
  return url.origin + url.pathname.replace(/\/$/, "");
}

export function trustedBrowserUrl(origin: string, input: string): string {
  const base = new URL(origin);
  const url = new URL(input, origin + "/");
  const prefix = base.pathname.replace(/\/$/, "");
  if (url.origin !== base.origin || url.username || url.password || (prefix && url.pathname !== prefix && !url.pathname.startsWith(prefix + "/"))) throw new Error("Service returned an untrusted browser destination.");
  return url.href;
}

export interface ApiClient {
  request(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<unknown>;
}

export class ServiceClient implements ApiClient {
  readonly origin: string;
  constructor(origin: string, private readonly token: () => Promise<string | undefined>, private readonly fetcher: typeof fetch = fetch) {
    this.origin = serviceOrigin(origin);
  }

  async request(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<unknown> {
    if (!path.startsWith("/v1/") || path.includes("\\") || path.includes("..") || path.startsWith("//")) throw new Error("Invalid service path.");
    const token = await this.token();
    if (!token) throw new ServiceError(401, "login_required");
    const response = await this.fetcher(this.origin + path, {
      method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-ppc-adapter-version": "0.3.0" },
      body: body === undefined ? undefined : JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(60_000)
    });
    if (!response.ok) {
      // Do not propagate provider bodies: they may contain credentials or another account's evidence.
      const errorBody = await response.json().catch(() => null) as {error?:{code?:unknown}} | null;
      const code = errorBody?.error?.code;
      throw new ServiceError(response.status, typeof code === "string" && /^[A-Z0-9_]{1,80}$/.test(code) ? code : response.status === 409 ? "conflict" : "request_rejected");
    }
    if (response.status === 204) return { ok: true };
    return response.json();
  }
}

const secretFields = /^(authorization|password|token|accessToken|refreshToken|apiKey|api_key|notionToken|agentToken|secret|credentials|verifier)$/i;
export function publicResult(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(publicResult);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => !secretFields.test(key)).map(([key, item]) => [key, publicResult(item)]));
  return value;
}
