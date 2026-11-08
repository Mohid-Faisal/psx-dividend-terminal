import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  scrapePsxCompany,
  KNOWN_PSX_ANNOUNCED_DIVIDENDS,
} from "@/lib/psx-scraper";

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
    // 1. Fetch companies, transactions, dividends, and existing announcement IDs in ONE parallel roundtrip
    const [compRes, txRes, divRes, annRes] = await Promise.all([
      supabase.from("psx_companies").select("ticker, name, frequency"),
      supabase.from("psx_transactions").select("ticker, action, shares"),
      supabase
        .from("psx_dividends")
        .select("ticker, payment_date, status, dps, term, year"),
      supabase.from("psx_announcements").select("id, added_to_dividends"),
    ]);

    const companies = compRes.data || [];
    if (compRes.error || companies.length === 0) {
      return NextResponse.json(
        { ok: false, error: compRes.error?.message || "No companies found" },
        { status: 500 }
      );
    }

    // Compute exact active shares per ticker (including MCB 225 legacy shares)
    const activeSharesMap = new Map<string, number>();
    activeSharesMap.set("MCB", 225);
    for (const tx of txRes.data || []) {
      const cur = activeSharesMap.get(tx.ticker) || 0;
      const sh = Math.abs(Number(tx.shares) || 0);
      activeSharesMap.set(
        tx.ticker,
        tx.action === "Buy" ? cur + sh : Math.max(0, cur - sh)
      );
    }

    // Added tickers: only search dividend announcements for tickers that exist in user's portfolio!
    const addedTickers = new Set<string>();
    for (const [ticker, shares] of activeSharesMap.entries()) {
      if (shares > 0) addedTickers.add(ticker);
    }
    for (const tx of txRes.data || []) {
      if (tx.ticker) addedTickers.add(tx.ticker);
    }

    // 2. Scrape live data from PSX for all companies (to update live price quotes)
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

    for (const res of scrapedResults) {
      if (!res) continue;
      const meta = companyMetaMap.get(res.ticker);
      companyUpsertRows.push({
        ticker: res.ticker,
        name: meta?.name || res.name || res.ticker,
        frequency: meta?.frequency || "Qtr",
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
    }

    // 3. Process announcements ONLY for added tickers!
    const candidateAnnouncements: {
      id: string;
      ticker: string;
      announcementDate: string;
      title: string;
      pdfUrl: string;
      parsedDps: number;
      parsedTerm: string;
      parsedYear: string;
    }[] = [];

    // A) Scraped announcements for added tickers ONLY
    for (const res of scrapedResults) {
      if (!res) continue;
      if (!addedTickers.has(res.ticker)) continue; // STRICTLY ONLY SEARCH ADDED TICKERS!
      const activeShares = activeSharesMap.get(res.ticker) || 0;
      if (activeShares <= 0) continue;

      for (const ann of res.announcements) {
        if (ann.isDividend && ann.parsedDps && ann.parsedDps > 0) {
          candidateAnnouncements.push({
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

    // B) Known announced corporate dividend registry for added tickers
    for (const known of KNOWN_PSX_ANNOUNCED_DIVIDENDS) {
      if (!addedTickers.has(known.ticker)) continue; // STRICTLY ONLY ADDED TICKERS!
      const activeShares = activeSharesMap.get(known.ticker) || 0;
      if (activeShares <= 0) continue;

      const alreadyInCandidates = candidateAnnouncements.some(
        (c) =>
          c.ticker === known.ticker &&
          c.parsedTerm.toUpperCase() === known.term.toUpperCase() &&
          c.parsedYear === known.year
      );

      if (!alreadyInCandidates) {
        candidateAnnouncements.push({
          id: known.announcementId,
          ticker: known.ticker,
          announcementDate: known.announcementDate,
          title: known.title,
          pdfUrl: known.pdfUrl || "",
          parsedDps: known.dps,
          parsedTerm: known.term,
          parsedYear: known.year,
        });
      }
    }

    // 4. Compare candidate announcements against psx_dividends in Supabase
    // If an announced dividend for an added ticker is NOT present in psx_dividends (e.g. deleted or newly announced),
    // sync brings it back / queues it into psx_dividends as Unpaid!
    const existingDivs = [...(divRes.data || [])];
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

    for (const ann of candidateAnnouncements) {
      const activeShares = activeSharesMap.get(ann.ticker) || 0;
      if (activeShares <= 0) continue;

      const alreadyInDividends = existingDivs.some((d) => {
        if (d.ticker !== ann.ticker) return false;
        const termMatches =
          (d.term || "").trim().toUpperCase() ===
          (ann.parsedTerm || "").trim().toUpperCase();
        const yearMatches =
          String(d.year || "").includes(String(ann.parsedYear || "")) ||
          String(ann.parsedYear || "").includes(String(d.year || ""));
        if (termMatches && yearMatches) return true;
        if (
          termMatches &&
          Math.abs(Number(d.dps) - Number(ann.parsedDps)) < 0.05
        ) {
          return true;
        }
        return false;
      });

      if (!alreadyInDividends) {
        const gross = activeShares * ann.parsedDps;
        const wht = Math.round(gross * 0.15);

        newDivInsertRows.push({
          payment_date:
            ann.announcementDate || new Date().toISOString().slice(0, 10),
          ticker: ann.ticker,
          year: ann.parsedYear,
          term: ann.parsedTerm,
          shares_eligible: activeShares,
          status: "Unpaid",
          announcement_date: ann.announcementDate,
          expected_payment_date: ann.announcementDate,
          dps: ann.parsedDps,
          wht,
          zakat: 0,
          reinvest: "No",
          reinvest_price: 0,
          announcement_id: ann.id,
        });

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
          added_to_dividends: true,
        });

        existingDivs.push({
          ticker: ann.ticker,
          payment_date: ann.announcementDate,
          status: "Unpaid",
          dps: ann.parsedDps,
          term: ann.parsedTerm,
          year: ann.parsedYear,
        });
      }
    }

    // 5. Bulk DB Writes
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
      autoQueuedDividends: newDivInsertRows.map((d) => ({
        ticker: d.ticker,
        year: d.year,
        term: d.term,
        dps: d.dps,
        shares: d.shares_eligible,
        wht: d.wht,
        net: d.shares_eligible * d.dps - d.wht,
      })),
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
