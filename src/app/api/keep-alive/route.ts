import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return true;

  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${cronSecret}`) return true;

  const secretParam = req.nextUrl.searchParams.get("secret");
  return secretParam === cronSecret;
}

export async function GET(req: NextRequest) {
  const timestamp = new Date().toISOString();

  if (!isAuthorized(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized", timestamp },
      { status: 401 }
    );
  }

  const clientConfig = getSupabaseConfig();
  const url = process.env.SUPABASE_URL?.trim() || clientConfig.url;
  const key = process.env.SUPABASE_ANON_KEY?.trim() || clientConfig.key;

  if (!url || !url.startsWith("http") || !key) {
    return NextResponse.json(
      {
        ok: false,
        error: "Supabase URL or key is not configured on the server.",
        timestamp,
      },
      { status: 500 }
    );
  }

  const startedAt = Date.now();
  try {
    const sb = createClient(url, key, {
      auth: { persistSession: false },
    });

    const { error } = await sb
      .from("academic_terms")
      .select("id", { count: "exact", head: true });

    const latencyMs = Date.now() - startedAt;

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          latencyMs,
          timestamp,
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Supabase poked successfully",
      latencyMs,
      timestamp,
    });
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        latencyMs,
        timestamp,
      },
      { status: 500 }
    );
  }
}
