import { NextRequest, NextResponse } from "next/server";
import { scrapePsxCompany } from "@/lib/psx-scraper";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker");
  if (!ticker) {
    return NextResponse.json(
      { ok: false, error: "Ticker parameter is required" },
      { status: 400 }
    );
  }

  const data = await scrapePsxCompany(ticker);
  if (!data) {
    return NextResponse.json(
      { ok: false, error: `Could not fetch PSX data for ${ticker}` },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, company: data });
}
