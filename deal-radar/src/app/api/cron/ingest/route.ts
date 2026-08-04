import { NextResponse } from "next/server";
import { runIngest } from "@/lib/pipeline";
import { serviceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");

  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const started = Date.now();
  try {
    const db = serviceClient();
    const max = Number(process.env.MAX_ARTICLES_PER_RUN ?? 120);
    const report = await runIngest(db, max);
    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - started,
      ...report,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: message, durationMs: Date.now() - started },
      { status: 500 },
    );
  }
}
