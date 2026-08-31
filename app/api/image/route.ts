import { NextResponse } from "next/server";
import { fetchWithTimeout, readResponseBytes } from "@/lib/http";
import { assertSafePublicUrl } from "@/lib/networkSecurity";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
} as const;

function requireClient(req: Request): Response | null {
  const v = req.headers.get("x-zonenew-client");
  let qp = "";
  try {
    qp = new URL(req.url).searchParams.get("client") || "";
  } catch {
    qp = "";
  }
  if (v !== "1" && qp !== "1") {
    return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403, headers: NO_STORE_HEADERS });
  }
  return null;
}

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 120;
const rateState = new Map<string, { resetAt: number; count: number }>();

function getClientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for") || "";
  const first = xf.split(",")[0]?.trim();
  return first || "unknown";
}

function allowRate(key: string): boolean {
  const now = Date.now();
  const cur = rateState.get(key);
  if (!cur || now >= cur.resetAt) {
    rateState.set(key, { resetAt: now + RATE_WINDOW_MS, count: 1 });
    return true;
  }
  cur.count += 1;
  return cur.count <= RATE_MAX;
}

function pickContentType(u: string): string {
  // Fallback content-type detection when upstream doesn't provide one.
  const lower = u.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

const ALLOWED_IMAGE_TYPES = new Set(["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"]);

export async function GET(req: Request) {
  const requestId = crypto.randomUUID();
  try {
    const blocked = requireClient(req);
    if (blocked) return blocked;

    const ip = getClientIp(req);
    if (!allowRate(ip)) {
      return NextResponse.json({ requestId, ok: false, error: "Too many requests." }, { status: 429, headers: NO_STORE_HEADERS });
    }

    // Simple image proxy for channel logos.
    // Reasons:
    // - many portals block hotlinking
    // - many portals return relative logo URLs
    // - some portals have inconsistent CORS headers
    // We restrict to http/https URLs and cache successful responses.
    const { searchParams } = new URL(req.url);
    const target = (searchParams.get("url") || "").trim();
    if (!target) {
      return NextResponse.json({ requestId, ok: false, error: "Missing url." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    if (target.length > 2048) {
      return NextResponse.json({ requestId, ok: false, error: "URL too large." }, { status: 413, headers: NO_STORE_HEADERS });
    }

    let u: URL;
    try {
      u = new URL(target);
    } catch {
      return NextResponse.json({ requestId, ok: false, error: "Invalid url." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return NextResponse.json({ requestId, ok: false, error: "Unsupported protocol." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    try {
      await assertSafePublicUrl(u);
    } catch {
      return NextResponse.json({ requestId, ok: false, error: "Blocked destination." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    const res = await fetchWithTimeout(u.toString(), {
      method: "GET",
      headers: {
        "User-Agent": "IPTVChecker/1.0",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
      timeoutMs: 20000,
      publicOnly: true,
    });

    if (!res.ok) {
      return NextResponse.json(
        { requestId, ok: false, error: `Image fetch failed (HTTP ${res.status}).` },
        { status: 502, headers: NO_STORE_HEADERS }
      );
    }

    const contentType = (res.headers.get("content-type") || pickContentType(u.pathname)).split(";", 1)[0]!.trim().toLowerCase();
    if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
      return NextResponse.json(
        { requestId, ok: false, error: "Remote resource is not a supported image." },
        { status: 415, headers: NO_STORE_HEADERS }
      );
    }
    const buf = await readResponseBytes(res, 5_000_000);

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e: unknown) {
    const msg =
      typeof e === "object" && e !== null && "name" in e && (e as { name?: unknown }).name === "AbortError"
        ? "Request timed out."
        : e instanceof Error
          ? e.message
          : "Unknown error.";
    return NextResponse.json({ requestId, ok: false, error: msg }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
