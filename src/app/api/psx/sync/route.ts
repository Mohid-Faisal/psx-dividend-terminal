import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { scrapePsxCompany } from "@/lib/psx-scraper";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  return handleSync();
}

export async function POST() {
  return handleSync();
}

async function handleSync() {
  const startedAt = Date.now();
  try {
    // 1. Fetch companies, transactions, and existing announcement IDs in ONE parallel roundtrip
    const [compRes, txRes, annRes] = await Promise.all([
      supabase.from("psx_companies").select("ticker, name, frequency"),
      supabase.from("psx_transactions").select("ticker, action, shares"),
      supabase.from("psx_announcements").select("id, added_to_dividends"),
    ]);

    const companies = compRes.data || [];
    if (compRes.error || companies.length === 0) {
      return NextResponse.json(
        { ok: false, error: compRes.error?.message || "No companies found" },
        { status: 500 }
      );
    }

    const activeSharesMap = new Map<string, number>();
    for (const tx of txRes.data || []) {
      const cur = activeSharesMap.get(tx.ticker) || 0;
      const sh = Number(tx.shares) || 0;
      activeSharesMap.set(
        tx.ticker,
        tx.action === "Buy" ? cur + sh : Math.max(0, cur - sh)
      );
    }

    const existingAnnSet = new Set((annRes.data || []).map((a) => a.id));

    // 2. Scrape ALL 27 PSX companies in full parallel (takes ~1.2 - 1.8s total!)
    const scrapedResults = await Promise.all(
      companies.map((c) => scrapePsxCompany(c.ticker))
    );

    const nowIso = new Date().toISOString();
    const companyMetaMap = new Map(companies.map((c) => [c.ticker, c]));

    const companyUpsertRows: {
      ticker: string;
      name: string;
      frequency: string;
      price: number;
      ldcp: number;
      change: number;
      change_pct: number;
      sector: string;
      pe: string;
      high52: string;
      day_range: string;
      volume: string;
      as_of: string;
      updated_at: string;
    }[] = [];

    const newAnnUpsertRows: {
      id: string;
      ticker: string;
      announcement_date: string;
      title: string;
      pdf_url: string;
      is_dividend: boolean;
      parsed_dps: number | null;
      parsed_term: string;
      parsed_year: string;
      notified: boolean;
      added_to_dividends: boolean;
    }[] = [];

    const newDivInsertRows: {
      payment_date: string;
      ticker: string;
      year: string;
      term: string;
      shares_eligible: number;
      status: string;
      announcement_date: string;
      expected_payment_date: string;
      dps: number;
      wht: number;
      zakat: number;
      reinvest: string;
      reinvest_price: number;
      announcement_id: string;
    }[] = [];

    for (const res of scrapedResults) {
      if (!res) continue;
      const meta = companyMetaMap.get(res.ticker);
      companyUpsertRows.push({
        ticker: res.ticker,
        name: meta?.name || res.name || res.ticker,
        frequency: meta?.frequency || "Quarterly",
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
        updated_at: nowIso,
      });

      const dividendAnns = res.announcements.filter((a) => a.isDividend);
      for (const ann of dividendAnns) {
        if (!existingAnnSet.has(ann.id)) {
          existingAnnSet.add(ann.id);
          const activeShares = activeSharesMap.get(ann.ticker) || 0;
          const shouldAutoQueue =
            activeShares > 0 && ann.parsedDps !== null && ann.parsedDps > 0;

          newAnnUpsertRows.push({
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
            newDivInsertRows.push({
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
        }
      }
    }

    // 3. Single bulk DB write for all 27 companies + any new announcements!
    const dbWrites: PromiseLike<unknown>[] = [];
    if (companyUpsertRows.length > 0) {
      dbWrites.push(
        supabase
          .from("psx_companies")
          .upsert(companyUpsertRows, { onConflict: "ticker" })
      );
    }
    if (newAnnUpsertRows.length > 0) {
      dbWrites.push(
        supabase
          .from("psx_announcements")
          .upsert(newAnnUpsertRows, { onConflict: "id" })
      );
    }
    if (newDivInsertRows.length > 0) {
      dbWrites.push(supabase.from("psx_dividends").insert(newDivInsertRows));
    }
    await Promise.all(dbWrites);

    // Return updated companies directly so client state updates in 0ms without re-fetching!
    const clientCompanies = companyUpsertRows.map((r) => ({
      ticker: r.ticker,
      name: r.name,
      frequency: r.frequency,
      price: r.price,
      ldcp: r.ldcp,
      change: r.change,
      changePct: r.change_pct,
      sector: r.sector,
      pe: r.pe,
      high52: r.high52,
      dayRange: r.day_range,
      volume: r.volume,
      asOf: r.as_of,
    }));

    return NextResponse.json({
      ok: true,
      syncedAt: nowIso,
      durationMs: Date.now() - startedAt,
      updatedCount: companyUpsertRows.length,
      companies: clientCompanies,
      newDividendAnnouncements: newAnnUpsertRows.map((a) => ({
        id: a.id,
        ticker: a.ticker,
        announcementDate: a.announcement_date,
        title: a.title,
        pdfUrl: a.pdf_url,
        parsedDps: a.parsed_dps,
        parsedTerm: a.parsed_term,
        parsedYear: a.parsed_year,
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown sync error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
