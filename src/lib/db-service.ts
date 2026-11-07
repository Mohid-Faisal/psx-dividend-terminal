import { supabase } from "@/lib/supabase";
import seedData from "@/data/seed-portfolio.json";
import {
  Company,
  Dividend,
  PortfolioSettings,
  PortfolioState,
  PsxAnnouncement,
  Transaction,
} from "@/types/portfolio";

export async function seedSupabaseIfNeeded(): Promise<void> {
  const { count, error } = await supabase
    .from("psx_companies")
    .select("*", { count: "exact", head: true });

  if (error) {
    console.error("Supabase check error:", error.message);
    return;
  }

  if (count && count > 0) {
    return;
  }

  await forceReseedSupabase();
}

export async function forceReseedSupabase(): Promise<void> {
  const raw = seedData as unknown as PortfolioState;

  // 1. Upsert Settings
  await supabase.from("psx_settings").upsert({
    id: 1,
    default_brokerage_rate: raw.settings.defaultBrokerageRate ?? 0.0015,
    min_brokerage_per_share: raw.settings.minBrokeragePerShare ?? 0.05,
    sst_rate: raw.settings.sstRate ?? 0.15,
    default_filer_wht_rate: raw.settings.defaultFilerWhtRate ?? 0.15,
    include_legacy_mcb_in_cashflow:
      raw.settings.includeLegacyMcbInCashflow ?? true,
    updated_at: new Date().toISOString(),
  });

  // 2. Upsert Companies
  const companyRows = raw.companies.map((c) => ({
    ticker: c.ticker,
    name: c.name,
    frequency: c.frequency || "None",
    price: c.price || 0,
    ldcp: c.ldcp || c.price || 0,
    change: c.change || 0,
    change_pct: c.changePct || 0,
    sector: c.sector || "OTHER",
    pe: c.pe || "N/A",
    high52: c.high52 || "N/A",
    day_range: c.dayRange || "N/A",
    volume: c.volume || "0",
    as_of: c.asOf || "",
    updated_at: new Date().toISOString(),
  }));
  await supabase.from("psx_companies").upsert(companyRows, {
    onConflict: "ticker",
  });

  // 3. Upsert Transactions
  const txRows = raw.transactions.map((t) => ({
    id: t.id,
    date: t.date,
    ticker: t.ticker,
    company: t.company,
    action: t.action,
    shares: t.shares,
    price: t.price,
    brk_fees: t.brkFees,
    sst: t.sst,
    notes: t.notes || "",
  }));
  await supabase.from("psx_transactions").upsert(txRows, { onConflict: "id" });

  // 4. Upsert Dividends
  const divRows = raw.dividends.map((d) => ({
    id: d.id,
    payment_date: d.paymentDate || "",
    ticker: d.ticker,
    year: String(d.year || ""),
    term: d.term || "Q1",
    shares_eligible: d.sharesEligible || 0,
    status: d.status || "Paid",
    announcement_date: d.announcementDate || "",
    expected_payment_date: d.expectedPaymentDate || "",
    dps: d.dps || 0,
    wht: d.wht || 0,
    zakat: d.zakat || 0,
    reinvest: d.reinvest || "No",
    reinvest_price: d.reinvestPrice || 0,
  }));
  await supabase.from("psx_dividends").upsert(divRows, { onConflict: "id" });
}

export async function fetchPortfolioFromSupabase(): Promise<PortfolioState> {
  await seedSupabaseIfNeeded();

  const [compRes, txRes, divRes, annRes, setRes] = await Promise.all([
    supabase.from("psx_companies").select("*").order("ticker", { ascending: true }),
    supabase
      .from("psx_transactions")
      .select("*")
      .order("date", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("psx_dividends")
      .select("*")
      .order("payment_date", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("psx_announcements")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase.from("psx_settings").select("*").eq("id", 1).maybeSingle(),
  ]);

  if (compRes.error || !compRes.data || compRes.data.length === 0) {
    return seedData as unknown as PortfolioState;
  }

  const companies: Company[] = compRes.data.map((r) => ({
    ticker: r.ticker,
    name: r.name,
    frequency: r.frequency,
    price: Number(r.price),
    ldcp: Number(r.ldcp),
    change: Number(r.change),
    changePct: Number(r.change_pct),
    sector: r.sector,
    pe: r.pe,
    high52: r.high52,
    dayRange: r.day_range,
    volume: r.volume,
    asOf: r.as_of,
  }));

  const transactions: Transaction[] = (txRes.data || []).map((r) => ({
    id: Number(r.id),
    date: r.date,
    ticker: r.ticker,
    company: r.company,
    action: r.action as "Buy" | "Sell",
    shares: Number(r.shares),
    price: Number(r.price),
    brkFees: Number(r.brk_fees),
    sst: Number(r.sst),
    notes: r.notes || "",
  }));

  const dividends: Dividend[] = (divRes.data || []).map((r) => ({
    id: Number(r.id),
    paymentDate: r.payment_date || "",
    ticker: r.ticker,
    year: r.year || "",
    term: r.term || "Q1",
    sharesEligible: Number(r.shares_eligible),
    status: (r.status as "Paid" | "Unpaid") || "Paid",
    announcementDate: r.announcement_date || "",
    expectedPaymentDate: r.expected_payment_date || "",
    dps: Number(r.dps),
    wht: Number(r.wht),
    zakat: Number(r.zakat),
    reinvest: (r.reinvest as "Yes" | "No") || "No",
    reinvestPrice: Number(r.reinvest_price || 0),
    announcementId: r.announcement_id || undefined,
  }));

  const announcements: PsxAnnouncement[] = (annRes.data || []).map((r) => ({
    id: r.id,
    ticker: r.ticker,
    announcementDate: r.announcement_date,
    title: r.title,
    pdfUrl: r.pdf_url,
    isDividend: Boolean(r.is_dividend),
    parsedDps: r.parsed_dps !== null ? Number(r.parsed_dps) : null,
    parsedTerm: r.parsed_term || "Q1",
    parsedYear: r.parsed_year || "2026",
    notified: Boolean(r.notified),
    addedToDividends: Boolean(r.added_to_dividends),
    createdAt: r.created_at,
  }));

  const settings: PortfolioSettings = setRes.data
    ? {
        defaultBrokerageRate: Number(setRes.data.default_brokerage_rate),
        minBrokeragePerShare: Number(setRes.data.min_brokerage_per_share),
        sstRate: Number(setRes.data.sst_rate),
        defaultFilerWhtRate: Number(setRes.data.default_filer_wht_rate),
        includeLegacyMcbInCashflow: Boolean(
          setRes.data.include_legacy_mcb_in_cashflow
        ),
      }
    : (seedData.settings as PortfolioSettings);

  return {
    version: "3.0.0",
    lastUpdated: new Date().toISOString(),
    currency: "PKR",
    settings,
    companies,
    transactions,
    dividends,
    announcements,
  };
}
