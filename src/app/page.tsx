"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  fetchPortfolioFromSupabase,
  forceReseedSupabase,
} from "@/lib/db-service";
import {
  computeBrokerageAndSst,
  computePortfolioAnalytics,
  LEGACY_MCB_SALE,
} from "@/lib/accounting";
import seedData from "@/data/seed-portfolio.json";
import {
  Dividend,
  PortfolioState,
  PsxAnnouncement,
} from "@/types/portfolio";
import Portfolio3DTowers from "@/components/Portfolio3DTowers";
import {
  MonthlyDividendChart,
  SectorAllocationCard,
  StockLeaderboardChart,
} from "@/components/PortfolioCharts";
import StockDetailModal from "@/components/StockDetailModal";
import {
  Activity,
  Award,
  Bell,
  Building2,
  CheckCircle2,
  Cloud,
  Download,
  ExternalLink,
  Filter,
  Layers,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Sun,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";

type TabId =
  | "dashboard"
  | "holdings"
  | "transactions"
  | "dividends"
  | "companies";

export default function HomePage() {
  const [state, setState] = useState<PortfolioState>(
    seedData as unknown as PortfolioState
  );
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [isLoadingDb, setIsLoadingDb] = useState<boolean>(true);
  const [isSyncingPsx, setIsSyncingPsx] = useState<boolean>(false);
  const [realtimeStatus, setRealtimeStatus] = useState<string>("CONNECTING");
  const [lastSyncMsg, setLastSyncMsg] = useState<string>(
    "Live Supabase Cloud Active"
  );
  const [toastAlert, setToastAlert] = useState<{
    title: string;
    subtitle: string;
  } | null>(null);

  // Filters & Modals
  const [selectedSector, setSelectedSector] = useState<string>("ALL");
  const [holdingSearch, setHoldingSearch] = useState<string>("");
  const [txSearch, setTxSearch] = useState<string>("");
  const [txActionFilter, setTxActionFilter] = useState<string>("ALL");
  const [divStatusFilter, setDivStatusFilter] = useState<string>("ALL");
  const [divSearch, setDivSearch] = useState<string>("");
  const [modalTicker, setModalTicker] = useState<string | null>(null);

  // Mark-Paid Modal State
  const [markPaidModalDiv, setMarkPaidModalDiv] = useState<Dividend | null>(
    null
  );
  const [markPaidDate, setMarkPaidDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );

  // New Transaction Form
  const [txDate, setTxDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [txTicker, setTxTicker] = useState<string>("FFC");
  const [txAction, setTxAction] = useState<"Buy" | "Sell">("Buy");
  const [txShares, setTxShares] = useState<string>("100");
  const [txPrice, setTxPrice] = useState<string>("562.62");
  const [txBrk, setTxBrk] = useState<string>("84.39");
  const [txSst, setTxSst] = useState<string>("12.66");
  const [txNotes, setTxNotes] = useState<string>("");

  // New Dividend Form
  const [divTicker, setDivTicker] = useState<string>("FFC");
  const [divStatus, setDivStatus] = useState<"Paid" | "Unpaid">("Unpaid");
  const [divPayDate, setDivPayDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [divYear, setDivYear] = useState<string>("2026");
  const [divTerm, setDivTerm] = useState<string>("Q1");
  const [divShares, setDivShares] = useState<string>("20");
  const [divDps, setDivDps] = useState<string>("8.50");
  const [divWht, setDivWht] = useState<string>("26");
  const [divZakat, setDivZakat] = useState<string>("0");

  // New Company Form
  const [newCompTicker, setNewCompTicker] = useState<string>("");
  const [newCompName, setNewCompName] = useState<string>("");
  const [newCompFreq, setNewCompFreq] = useState<string>("Quarterly");
  const [isAddingCompany, setIsAddingCompany] = useState<boolean>(false);

  // Load saved theme preference
  useEffect(() => {
    const saved = window.localStorage.getItem("psx_rune_theme") as
      | "dark"
      | "light"
      | null;
    if (saved === "light" || saved === "dark") {
      setTheme(saved);
      document.documentElement.setAttribute("data-theme", saved);
    }
  }, []);

  const handleToggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    window.localStorage.setItem("psx_rune_theme", next);
  };

  // Load from Supabase
  const reloadFromSupabase = useCallback(async () => {
    try {
      const fresh = await fetchPortfolioFromSupabase();
      setState(fresh);
    } catch (err) {
      console.error("Failed loading from Supabase:", err);
    } finally {
      setIsLoadingDb(false);
    }
  }, []);

  // Fast Parallel Server-Side PSX Live Price & Dividend Announcement Sync
  const syncLivePsxQuotes = useCallback(
    async (silent = false) => {
      if (!silent) setIsSyncingPsx(true);
      try {
        const res = await fetch("/api/psx/sync", { method: "POST" });
        const json = await res.json();
        if (json.ok) {
          // Immediately apply returned live company prices in 0ms!
          if (Array.isArray(json.companies) && json.companies.length > 0) {
            setState((prev) => ({
              ...prev,
              companies: json.companies,
              lastUpdated: json.syncedAt || new Date().toISOString(),
            }));
          }
          const newAnns = json.newDividendAnnouncements || [];
          if (newAnns.length > 0) {
            await reloadFromSupabase();
            setToastAlert({
              title: `${newAnns.length} New PSX Dividend Notice${
                newAnns.length > 1 ? "s" : ""
              } Detected!`,
              subtitle: `${newAnns
                .map((a: { ticker: string }) => a.ticker)
                .join(", ")} announced a payout notice on PSX.`,
            });
          }
          const sec = json.durationMs
            ? `${(json.durationMs / 1000).toFixed(1)}s`
            : "instant";
          setLastSyncMsg(
            `Live PSX Synced (${json.updatedCount} tickers in ${sec})`
          );
          if (!silent) {
            setToastAlert({
              title: `Live PSX Prices Updated (${json.updatedCount} Stocks in ${sec})`,
              subtitle:
                "All live quotes and corporate dividend notices are up to date.",
            });
          }
        }
      } catch (e) {
        console.error("PSX sync error:", e);
      } finally {
        setIsSyncingPsx(false);
      }
    },
    [reloadFromSupabase]
  );

  // Initial load + Realtime subscription + 60s Live Price Auto-Refresh
  useEffect(() => {
    reloadFromSupabase().then(() => {
      syncLivePsxQuotes(true);
    });

    const pollInterval = setInterval(() => {
      syncLivePsxQuotes(true);
    }, 60000);

    const channel = supabase
      .channel("psx-realtime-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "psx_companies" },
        () => reloadFromSupabase()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "psx_transactions" },
        () => reloadFromSupabase()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "psx_dividends" },
        () => reloadFromSupabase()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "psx_announcements" },
        () => reloadFromSupabase()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "psx_settings" },
        () => reloadFromSupabase()
      )
      .subscribe((status) => {
        setRealtimeStatus(status);
      });

    return () => {
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [reloadFromSupabase, syncLivePsxQuotes]);

  // Analytics computation
  const analytics = useMemo(() => computePortfolioAnalytics(state), [state]);

  // Auto-recompute brokerage & SST when shares or price changes in Trade form
  useEffect(() => {
    const sh = parseFloat(txShares) || 0;
    const pr = parseFloat(txPrice) || 0;
    const { brkFees, sst } = computeBrokerageAndSst(sh, pr);
    setTxBrk(brkFees.toFixed(2));
    setTxSst(sst.toFixed(2));
  }, [txShares, txPrice]);

  const handleSelectTxTicker = (sym: string) => {
    setTxTicker(sym);
    const comp = state.companies.find((c) => c.ticker === sym);
    if (comp && comp.price > 0) {
      setTxPrice(comp.price.toString());
    }
  };

  const handleSelectDivTicker = (sym: string) => {
    setDivTicker(sym);
    const pos = analytics.positions.find((p) => p.ticker === sym);
    const sh = pos ? pos.shares : 0;
    setDivShares(sh.toString());
    const dpsVal = parseFloat(divDps) || 0;
    setDivWht(Math.round(sh * dpsVal * 0.15).toString());
  };

  useEffect(() => {
    const sh = parseFloat(divShares) || 0;
    const dpsVal = parseFloat(divDps) || 0;
    setDivWht(Math.round(sh * dpsVal * 0.15).toString());
  }, [divShares, divDps]);

  const handleToggleLegacyMcb = async () => {
    const nextVal = !state.settings.includeLegacyMcbInCashflow;
    setState((prev) => ({
      ...prev,
      settings: { ...prev.settings, includeLegacyMcbInCashflow: nextVal },
    }));
    await supabase
      .from("psx_settings")
      .update({
        include_legacy_mcb_in_cashflow: nextVal,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
  };

  // Optimistic + Instant Supabase Insert for Transactions
  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    const shares = parseFloat(txShares) || 0;
    const price = parseFloat(txPrice) || 0;
    const brkFees = parseFloat(txBrk) || 0;
    const sst = parseFloat(txSst) || 0;
    if (!txTicker || shares <= 0 || price <= 0) return;

    const comp = state.companies.find((c) => c.ticker === txTicker);
    const companyName = comp ? comp.name : txTicker;

    const { data, error } = await supabase
      .from("psx_transactions")
      .insert({
        date: txDate,
        ticker: txTicker,
        company: companyName,
        action: txAction,
        shares,
        price,
        brk_fees: brkFees,
        sst,
        notes: txNotes.trim(),
      })
      .select()
      .single();

    if (!error && data) {
      setTxNotes("");
      setState((prev) => ({
        ...prev,
        transactions: [
          ...prev.transactions,
          {
            id: Number(data.id),
            date: data.date,
            ticker: data.ticker,
            company: data.company,
            action: data.action,
            shares: Number(data.shares),
            price: Number(data.price),
            brkFees: Number(data.brk_fees),
            sst: Number(data.sst),
            notes: data.notes || "",
          },
        ],
      }));
      setToastAlert({
        title: `${txAction} Order Logged (${txTicker})`,
        subtitle: `${shares} shares @ Rs. ${price.toFixed(
          2
        )} synced to Supabase across all devices.`,
      });
    }
  };

  // Instant Optimistic + Cloud Delete for Transactions
  const handleDeleteTransaction = async (id: number, ticker: string) => {
    setState((prev) => ({
      ...prev,
      transactions: prev.transactions.filter((t) => t.id !== id),
    }));
    const { error } = await supabase
      .from("psx_transactions")
      .delete()
      .eq("id", id);
    if (!error) {
      setToastAlert({
        title: `Transaction #${id} (${ticker}) Deleted`,
        subtitle: "Removed permanently from Supabase cloud database.",
      });
    } else {
      await reloadFromSupabase();
    }
  };

  // Add Dividend
  const handleAddDividend = async (e: React.FormEvent) => {
    e.preventDefault();
    const sharesEligible = parseFloat(divShares) || 0;
    const dps = parseFloat(divDps) || 0;
    const wht = parseFloat(divWht) || 0;
    const zakat = parseFloat(divZakat) || 0;
    if (!divTicker || sharesEligible <= 0 || dps <= 0) return;

    const { data, error } = await supabase
      .from("psx_dividends")
      .insert({
        payment_date: divStatus === "Paid" ? divPayDate : "",
        ticker: divTicker,
        year: divYear,
        term: divTerm,
        shares_eligible: sharesEligible,
        status: divStatus,
        announcement_date:
          divStatus === "Unpaid" ? new Date().toISOString().slice(0, 10) : "",
        expected_payment_date: divStatus === "Unpaid" ? divPayDate : "",
        dps,
        wht,
        zakat,
        reinvest: "No",
        reinvest_price: 0,
      })
      .select()
      .single();

    if (!error && data) {
      setState((prev) => ({
        ...prev,
        dividends: [
          ...prev.dividends,
          {
            id: Number(data.id),
            paymentDate: data.payment_date || "",
            ticker: data.ticker,
            year: data.year || "",
            term: data.term || "Q1",
            sharesEligible: Number(data.shares_eligible),
            status: data.status,
            announcementDate: data.announcement_date || "",
            expectedPaymentDate: data.expected_payment_date || "",
            dps: Number(data.dps),
            wht: Number(data.wht),
            zakat: Number(data.zakat),
            reinvest: "No",
            reinvestPrice: 0,
          },
        ],
      }));
      setToastAlert({
        title: `Dividend Entry Added (${divTicker})`,
        subtitle: `Status: ${divStatus} • DPS Rs. ${dps.toFixed(2)}`,
      });
    }
  };

  // Mark Unpaid Dividend as Paid with Payment Date
  const handleConfirmMarkPaid = async () => {
    if (!markPaidModalDiv) return;
    const targetId = markPaidModalDiv.id;
    const targetTicker = markPaidModalDiv.ticker;
    setState((prev) => ({
      ...prev,
      dividends: prev.dividends.map((d) =>
        d.id === targetId
          ? { ...d, status: "Paid", paymentDate: markPaidDate }
          : d
      ),
    }));
    setMarkPaidModalDiv(null);

    await supabase
      .from("psx_dividends")
      .update({
        status: "Paid",
        payment_date: markPaidDate,
      })
      .eq("id", targetId);

    setToastAlert({
      title: `${targetTicker} Dividend Marked as PAID!`,
      subtitle: `Credited on ${markPaidDate} and added to realized dividend cashflow.`,
    });
  };

  // Delete Dividend
  const handleDeleteDividend = async (id: number, ticker: string) => {
    setState((prev) => ({
      ...prev,
      dividends: prev.dividends.filter((d) => d.id !== id),
    }));
    await supabase.from("psx_dividends").delete().eq("id", id);
    setToastAlert({
      title: `Dividend Entry (${ticker}) Deleted`,
      subtitle: "Removed from Supabase cloud database.",
    });
  };

  // Queue PSX Announcement into Unpaid Dividends
  const handleQueueAnnouncementToDividend = async (ann: PsxAnnouncement) => {
    const pos = analytics.positions.find((p) => p.ticker === ann.ticker);
    const eligibleShares = pos && pos.shares > 0 ? pos.shares : 100;
    const dps = ann.parsedDps || 1.0;
    const gross = eligibleShares * dps;
    const wht = Math.round(gross * 0.15);

    await supabase.from("psx_dividends").insert({
      payment_date: "",
      ticker: ann.ticker,
      year: ann.parsedYear || "2026",
      term: ann.parsedTerm || "Q1",
      shares_eligible: eligibleShares,
      status: "Unpaid",
      announcement_date: ann.announcementDate,
      expected_payment_date: "",
      dps,
      wht,
      zakat: 0,
      reinvest: "No",
      reinvest_price: 0,
      announcement_id: ann.id,
    });

    await supabase
      .from("psx_announcements")
      .update({ added_to_dividends: true, notified: true })
      .eq("id", ann.id);

    await reloadFromSupabase();
    setToastAlert({
      title: `Queued ${ann.ticker} Announcement to Unpaid Dividends`,
      subtitle: `${eligibleShares} eligible shares • Mark as Paid once credited to your bank.`,
    });
  };

  // Add New PSX Company & Auto-Fetch Live Price from PSX
  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    const sym = newCompTicker.trim().toUpperCase();
    if (!sym) return;
    setIsAddingCompany(true);
    try {
      const res = await fetch(
        `/api/psx/company?ticker=${encodeURIComponent(sym)}`
      );
      const json = await res.json();
      const scraped = json.ok ? json.company : null;

      await supabase.from("psx_companies").upsert({
        ticker: sym,
        name: newCompName.trim() || scraped?.name || sym,
        frequency: newCompFreq,
        price: scraped?.price || 0,
        ldcp: scraped?.ldcp || 0,
        change: scraped?.change || 0,
        change_pct: scraped?.changePct || 0,
        sector: scraped?.sector || "OTHER",
        pe: scraped?.pe || "N/A",
        high52: scraped?.high52 || "N/A",
        day_range: scraped?.dayRange || "N/A",
        volume: scraped?.volume || "0",
        as_of: scraped?.asOf || "Added Now",
        updated_at: new Date().toISOString(),
      });

      setNewCompTicker("");
      setNewCompName("");
      await reloadFromSupabase();
      setToastAlert({
        title: `${sym} Added to PSX Directory`,
        subtitle: scraped
          ? `Fetched live PSX price: Rs. ${scraped.price.toFixed(2)} (${
              scraped.sector
            })`
          : "Company saved to Supabase.",
      });
    } finally {
      setIsAddingCompany(false);
    }
  };

  // Export JSON Backup
  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `psx_portfolio_backup_${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const unpaidDividends = state.dividends.filter((d) => d.status === "Unpaid");
  const selectedModalPosition = useMemo(
    () =>
      modalTicker
        ? analytics.positions.find((p) => p.ticker === modalTicker) || null
        : null,
    [modalTicker, analytics.positions]
  );

  const filteredHoldings = useMemo(() => {
    return analytics.activePositions.filter((p) => {
      if (selectedSector !== "ALL" && p.sector !== selectedSector) return false;
      if (holdingSearch.trim()) {
        const q = holdingSearch.toLowerCase();
        return (
          p.ticker.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          p.sector.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [analytics.activePositions, selectedSector, holdingSearch]);

  const filteredTransactions = useMemo(() => {
    return [...state.transactions]
      .sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return b.id - a.id;
      })
      .filter((t) => {
        if (txActionFilter !== "ALL" && t.action !== txActionFilter)
          return false;
        if (txSearch.trim()) {
          const q = txSearch.toLowerCase();
          return (
            t.ticker.toLowerCase().includes(q) ||
            t.company.toLowerCase().includes(q)
          );
        }
        return true;
      });
  }, [state.transactions, txActionFilter, txSearch]);

  const filteredDividends = useMemo(() => {
    return [...state.dividends]
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === "Unpaid" ? -1 : 1;
        return (b.paymentDate || b.announcementDate).localeCompare(
          a.paymentDate || a.announcementDate
        );
      })
      .filter((d) => {
        if (divStatusFilter !== "ALL" && d.status !== divStatusFilter)
          return false;
        if (divSearch.trim()) {
          const q = divSearch.toLowerCase();
          return (
            d.ticker.toLowerCase().includes(q) ||
            d.term.toLowerCase().includes(q) ||
            d.year.toLowerCase().includes(q)
          );
        }
        return true;
      });
  }, [state.dividends, divStatusFilter, divSearch]);

  const { summary } = analytics;

  return (
    <div className="min-h-screen pb-16">
      {/* Top Sticky Specular Glass Header (Rune UI style) */}
      <header
        className="sticky top-0 z-40 border-b border-white/10 backdrop-blur-xl"
        style={{ backgroundColor: "var(--bg-glass)" }}
      >
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/30 via-indigo-500/20 to-amber-500/30 border border-white/20 flex items-center justify-center shadow-inner">
              <Sparkles className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold tracking-tight">
                  PSX Dividend &amp; Equity Terminal
                </h1>
                <span className="px-2 py-0.5 text-[10px] font-mono-num uppercase tracking-wider rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-semibold">
                  Rune Edition
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-0.5">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      realtimeStatus === "SUBSCRIBED"
                        ? "bg-emerald-500 animate-pulse"
                        : "bg-amber-500"
                    }`}
                  />
                  Supabase Realtime:{" "}
                  <strong className="text-slate-200">
                    {realtimeStatus === "SUBSCRIBED"
                      ? "Instant Multi-Device Sync"
                      : isLoadingDb
                      ? "Syncing..."
                      : "Connected"}
                  </strong>
                </span>
                <span>•</span>
                <span>{lastSyncMsg}</span>
              </div>
            </div>
          </div>

          {/* Right Header Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Unpaid / Announced Dividend Alert Pill */}
            <button
              onClick={() => {
                setActiveTab("dividends");
                setDivStatusFilter("Unpaid");
              }}
              className="rune-pill px-3 py-1.5 text-xs flex items-center gap-1.5 cursor-pointer hover:border-amber-400/50"
            >
              <Bell
                className={`w-3.5 h-3.5 ${
                  unpaidDividends.length > 0
                    ? "text-amber-400 animate-bounce"
                    : "text-slate-400"
                }`}
              />
              <span>
                Pending Payouts:{" "}
                <strong className="font-mono-num text-amber-300">
                  {unpaidDividends.length}
                </strong>
              </span>
            </button>

            {/* Fast Parallel Live PSX Sync Button */}
            <button
              onClick={() => syncLivePsxQuotes(false)}
              disabled={isSyncingPsx}
              className="rune-pill px-3.5 py-1.5 text-xs font-semibold flex items-center gap-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/40 cursor-pointer disabled:opacity-60"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isSyncingPsx ? "animate-spin" : ""}`}
              />
              {isSyncingPsx
                ? "Syncing 27 Tickers..."
                : "Sync Live PSX & Notices"}
            </button>

            {/* Theme Switch */}
            <button
              onClick={handleToggleTheme}
              className="rune-pill px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 text-slate-300 cursor-pointer"
              title="Toggle Dark / Light Specular Theme"
            >
              {theme === "dark" ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-300" />
                  <span>Light</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-indigo-300" />
                  <span>Dark</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Navigation Bar */}
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 flex items-center gap-1.5 overflow-x-auto pb-2.5">
          {[
            {
              id: "dashboard",
              label: "Executive Dashboard & 3D",
              icon: Activity,
            },
            {
              id: "holdings",
              label: `Active Holdings (${summary.activeCount})`,
              icon: Layers,
            },
            {
              id: "transactions",
              label: `Trade Ledger (${state.transactions.length})`,
              icon: Wallet,
            },
            {
              id: "dividends",
              label: `Dividend Vault & PSX Monitor (${state.dividends.length})`,
              icon: Award,
            },
            {
              id: "companies",
              label: `PSX Tickers & Cloud (${state.companies.length})`,
              icon: Building2,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabId)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
                  active
                    ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Toast Notification Banner */}
      {toastAlert && (
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 mt-4">
          <div className="rune-card-rose px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <div className="text-xs font-bold">{toastAlert.title}</div>
                <div className="text-xs text-slate-300">
                  {toastAlert.subtitle}
                </div>
              </div>
            </div>
            <button
              onClick={() => setToastAlert(null)}
              className="text-xs font-semibold text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Content Container */}
      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 mt-5 space-y-5">
        {/* 6-Card Specular Executive KPI Ribbon */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
          {/* Card 1: Market Value */}
          <div className="rune-card p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-medium">Live Market Value</span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px] font-mono-num font-bold">
                LIVE PSX
              </span>
            </div>
            <div className="font-mono-num text-xl font-bold mt-1.5">
              Rs.{" "}
              {summary.totalMarketValue.toLocaleString("en-PK", {
                maximumFractionDigits: 0,
              })}
            </div>
            <div
              className={`text-xs font-mono-num mt-1 flex items-center gap-1 font-medium ${
                summary.totalDayChangeValue >= 0
                  ? "text-emerald-400"
                  : "text-rose-400"
              }`}
            >
              {summary.totalDayChangeValue >= 0 ? (
                <TrendingUp className="w-3.5 h-3.5" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5" />
              )}
              Day: {summary.totalDayChangeValue >= 0 ? "+" : ""}Rs.{" "}
              {Math.round(summary.totalDayChangeValue).toLocaleString()} (
              {summary.totalDayChangePct.toFixed(2)}%)
            </div>
          </div>

          {/* Card 2: Active Cost Basis */}
          <div className="rune-card p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-medium">Active Cost Basis (WAC)</span>
              <span className="font-mono-num text-[11px] font-bold text-indigo-300">
                {summary.activeCount} Active
              </span>
            </div>
            <div className="font-mono-num text-xl font-bold mt-1.5">
              Rs.{" "}
              {summary.totalCostBasis.toLocaleString("en-PK", {
                maximumFractionDigits: 0,
              })}
            </div>
            <div className="text-xs text-slate-400 mt-1 font-mono-num">
              Fees+SST: Rs.{" "}
              {Math.round(
                summary.totalBrokeragePaid + summary.totalSstPaid
              ).toLocaleString()}{" "}
              included
            </div>
          </div>

          {/* Card 3: Unrealized & Realized P&L */}
          <div className="rune-card p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-medium">Unrealized Capital P&amp;L</span>
              <span
                className={`font-mono-num text-xs font-bold ${
                  summary.totalUnrealizedPnlPct >= 0
                    ? "text-emerald-400"
                    : "text-rose-400"
                }`}
              >
                {summary.totalUnrealizedPnlPct >= 0 ? "+" : ""}
                {summary.totalUnrealizedPnlPct.toFixed(2)}%
              </span>
            </div>
            <div
              className={`font-mono-num text-xl font-bold mt-1.5 ${
                summary.totalUnrealizedPnl >= 0
                  ? "text-emerald-400"
                  : "text-rose-400"
              }`}
            >
              {summary.totalUnrealizedPnl >= 0 ? "+" : ""}Rs.{" "}
              {Math.round(summary.totalUnrealizedPnl).toLocaleString()}
            </div>
            <div className="text-xs text-slate-400 mt-1 font-mono-num">
              Realized (ALTN):{" "}
              <span className="text-rose-400 font-semibold">
                Rs. {Math.round(summary.totalRealizedPnl).toLocaleString()}
              </span>
            </div>
          </div>

          {/* Card 4: Net Dividends Paid */}
          <div className="rune-card-rose p-4">
            <div className="flex items-center justify-between text-xs text-amber-300">
              <span className="font-semibold">Net Dividends Paid</span>
              <span className="font-mono-num text-[11px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                YoC {summary.portfolioYieldOnCostPct.toFixed(2)}%
              </span>
            </div>
            <div className="font-mono-num text-xl font-bold text-amber-300 mt-1.5">
              Rs.{" "}
              {summary.totalNetDividendsPaid.toLocaleString("en-PK", {
                maximumFractionDigits: 0,
              })}
            </div>
            <div className="text-xs text-slate-300 mt-1 font-mono-num">
              Gross: Rs.{" "}
              {Math.round(summary.totalGrossDividendsPaid).toLocaleString()} •
              WHT: Rs. {Math.round(summary.totalWhtPaid).toLocaleString()}
            </div>
          </div>

          {/* Card 5: Total All-Inclusive Return */}
          <div className="rune-card p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-medium">All-Inclusive Return</span>
              <span className="text-[11px] font-mono-num text-slate-400">
                Cap + Div + Realized
              </span>
            </div>
            <div
              className={`font-mono-num text-xl font-bold mt-1.5 ${
                summary.totalAllInclusiveReturn >= 0
                  ? "text-emerald-400"
                  : "text-rose-400"
              }`}
            >
              {summary.totalAllInclusiveReturn >= 0 ? "+" : ""}Rs.{" "}
              {Math.round(summary.totalAllInclusiveReturn).toLocaleString()}
            </div>
            <div className="text-xs text-slate-400 mt-1 font-mono-num">
              Net Return on Basis:{" "}
              <strong>{summary.totalAllInclusiveReturnPct.toFixed(2)}%</strong>
            </div>
          </div>

          {/* Card 6: Net Out-of-Pocket Capital + Rune Switch for Legacy MCB */}
          <div className="rune-card p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-medium">Net Out-of-Pocket Cash</span>
              <button
                onClick={handleToggleLegacyMcb}
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer border transition-all ${
                  state.settings.includeLegacyMcbInCashflow
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                    : "bg-white/5 text-slate-400 border-white/10"
                }`}
                title="Toggle Legacy MCB Sale (219 sh @ Rs. 357.60 = Rs. 78,315.33)"
              >
                MCB: {state.settings.includeLegacyMcbInCashflow ? "ON" : "OFF"}
              </button>
            </div>
            <div className="font-mono-num text-xl font-bold mt-1.5">
              Rs. {Math.round(summary.netOutOfPocketCapital).toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-400 mt-1 font-mono-num">
              {state.settings.includeLegacyMcbInCashflow
                ? `Includes Rs. ${LEGACY_MCB_SALE.netProceeds.toLocaleString()} MCB sale`
                : "Excludes legacy MCB sale"}
            </div>
          </div>
        </section>

        {/* TAB 1: EXECUTIVE DASHBOARD */}
        {activeTab === "dashboard" && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-7">
                <MonthlyDividendChart
                  data={analytics.monthlyDividends}
                  totalGross={summary.totalGrossDividendsPaid}
                  totalNet={summary.totalNetDividendsPaid}
                  totalWht={summary.totalWhtPaid}
                  totalZakat={summary.totalZakatPaid}
                />
              </div>
              <div className="lg:col-span-5">
                <SectorAllocationCard
                  sectors={analytics.sectors}
                  selectedSector={selectedSector}
                  onSelectSector={(sec) => {
                    setSelectedSector(sec);
                  }}
                />
              </div>
            </div>

            <Portfolio3DTowers
              positions={analytics.activePositions}
              onSelectTicker={(sym) => setModalTicker(sym)}
            />

            <StockLeaderboardChart
              positions={analytics.activePositions}
              onSelectTicker={(sym) => setModalTicker(sym)}
            />
          </div>
        )}

        {/* TAB 2: ACTIVE HOLDINGS & READ-ONLY LIVE PSX QUOTES */}
        {activeTab === "holdings" && (
          <div className="rune-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <span className="text-[11px] uppercase tracking-widest text-indigo-400 font-semibold">
                  Weighted Average Cost (WAC) Portfolio Engine
                </span>
                <h2 className="text-lg font-bold mt-0.5">
                  Active PSX Equity Holdings ({filteredHoldings.length} of{" "}
                  {analytics.activePositions.length})
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={holdingSearch}
                    onChange={(e) => setHoldingSearch(e.target.value)}
                    placeholder="Search ticker, name, sector..."
                    className="rune-input pl-8 w-56 text-xs"
                  />
                </div>
                <select
                  value={selectedSector}
                  onChange={(e) => setSelectedSector(e.target.value)}
                  className="rune-input text-xs"
                >
                  <option value="ALL">All PSX Sectors</option>
                  {analytics.sectors.map((s) => (
                    <option key={s.sector} value={s.sector}>
                      {s.sector} ({s.count})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400 uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-3">Ticker / Company</th>
                    <th className="py-3 px-3 text-right">Shares</th>
                    <th className="py-3 px-3 text-right">WAC Basis</th>
                    <th className="py-3 px-3 text-right">Total Cost</th>
                    <th className="py-3 px-3 text-right">
                      Live PSX Price (Read-Only)
                    </th>
                    <th className="py-3 px-3 text-right">Market Value</th>
                    <th className="py-3 px-3 text-right">Unrealized P&amp;L</th>
                    <th className="py-3 px-3 text-right">Net Dividends</th>
                    <th className="py-3 px-3 text-right">Total Return</th>
                    <th className="py-3 px-3 text-right">YoC %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono-num">
                  {filteredHoldings.map((pos) => (
                    <tr
                      key={pos.ticker}
                      onClick={() => setModalTicker(pos.ticker)}
                      className="hover:bg-white/[0.04] transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-3 font-sans">
                        <div className="flex items-center gap-2">
                          <span className="font-mono-num font-bold text-indigo-300 text-sm">
                            {pos.ticker}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-400 font-semibold">
                            {pos.weightPct.toFixed(1)}%
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 truncate max-w-[190px]">
                          {pos.name}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-semibold">
                        {pos.shares.toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-200 font-medium">
                        Rs. {pos.wac.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-200 font-medium">
                        Rs. {Math.round(pos.costBasis).toLocaleString()}
                      </td>
                      {/* Read-Only Live Price — Crisp High-Contrast in both Dark & Light Mode */}
                      <td
                        className="py-3 px-3 text-right"
                        title={pos.asOf || "Live PSX Feed"}
                      >
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/35">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          <span className="font-bold text-emerald-300">
                            Rs. {pos.livePrice.toFixed(2)}
                          </span>
                        </div>
                        <div
                          className={`text-[10px] mt-0.5 font-semibold ${
                            pos.dayChange >= 0
                              ? "text-emerald-400"
                              : "text-rose-400"
                          }`}
                        >
                          {pos.dayChange >= 0 ? "+" : ""}
                          {pos.dayChange.toFixed(2)} (
                          {pos.dayChangePct.toFixed(2)}%)
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-bold">
                        Rs. {Math.round(pos.marketValue).toLocaleString()}
                      </td>
                      <td
                        className={`py-3 px-3 text-right font-semibold ${
                          pos.unrealizedPnl >= 0
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }`}
                      >
                        <div>
                          {pos.unrealizedPnl >= 0 ? "+" : ""}Rs.{" "}
                          {Math.round(pos.unrealizedPnl).toLocaleString()}
                        </div>
                        <div className="text-[10px]">
                          ({pos.unrealizedPnlPct >= 0 ? "+" : ""}
                          {pos.unrealizedPnlPct.toFixed(2)}%)
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right text-amber-300 font-semibold">
                        {pos.netDividendsPaid > 0
                          ? `Rs. ${Math.round(
                              pos.netDividendsPaid
                            ).toLocaleString()}`
                          : "—"}
                      </td>
                      <td
                        className={`py-3 px-3 text-right font-bold ${
                          pos.totalReturn >= 0
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }`}
                      >
                        {pos.totalReturn >= 0 ? "+" : ""}Rs.{" "}
                        {Math.round(pos.totalReturn).toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right text-amber-300 font-semibold">
                        {pos.yieldOnCostPct.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {analytics.exitedPositions.length > 0 && (
              <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between text-xs text-slate-400">
                <div>
                  Closed / Exited Positions:{" "}
                  {analytics.exitedPositions.map((ep) => (
                    <button
                      key={ep.ticker}
                      onClick={() => setModalTicker(ep.ticker)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 font-mono-num ml-2 cursor-pointer"
                    >
                      <strong>{ep.ticker}</strong> (0 sh • Realized P&amp;L: Rs.{" "}
                      {Math.round(ep.realizedPnl).toLocaleString()})
                    </button>
                  ))}
                </div>
                <span>Click any row to inspect WAC lots &amp; PSX portal</span>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: TRADE LEDGER (BUY / SELL CRUD WITH INSTANT SUPABASE SYNC) */}
        {activeTab === "transactions" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-4">
              <form
                onSubmit={handleAddTransaction}
                className="rune-card p-5 space-y-3.5 sticky top-28"
              >
                <div>
                  <span className="text-[11px] uppercase tracking-widest text-emerald-400 font-semibold">
                    Supabase Cloud Ledger
                  </span>
                  <h3 className="text-base font-bold mt-0.5">
                    Record PSX Trade (Buy / Sell)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Saves immediately to Supabase Postgres &amp; updates all
                    connected laptops in real time.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">
                      Trade Date
                    </label>
                    <input
                      type="date"
                      value={txDate}
                      onChange={(e) => setTxDate(e.target.value)}
                      className="rune-input w-full font-mono-num text-xs"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">
                      Action
                    </label>
                    <select
                      value={txAction}
                      onChange={(e) =>
                        setTxAction(e.target.value as "Buy" | "Sell")
                      }
                      className="rune-input w-full text-xs font-semibold"
                    >
                      <option value="Buy">Buy (Add Shares)</option>
                      <option value="Sell">Sell (Reduce Shares)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">
                    PSX Company Ticker
                  </label>
                  <select
                    value={txTicker}
                    onChange={(e) => handleSelectTxTicker(e.target.value)}
                    className="rune-input w-full text-xs font-mono-num"
                  >
                    {state.companies.map((c) => (
                      <option key={c.ticker} value={c.ticker}>
                        {c.ticker} — {c.name} (Live: Rs. {c.price.toFixed(2)})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">
                      Shares Quantity
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={txShares}
                      onChange={(e) => setTxShares(e.target.value)}
                      className="rune-input w-full font-mono-num text-xs"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">
                      Execution Price (PKR)
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={txPrice}
                      onChange={(e) => setTxPrice(e.target.value)}
                      className="rune-input w-full font-mono-num text-xs"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">
                      Brokerage Fee (Auto)
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={txBrk}
                      onChange={(e) => setTxBrk(e.target.value)}
                      className="rune-input w-full font-mono-num text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">
                      15% SST Tax (Auto)
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={txSst}
                      onChange={(e) => setTxSst(e.target.value)}
                      className="rune-input w-full font-mono-num text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">
                    Notes (Optional)
                  </label>
                  <input
                    type="text"
                    value={txNotes}
                    onChange={(e) => setTxNotes(e.target.value)}
                    placeholder="e.g. Long-term dividend accumulation"
                    className="rune-input w-full text-xs"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg cursor-pointer transition-all"
                >
                  <Plus className="w-4 h-4" />
                  Save {txAction} Transaction to Cloud
                </button>
              </form>
            </div>

            <div className="lg:col-span-8 rune-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-base font-bold">
                    Complete PSX Transaction Ledger ({filteredTransactions.length}{" "}
                    entries)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Deleting or adding any trade syncs immediately across all
                    devices via Supabase.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={txSearch}
                    onChange={(e) => setTxSearch(e.target.value)}
                    placeholder="Filter ticker..."
                    className="rune-input text-xs w-40"
                  />
                  <select
                    value={txActionFilter}
                    onChange={(e) => setTxActionFilter(e.target.value)}
                    className="rune-input text-xs"
                  >
                    <option value="ALL">All Actions</option>
                    <option value="Buy">Buy Only</option>
                    <option value="Sell">Sell Only</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto max-h-[620px] overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-[#0f1117] z-10">
                    <tr className="border-b border-white/10 text-slate-400 uppercase text-[10px]">
                      <th className="py-2.5 px-2.5">Date</th>
                      <th className="py-2.5 px-2.5">Ticker</th>
                      <th className="py-2.5 px-2.5">Action</th>
                      <th className="py-2.5 px-2.5 text-right">Shares</th>
                      <th className="py-2.5 px-2.5 text-right">Price</th>
                      <th className="py-2.5 px-2.5 text-right">Brk + SST</th>
                      <th className="py-2.5 px-2.5 text-right">Net Amount</th>
                      <th className="py-2.5 px-2.5 text-center">Delete</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono-num">
                    {filteredTransactions.map((t) => {
                      const fees = (t.brkFees || 0) + (t.sst || 0);
                      const total =
                        t.action === "Buy"
                          ? t.shares * t.price + fees
                          : t.shares * t.price - fees;
                      return (
                        <tr key={t.id} className="hover:bg-white/[0.03]">
                          <td className="py-2.5 px-2.5 text-slate-300">
                            {t.date}
                          </td>
                          <td className="py-2.5 px-2.5">
                            <span className="font-bold text-indigo-300">
                              {t.ticker}
                            </span>
                            <div className="text-[10px] font-sans text-slate-400 truncate max-w-[140px]">
                              {t.company}
                            </div>
                          </td>
                          <td className="py-2.5 px-2.5">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                t.action === "Buy"
                                  ? "bg-emerald-500/20 text-emerald-300"
                                  : "bg-rose-500/20 text-rose-300"
                              }`}
                            >
                              {t.action}
                            </span>
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-semibold">
                            {t.shares.toLocaleString()}
                          </td>
                          <td className="py-2.5 px-2.5 text-right">
                            Rs. {t.price.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right text-slate-400">
                            Rs. {fees.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-semibold">
                            Rs.{" "}
                            {total.toLocaleString("en-PK", {
                              maximumFractionDigits: 2,
                            })}
                          </td>
                          <td className="py-2.5 px-2.5 text-center">
                            <button
                              onClick={() =>
                                handleDeleteTransaction(t.id, t.ticker)
                              }
                              className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 cursor-pointer"
                              title="Delete Transaction from Supabase"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: DIVIDEND VAULT & PSX ANNOUNCEMENT MONITOR */}
        {activeTab === "dividends" && (
          <div className="space-y-5">
            <div className="rune-card-rose p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div>
                  <span className="text-[11px] uppercase tracking-widest text-amber-300 font-semibold flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5" /> Automated PSX Corporate
                    Payout Monitor
                  </span>
                  <h3 className="text-base font-bold mt-0.5">
                    PSX Dividend &amp; Book Closure Announcements (
                    {state.announcements.length} Detected)
                  </h3>
                  <p className="text-xs text-slate-300">
                    Scraped directly from{" "}
                    <code className="text-amber-300 font-semibold">
                      dps.psx.com.pk/company/&#123;SYMBOL&#125;
                    </code>{" "}
                    for your held stocks. Queue any announcement to{" "}
                    <strong>Unpaid</strong> and mark it <strong>Paid</strong>{" "}
                    when funds hit your bank!
                  </p>
                </div>
                <button
                  onClick={() => syncLivePsxQuotes(false)}
                  disabled={isSyncingPsx}
                  className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${
                      isSyncingPsx ? "animate-spin" : ""
                    }`}
                  />
                  {isSyncingPsx
                    ? "Scanning PSX Announcements..."
                    : "Scan PSX for New Dividend Notices"}
                </button>
              </div>

              {state.announcements.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[260px] overflow-y-auto pr-1">
                  {state.announcements.map((ann) => (
                    <div
                      key={ann.id}
                      className="p-3 rounded-xl bg-black/35 border border-white/10 flex flex-col justify-between gap-2"
                    >
                      <div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono-num font-bold text-indigo-300 px-2 py-0.5 rounded bg-indigo-500/20">
                            {ann.ticker}
                          </span>
                          <span className="text-[11px] text-slate-400 font-mono-num">
                            {ann.announcementDate}
                          </span>
                        </div>
                        <p className="text-xs text-slate-200 mt-2 line-clamp-2">
                          {ann.title}
                        </p>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-white/10 text-[11px]">
                        {ann.pdfUrl ? (
                          <a
                            href={ann.pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-300 hover:underline inline-flex items-center gap-1 font-medium"
                          >
                            PSX Notice PDF <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-slate-500">PSX Notice</span>
                        )}

                        {ann.addedToDividends ? (
                          <span className="text-emerald-400 font-semibold">
                            ✓ Added to Dividends
                          </span>
                        ) : (
                          <button
                            onClick={() =>
                              handleQueueAnnouncementToDividend(ann)
                            }
                            className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-semibold cursor-pointer"
                          >
                            + Queue as Unpaid Dividend
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-slate-300 py-4 px-4 rounded-xl bg-black/25 border border-white/5">
                  Click{" "}
                  <strong>
                    &ldquo;Scan PSX for New Dividend Notices&rdquo;
                  </strong>{" "}
                  above to scrape live corporate dividend &amp; book-closure
                  notices across all 27 PSX companies.
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-4">
                <form
                  onSubmit={handleAddDividend}
                  className="rune-card p-5 space-y-3.5"
                >
                  <div>
                    <span className="text-[11px] uppercase tracking-widest text-amber-400 font-semibold">
                      Dividend Income Log
                    </span>
                    <h3 className="text-base font-bold mt-0.5">
                      Add Announced or Paid Dividend
                    </h3>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">
                        PSX Ticker
                      </label>
                      <select
                        value={divTicker}
                        onChange={(e) => handleSelectDivTicker(e.target.value)}
                        className="rune-input w-full text-xs font-mono-num"
                      >
                        {state.companies.map((c) => (
                          <option key={c.ticker} value={c.ticker}>
                            {c.ticker} — {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">
                        Payout Status
                      </label>
                      <select
                        value={divStatus}
                        onChange={(e) =>
                          setDivStatus(e.target.value as "Paid" | "Unpaid")
                        }
                        className="rune-input w-full text-xs font-semibold"
                      >
                        <option value="Unpaid">
                          Unpaid (Announced / Book Closure)
                        </option>
                        <option value="Paid">Paid (Credited to Bank)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">
                        Date
                      </label>
                      <input
                        type="date"
                        value={divPayDate}
                        onChange={(e) => setDivPayDate(e.target.value)}
                        className="rune-input w-full font-mono-num text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">
                        Year
                      </label>
                      <input
                        type="text"
                        value={divYear}
                        onChange={(e) => setDivYear(e.target.value)}
                        className="rune-input w-full font-mono-num text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">
                        Term
                      </label>
                      <select
                        value={divTerm}
                        onChange={(e) => setDivTerm(e.target.value)}
                        className="rune-input w-full text-xs font-mono-num"
                      >
                        <option value="Q1">Q1</option>
                        <option value="HYR">HYR</option>
                        <option value="Q3">Q3</option>
                        <option value="YR">YR (Final)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">
                        Eligible Shares
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={divShares}
                        onChange={(e) => setDivShares(e.target.value)}
                        className="rune-input w-full font-mono-num text-xs"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">
                        Dividend / Share (PKR)
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={divDps}
                        onChange={(e) => setDivDps(e.target.value)}
                        className="rune-input w-full font-mono-num text-xs"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">
                        15% WHT Tax (PKR)
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={divWht}
                        onChange={(e) => setDivWht(e.target.value)}
                        className="rune-input w-full font-mono-num text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">
                        Zakat Deducted (PKR)
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={divZakat}
                        onChange={(e) => setDivZakat(e.target.value)}
                        className="rune-input w-full font-mono-num text-xs"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    Save Dividend Record
                  </button>
                </form>
              </div>

              <div className="lg:col-span-8 rune-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-base font-bold">
                      Dividend Payout Ledger ({filteredDividends.length} records)
                    </h3>
                    <p className="text-xs text-slate-400">
                      When an announced dividend is credited to your bank, click{" "}
                      <strong>&ldquo;Mark Paid&rdquo;</strong> to set the
                      payment date.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={divSearch}
                      onChange={(e) => setDivSearch(e.target.value)}
                      placeholder="Filter ticker..."
                      className="rune-input text-xs w-36"
                    />
                    <select
                      value={divStatusFilter}
                      onChange={(e) => setDivStatusFilter(e.target.value)}
                      className="rune-input text-xs"
                    >
                      <option value="ALL">All Statuses</option>
                      <option value="Paid">Paid Only</option>
                      <option value="Unpaid">Unpaid / Announced Only</option>
                    </select>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-[#0f1117] z-10">
                      <tr className="border-b border-white/10 text-slate-400 uppercase text-[10px]">
                        <th className="py-2.5 px-2.5">Status / Action</th>
                        <th className="py-2.5 px-2.5">Payment Date</th>
                        <th className="py-2.5 px-2.5">Ticker &amp; Term</th>
                        <th className="py-2.5 px-2.5 text-right">Shares</th>
                        <th className="py-2.5 px-2.5 text-right">DPS</th>
                        <th className="py-2.5 px-2.5 text-right">Gross</th>
                        <th className="py-2.5 px-2.5 text-right">WHT+Zakat</th>
                        <th className="py-2.5 px-2.5 text-right">Net Cash</th>
                        <th className="py-2.5 px-2.5 text-center">Del</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-mono-num">
                      {filteredDividends.map((d) => {
                        const gross = d.sharesEligible * d.dps;
                        const net = Math.max(0, gross - d.wht - d.zakat);
                        return (
                          <tr key={d.id} className="hover:bg-white/[0.03]">
                            <td className="py-2.5 px-2.5">
                              {d.status === "Paid" ? (
                                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                                  ✓ PAID
                                </span>
                              ) : (
                                <button
                                  onClick={() => {
                                    setMarkPaidModalDiv(d);
                                    setMarkPaidDate(
                                      new Date().toISOString().slice(0, 10)
                                    );
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-emerald-500/30 text-amber-300 hover:text-emerald-200 border border-amber-500/40 text-[10px] font-bold cursor-pointer transition-all"
                                >
                                  UNPAID → Mark Paid
                                </button>
                              )}
                            </td>
                            <td className="py-2.5 px-2.5 text-slate-300">
                              {d.paymentDate ||
                                d.announcementDate ||
                                "Awaiting Credit"}
                            </td>
                            <td className="py-2.5 px-2.5">
                              <span className="font-bold text-indigo-300">
                                {d.ticker}
                              </span>{" "}
                              <span className="text-slate-400 text-[10px]">
                                ({d.term} {d.year})
                              </span>
                            </td>
                            <td className="py-2.5 px-2.5 text-right">
                              {d.sharesEligible.toLocaleString()}
                            </td>
                            <td className="py-2.5 px-2.5 text-right">
                              Rs. {d.dps.toFixed(2)}
                            </td>
                            <td className="py-2.5 px-2.5 text-right text-slate-300">
                              Rs. {Math.round(gross).toLocaleString()}
                            </td>
                            <td className="py-2.5 px-2.5 text-right text-rose-400">
                              Rs. {Math.round(d.wht + d.zakat).toLocaleString()}
                            </td>
                            <td className="py-2.5 px-2.5 text-right font-bold text-emerald-400">
                              Rs. {Math.round(net).toLocaleString()}
                            </td>
                            <td className="py-2.5 px-2.5 text-center">
                              <button
                                onClick={() =>
                                  handleDeleteDividend(d.id, d.ticker)
                                }
                                className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: PSX COMPANY DIRECTORY & CLOUD BACKUP */}
        {activeTab === "companies" && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-4 space-y-4">
                <form
                  onSubmit={handleAddCompany}
                  className="rune-card p-5 space-y-3.5"
                >
                  <div>
                    <span className="text-[11px] uppercase tracking-widest text-cyan-400 font-semibold">
                      Auto-Scrape from PSX
                    </span>
                    <h3 className="text-base font-bold mt-0.5">
                      Add New PSX Company Ticker
                    </h3>
                    <p className="text-xs text-slate-400">
                      Enter any PSX symbol (e.g.{" "}
                      <code className="text-indigo-300 font-semibold">
                        LUCK
                      </code>
                      ,{" "}
                      <code className="text-indigo-300 font-semibold">SYS</code>
                      ,{" "}
                      <code className="text-indigo-300 font-semibold">
                        MARI
                      </code>
                      ) and our server will automatically pull its live price,
                      sector, 52W range, and dividend notices!
                    </p>
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 block mb-1">
                      PSX Ticker Symbol
                    </label>
                    <input
                      type="text"
                      value={newCompTicker}
                      onChange={(e) =>
                        setNewCompTicker(e.target.value.toUpperCase())
                      }
                      placeholder="e.g. LUCK"
                      className="rune-input w-full font-mono-num text-xs uppercase"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 block mb-1">
                      Company Name (Optional — Auto-Detected)
                    </label>
                    <input
                      type="text"
                      value={newCompName}
                      onChange={(e) => setNewCompName(e.target.value)}
                      placeholder="Auto-fetched from dps.psx.com.pk"
                      className="rune-input w-full text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 block mb-1">
                      Dividend Payout Frequency
                    </label>
                    <select
                      value={newCompFreq}
                      onChange={(e) => setNewCompFreq(e.target.value)}
                      className="rune-input w-full text-xs"
                    >
                      <option value="Quarterly">Quarterly</option>
                      <option value="Semi-Annual">Semi-Annual</option>
                      <option value="Annual">Annual</option>
                      <option value="None">None</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={isAddingCompany}
                    className="w-full py-2.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    {isAddingCompany
                      ? "Scraping PSX Portal..."
                      : "Add Ticker & Fetch Live Quote"}
                  </button>
                </form>

                <div className="rune-card p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Cloud className="w-4 h-4 text-emerald-400" />
                    <h4 className="text-sm font-bold">
                      Supabase Cloud &amp; JSON Backup
                    </h4>
                  </div>
                  <p className="text-xs text-slate-400">
                    All changes are stored in your Supabase PostgreSQL database
                    and broadcast via WebSockets to every open browser.
                  </p>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={handleExportJson}
                      className="w-full py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download Full JSON Snapshot
                    </button>
                    <button
                      onClick={async () => {
                        await forceReseedSupabase();
                        await reloadFromSupabase();
                        setToastAlert({
                          title: "Verified Seed Portfolio",
                          subtitle:
                            "All 27 companies, 99 trades, and 34 dividends verified in Supabase.",
                        });
                      }}
                      className="w-full py-2 px-3 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-medium flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Filter className="w-3.5 h-3.5" />
                      Re-Verify Base Excel Seed in Supabase
                    </button>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-8 rune-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <div>
                    <h3 className="text-base font-bold">
                      Monitored PSX Companies ({state.companies.length})
                    </h3>
                    <p className="text-xs text-slate-400">
                      Live prices are fetched directly from{" "}
                      <code>dps.psx.com.pk</code> and are strictly read-only.
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-[620px] overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-[#0f1117] z-10">
                      <tr className="border-b border-white/10 text-slate-400 uppercase text-[10px]">
                        <th className="py-2.5 px-2.5">Ticker / Name</th>
                        <th className="py-2.5 px-2.5">Sector</th>
                        <th className="py-2.5 px-2.5 text-right">
                          Live PSX Price
                        </th>
                        <th className="py-2.5 px-2.5 text-right">Day Change</th>
                        <th className="py-2.5 px-2.5 text-right">52W Range</th>
                        <th className="py-2.5 px-2.5 text-right">Volume</th>
                        <th className="py-2.5 px-2.5 text-right">P/E</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-mono-num">
                      {state.companies.map((c) => (
                        <tr
                          key={c.ticker}
                          onClick={() => setModalTicker(c.ticker)}
                          className="hover:bg-white/[0.03] cursor-pointer"
                        >
                          <td className="py-2.5 px-2.5 font-sans">
                            <div className="font-mono-num font-bold text-indigo-300">
                              {c.ticker}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {c.name}
                            </div>
                          </td>
                          <td className="py-2.5 px-2.5 font-sans text-[11px] text-slate-300">
                            {c.sector}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-bold">
                            Rs. {c.price.toFixed(2)}
                          </td>
                          <td
                            className={`py-2.5 px-2.5 text-right font-semibold ${
                              c.change >= 0
                                ? "text-emerald-400"
                                : "text-rose-400"
                            }`}
                          >
                            {c.change >= 0 ? "+" : ""}
                            {c.change.toFixed(2)} ({c.changePct.toFixed(2)}%)
                          </td>
                          <td className="py-2.5 px-2.5 text-right text-slate-300 text-[11px]">
                            {c.high52}
                          </td>
                          <td className="py-2.5 px-2.5 text-right text-slate-400">
                            {c.volume}
                          </td>
                          <td className="py-2.5 px-2.5 text-right text-slate-300">
                            {c.pe}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Mark Dividend as Paid Modal */}
      {markPaidModalDiv && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setMarkPaidModalDiv(null)}
        >
          <div
            className="rune-card-rose w-full max-w-md p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold">
              Confirm Dividend Payout Received ({markPaidModalDiv.ticker})
            </h3>
            <p className="text-xs text-slate-300">
              Select the date this dividend was credited to your bank account.
              Status will switch from <strong>Unpaid</strong> to{" "}
              <strong>Paid</strong> across all connected devices.
            </p>
            <div className="p-3 rounded-xl bg-black/30 border border-white/10 text-xs font-mono-num space-y-1">
              <div>
                Eligible Shares:{" "}
                <strong>{markPaidModalDiv.sharesEligible}</strong> × DPS{" "}
                <strong>Rs. {markPaidModalDiv.dps.toFixed(2)}</strong>
              </div>
              <div className="text-emerald-400 font-bold">
                Net Cash Credited: Rs.{" "}
                {Math.round(
                  markPaidModalDiv.sharesEligible * markPaidModalDiv.dps -
                    markPaidModalDiv.wht -
                    markPaidModalDiv.zakat
                ).toLocaleString()}
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-300 block mb-1">
                Bank Credit / Payment Date
              </label>
              <input
                type="date"
                value={markPaidDate}
                onChange={(e) => setMarkPaidDate(e.target.value)}
                className="rune-input w-full font-mono-num text-sm"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setMarkPaidModalDiv(null)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmMarkPaid}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer"
              >
                ✓ Mark as Paid
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stock Deep-Dive Modal */}
      <StockDetailModal
        position={selectedModalPosition}
        dividends={state.dividends}
        announcements={state.announcements}
        onClose={() => setModalTicker(null)}
      />
    </div>
  );
}
