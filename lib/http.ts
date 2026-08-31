import { assertSafePublicUrl, isExactDomainOrSubdomain } from "@/lib/networkSecurity";

type SafeFetchInit = RequestInit & {
  timeoutMs?: number;
  publicOnly?: boolean;
  maxRedirects?: number;
  allowedDomains?: string[];
};

export async function fetchWithTimeout(input: RequestInfo | URL, init: SafeFetchInit = {}) {
  // Wrapper around fetch() that aborts the request after timeoutMs.
  // This keeps Vercel serverless functions from hanging on slow IPTV portals.
  const { timeoutMs = 20000, publicOnly = false, maxRedirects = 3, allowedDomains, ...rest } = init;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let currentUrl = input instanceof Request ? input.url : input.toString();
    let method = (rest.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    let body = rest.body;

    for (let redirects = 0; ; redirects++) {
      const current = publicOnly ? await assertSafePublicUrl(currentUrl) : new URL(currentUrl);
      if (allowedDomains?.length && !allowedDomains.some((domain) => isExactDomainOrSubdomain(current.hostname, domain))) {
        throw new Error("Remote redirect left the permitted domain.");
      }

      const headers = new Headers(rest.headers);
      if (body === undefined) headers.delete("content-type");
      const res = await fetch(currentUrl, {
        ...rest,
        method,
        body,
        headers,
        redirect: "manual",
        signal: controller.signal,
        cache: "no-store",
      });

      if (![301, 302, 303, 307, 308].includes(res.status)) return res;
      if (redirects >= maxRedirects) throw new Error("Too many redirects from the remote server.");

      const location = res.headers.get("location");
      if (!location) throw new Error("Remote server returned an invalid redirect.");
      const nextUrl = new URL(location, currentUrl);
      const hasSensitiveHeaders = headers.has("authorization") || headers.has("cookie");
      if (nextUrl.hostname !== current.hostname && (body !== undefined || hasSensitiveHeaders)) {
        throw new Error("Remote server attempted to redirect credentials to another host.");
      }
      currentUrl = nextUrl.toString();

      if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === "POST")) {
        method = "GET";
        body = undefined;
      }
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function readResponseBytes(res: Response, maxBytes: number): Promise<Uint8Array> {
  const declaredLength = Number(res.headers.get("content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new Error("Remote response is too large.");
  if (!res.body) return new Uint8Array();

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("Remote response is too large.");
    }
    chunks.push(value);
  }

  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export async function safeJson(res: Response, maxBytes = 2_000_000): Promise<unknown> {
  // Some remote services return HTML error pages while still responding with HTTP 200.
  const text = new TextDecoder().decode(await readResponseBytes(res, maxBytes));
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Remote server returned a non-JSON response.");
  }
}

export async function readJsonBody(req: Request, maxBytes = 16_384): Promise<unknown> {
  const declaredLength = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new Error("Request body is too large.");
  if (!req.body) throw new Error("Request body is required.");

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("Request body is too large.");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("Invalid JSON body.");
  }
}
