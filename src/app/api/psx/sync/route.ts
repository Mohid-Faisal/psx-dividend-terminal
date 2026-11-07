import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { scrapePsxCompany } from "@/lib/psx-scraper";
import { seedSupabaseIfNeeded } from "@/lib/db-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  return handleSync();
}

export async function POST() {
  return handleSync();
}

async function handleSync() {
  try {
    await seedSupabaseIfNeeded();

    const { data: companies, error: compErr } = await supabase
      .from("psx_companies")
      .select("ticker, name, frequency");

    if (compErr || !companies) {
      return NextResponse.json(
        { ok: false, error: compErr?.message || "No companies found" },
        { status: 500 }
      );
    }

    // Compute current active shares per ticker from transactions so we know eligible shares for new dividend announcements
    const { data: txns } = await supabase
      .from("psx_transactions")
      .select("ticker, action, shares");

    const activeSharesMap = new Map<string, number>();
    for (const tx of txns || []) {
      const cur = activeSharesMap.get(tx.ticker) || 0;
      const sh = Number(tx.shares) || 0;
      activeSharesMap.set(
        tx.ticker,
        tx.action === "Buy" ? cur + sh : Math.max(0, cur - sh)
      );
    }

    // Fetch existing announcement IDs
    const { data: existingAnns } = await supabase
      .from("psx_announcements")
      .select("id, added_to_dividends");
    const existingAnnSet = new Set((existingAnns || []).map((a) => a.id));

    // Scrape PSX in parallel batches of 6
    const batchSize = 6;
    const updatedQuotes: string[] = [];
    const newDividendAnnouncements: {
      id: string;
      ticker: string;
      announcementDate: string;
      title: string;
      pdfUrl: string;
      parsedDps: number | null;
      parsedTerm: string;
      parsedYear: string;
    }[] = [];

    for (let i = 0; i < companies.length; i += batchSize) {
      const batch = companies.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map((c) => scrapePsxCompany(c.ticker))
      );

      for (const res of results) {
        if (!res) continue;

        await supabase
          .from("psx_companies")
          .update({
            price: res.price,
            ldcp: res.ldcp,
            change: res.change,
            change_pct: res.changePct,
            sector: res.sector,
            pe: res.pe,
            high52: res.high52,
            day_range: res.dayRange,
            volume: res.volume,
            as_of: res.asOf,
            updated_at: new Date().toISOString(),
          })
          .eq("ticker", res.ticker);

        updatedQuotes.push(res.ticker);

        // Process announcements for this company
        const dividendAnns = res.announcements.filter((a) => a.isDividend);
        for (const ann of dividendAnns) {
          if (!existingAnnSet.has(ann.id)) {
            existingAnnSet.add(ann.id);
            const activeShares = activeSharesMap.get(ann.ticker) || 0;
            const shouldAutoQueue =
              activeShares > 0 && ann.parsedDps !== null && ann.parsedDps > 0;

            await supabase.from("psx_announcements").upsert({
              id: ann.id,
              ticker: ann.ticker,
              announcement_date: ann.announcementDate,
              title: ann.title,
              pdf_url: ann.pdfUrl,
              is_dividend: true,
              parsed_dps: ann.parsedDps,
              parsed_term: ann.parsedTerm,
              parsed_year: ann.parsedYear,
              notified: false,
              added_to_dividends: shouldAutoQueue,
            });

            if (shouldAutoQueue && ann.parsedDps) {
              const gross = activeShares * ann.parsedDps;
              const wht = Math.round(gross * 0.15);
              await supabase.from("psx_dividends").insert({
                payment_date: "",
                ticker: ann.ticker,
                year: ann.parsedYear,
                term: ann.parsedTerm,
                shares_eligible: activeShares,
                status: "Unpaid",
                announcement_date: ann.announcementDate,
                expected_payment_date: "",
                dps: ann.parsedDps,
                wht,
                zakat: 0,
                reinvest: "No",
                reinvest_price: 0,
                announcement_id: ann.id,
              });
            }

            newDividendAnnouncements.push({
              id: ann.id,
              ticker: ann.ticker,
              announcementDate: ann.announcementDate,
              title: ann.title,
              pdfUrl: ann.pdfUrl,
              parsedDps: ann.parsedDps,
              parsedTerm: ann.parsedTerm,
              parsedYear: ann.parsedYear,
            });
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      syncedAt: new Date().toISOString(),
      updatedCount: updatedQuotes.length,
      updatedTickers: updatedQuotes,
      newDividendAnnouncements,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown sync error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
