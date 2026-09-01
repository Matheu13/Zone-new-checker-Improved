import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  // NEXT_PUBLIC_* is normally embedded during `next build`. Reading it by key
  // here also supports container platforms that inject environment values only
  // when the standalone server starts.
  const siteKey =
    process.env["TURNSTILE_SITE_KEY"] ||
    process.env["NEXT_PUBLIC_TURNSTILE_SITE_KEY"] ||
    "";

  return NextResponse.json(
    { siteKey },
    { headers: { "Cache-Control": "no-store" } }
  );
}
