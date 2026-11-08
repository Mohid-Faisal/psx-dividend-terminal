"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fetchPortfolioFromSupabase } from "@/lib/db-service";
import {
  computeBrokerageAndSst,
  computePortfolioAnalytics,
  LEGACY_MCB_SALE,
} from "@/lib/accounting";
import seedData from "@/data/seed-portfolio.json";
import {
  Dividend,
  PortfolioState,
  Transaction,
} from "@/types/portfolio";
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
  Calendar,
  CheckCircle2,
  Cloud,
  Download,
  Edit3,
  ExternalLink,
  Filter,
  Layers,
  Moon,
  Plus,
  RefreshCw,
  Repeat,
  Search,
  Sparkles,
  Sun,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";

type TabId =
  | "dashboard"
  | "holdings"
  | "transactions"
  | "dividends"
  | "monthly"
  | "companies";

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatPkr(num: number, decimals = 2): string {
  if (num === undefined || num === null || isNaN(num)) return "0.00";
  return num.toLocaleString("en-PK", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatYmLabel(ym: string): string {
  if (!ym || !ym.includes("-")) return ym || "Pending";
  const [yr, mo] = ym.split("-");
  const mIdx = Math.max(0, Math.min(11, parseInt(mo, 10) - 1));
  return `${MONTH_SHORT[mIdx]} ${yr}`;
}

export default function HomePage() {
  const [state, setState] = useState<PortfolioState>(
    seedData as unknown as PortfolioState
  );
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [theme, setTheme] = useState<"dark" | "light">("light");
  const [isSyncingPsx, setIsSyncingPsx] = useState<boolean>(false);
  const [realtimeStatus, setRealtimeStatus] = useState<string>("CONNECTING");
  const [lastSyncMsg, setLastSyncMsg] = useState<string>(
    "Live Supabase Cloud Active"
  );
  const [toastAlert, setToastAlert] = useState<{
    title: string;
    subtitle: string;
  } | null>(null);

  // Filters & Deep-Dive Modal
  const [selectedSector, setSelectedSector] = useState<string>("ALL");
  const [holdingSearch, setHoldingSearch] = useState<string>("");
  const [txSearch, setTxSearch] = useState<string>("");
  const [txActionFilter, setTxActionFilter] = useState<string>("ALL");
  const [txMonthFilter, setTxMonthFilter] = useState<string>("ALL");
  const [divStatusFilter, setDivStatusFilter] = useState<string>("ALL");
  const [divReinvestFilter, setDivReinvestFilter] = useState<string>("ALL");
  const [divSearch, setDivSearch] = useState<string>("");
  const [modalTicker, setModalTicker] = useState<string | null>(null);

  // Popup Form Modals (Clean 1-Click Modals — No Permanent Sidebars!)
  const [isTxModalOpen, setIsTxModalOpen] = useState<boolean>(false);
  const [editingTxId, setEditingTxId] = useState<number | null>(null);

  const [isDivModalOpen, setIsDivModalOpen] = useState<boolean>(false);
  const [editingDivId, setEditingDivId] = useState<number | null>(null);

  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState<boolean>(false);

  // Mark-Paid Modal State
  const [markPaidModalDiv, setMarkPaidModalDiv] = useState<Dividend | null>(
    null
  );
  const [markPaidDate, setMarkPaidDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );

  // Transaction Form State
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

  // Dividend Form State (Includes Reinvested DRIP Toggle!)
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
  const [divReinvested, setDivReinvested] = useState<"Yes" | "No">("No");

  // New Company Form State
  const [newCompTicker, setNewCompTicker] = useState<string>("");
  const [newCompName, setNewCompName] = useState<string>("");
  const [newCompFreq, setNewCompFreq] = useState<string>("Quarterly");
  const [isAddingCompany, setIsAddingCompany] = useState<boolean>(false);

  // Theme initialization: Default to White (Light) Mode
  useEffect(() => {
    const saved = localStorage.getItem("psx_rune_theme") as
      | "dark"
      | "light"
      | null;
    const initial = saved || "light";
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("psx_rune_theme", next);
    document.documentElement.setAttribute("data-theme", next);
  };

  // Load from Supabase
  const loadFromSupabase = useCallback(async () => {
    try {
      const cloudState = await fetchPortfolioFromSupabase();
      if (cloudState && cloudState.companies.length > 0) {
        setState(cloudState);
      }
    } catch (e) {
      console.error("Supabase load error:", e);
    }
  }, []);

  // Sync Live PSX Prices & Relevant-Only Announcements
  const syncLivePsx = useCallback(
    async (silent = false) => {
      if (!silent) setIsSyncingPsx(true);
      try {
        const res = await fetch("/api/psx/sync");
        const data = await res.json();
        if (data.ok) {
          await loadFromSupabase();
          const count =
            data.quotesUpdated ??
            data.updatedCount ??
            data.companies?.length ??
            27;
          setLastSyncMsg(`PSX Live Quotes Synced (${count} tickers)`);
          if (data.autoQueuedDividends && data.autoQueuedDividends.length > 0) {
            const first = data.autoQueuedDividends[0];
            setToastAlert({
              title: `New PSX Dividend Queued: ${first.ticker} (${first.term} ${first.year})`,
              subtitle: `Rs. ${first.dps.toFixed(2)}/sh on ${first.shares} held shares -> Net Rs. ${formatPkr(
                first.shares * first.dps - first.wht,
                2
              )} added as Unpaid!`,
            });
          } else if (!silent) {
            setToastAlert({
              title: `PSX Live Market Sync Complete`,
              subtitle: `Updated live prices for ${count} tickers. All dividend announcements for your added stocks are up to date.`,
            });
          }
        }
      } catch (e) {
        console.error("PSX live sync failed:", e);
      } finally {
        if (!silent) setIsSyncingPsx(false);
      }
    },
    [loadFromSupabase]
  );

  // Initial load + Supabase Realtime subscription + background PSX sync
  useEffect(() => {
    loadFromSupabase().then(() => {
      syncLivePsx(true);
    });

    const channel = supabase
      .channel("psx_terminal_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "psx_companies" },
        () => loadFromSupabase()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "psx_transactions" },
        () => loadFromSupabase()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "psx_dividends" },
        () => loadFromSupabase()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "psx_announcements" },
        () => loadFromSupabase()
      )
      .subscribe((status) => {
        setRealtimeStatus(status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadFromSupabase, syncLivePsx]);

  // Compute complete portfolio analytics
  const analytics = useMemo(() => computePortfolioAnalytics(state), [state]);
  const summary = analytics.summary;

  const unpaidDividendsCount = useMemo(
    () => state.dividends.filter((d) => d.status === "Unpaid").length,
    [state.dividends]
  );

  // Relevant-Only Announcements Filter:
  // 1. Must be a stock the user currently holds (activeShares > 0)
  // 2. Must have a parsed cash dividend (parsedDps > 0)
  // 3. Must NOT already be recorded as an Unpaid or recent dividend in psx_dividends
  const relevantAnnouncements = useMemo(() => {
    const activeShareMap = new Map<string, number>();
    for (const p of analytics.activePositions) {
      if (p.shares > 0) activeShareMap.set(p.ticker, p.shares);
    }
    return (state.announcements || []).filter((a) => {
      const heldShares = activeShareMap.get(a.ticker) || 0;
      if (heldShares <= 0) return false;
      if (!a.parsedDps || a.parsedDps <= 0) return false;
      const alreadyInDividends = state.dividends.some(
        (d) =>
          d.ticker === a.ticker &&
          (d.status === "Unpaid" ||
            (Math.abs(d.dps - (a.parsedDps || 0)) < 0.05 &&
              String(d.year) ===
                String(a.parsedYear || new Date().getFullYear())))
      );
      return !alreadyInDividends;
    });
  }, [state.announcements, state.dividends, analytics.activePositions]);

  // Open Add / Edit Transaction Modal
  const openNewTxModal = (defaultTicker?: string) => {
    const tkr = defaultTicker || "FFC";
    const comp = state.companies.find((c) => c.ticker === tkr);
    const price = comp?.price || 100;
    const fees = computeBrokerageAndSst(100, price);
    setEditingTxId(null);
    setTxDate(new Date().toISOString().slice(0, 10));
    setTxTicker(tkr);
    setTxAction("Buy");
    setTxShares("100");
    setTxPrice(String(price));
    setTxBrk(String(fees.brkFees));
    setTxSst(String(fees.sst));
    setTxNotes("");
    setIsTxModalOpen(true);
  };

  const openEditTxModal = (tx: Transaction) => {
    setEditingTxId(tx.id);
    setTxDate(tx.date);
    setTxTicker(tx.ticker);
    setTxAction(tx.action);
    setTxShares(String(tx.shares));
    setTxPrice(String(tx.price));
    setTxBrk(String(tx.brkFees));
    setTxSst(String(tx.sst));
    setTxNotes(tx.notes || "");
    setIsTxModalOpen(true);
  };

  // Auto-calculate brokerage & SST when shares or price change
  const handleSharesOrPriceChange = (newShares: string, newPrice: string) => {
    setTxShares(newShares);
    setTxPrice(newPrice);
    const s = parseFloat(newShares) || 0;
    const p = parseFloat(newPrice) || 0;
    const { brkFees, sst } = computeBrokerageAndSst(s, p);
    setTxBrk(brkFees.toFixed(2));
    setTxSst(sst.toFixed(2));
  };

  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    const shares = parseFloat(txShares) || 0;
    const price = parseFloat(txPrice) || 0;
    const brkFees = parseFloat(txBrk) || 0;
    const sst = parseFloat(txSst) || 0;
    if (shares <= 0 || price <= 0) return;

    const maxId = state.transactions.reduce((m, t) => Math.max(m, t.id || 0), 0);
    const id = editingTxId ?? maxId + 1;
    const comp = state.companies.find((c) => c.ticker === txTicker.toUpperCase());

    await supabase.from("psx_transactions").upsert({
      id,
      date: txDate,
      ticker: txTicker.toUpperCase(),
      company: comp?.name || txTicker.toUpperCase(),
      action: txAction,
      shares,
      price,
      brk_fees: brkFees,
      sst,
      notes: txNotes,
    });

    setIsTxModalOpen(false);
    setEditingTxId(null);
    await loadFromSupabase();
    setToastAlert({
      title: editingTxId
        ? `Updated ${txAction} Order (${txTicker})`
        : `Recorded ${txAction} Order (${txTicker})`,
      subtitle: `${shares.toLocaleString()} shares @ Rs. ${price.toFixed(2)} saved to Supabase.`,
    });
  };

  const handleDeleteTransaction = async (id: number) => {
    await supabase.from("psx_transactions").delete().eq("id", id);
    await loadFromSupabase();
  };

  // Open Add / Edit Dividend Modal
  const openNewDivModal = (defaultTicker?: string) => {
    const tkr = defaultTicker || "FFC";
    const pos = analytics.positions.find((p) => p.ticker === tkr);
    const activeSh = pos && pos.shares > 0 ? Math.round(pos.shares) : 100;
    const defaultDps = 5.0;
    const gross = activeSh * defaultDps;
    setEditingDivId(null);
    setDivTicker(tkr);
    setDivStatus("Unpaid");
    setDivPayDate(new Date().toISOString().slice(0, 10));
    setDivYear(String(new Date().getFullYear()));
    setDivTerm("Q1");
    setDivShares(String(activeSh));
    setDivDps(String(defaultDps));
    setDivWht(String(Math.round(gross * 0.15)));
    setDivZakat("0");
    setDivReinvested("No");
    setIsDivModalOpen(true);
  };

  const openEditDivModal = (d: Dividend) => {
    setEditingDivId(d.id);
    setDivTicker(d.ticker);
    setDivStatus(d.status);
    setDivPayDate(d.paymentDate || new Date().toISOString().slice(0, 10));
    setDivYear(String(d.year));
    setDivTerm(d.term);
    setDivShares(String(d.sharesEligible));
    setDivDps(String(d.dps));
    setDivWht(String(d.wht));
    setDivZakat(String(d.zakat || 0));
    setDivReinvested(d.reinvest === "Yes" ? "Yes" : "No");
    setIsDivModalOpen(true);
  };

  const handleDivTickerSelect = (ticker: string) => {
    setDivTicker(ticker);
    const pos = analytics.positions.find((p) => p.ticker === ticker);
    if (pos && pos.shares > 0) {
      const sh = Math.round(pos.shares);
      setDivShares(String(sh));
      const dps = parseFloat(divDps) || 0;
      setDivWht(String(Math.round(sh * dps * 0.15)));
    }
  };

  const handleSaveDividend = async (e: React.FormEvent) => {
    e.preventDefault();
    const sharesEligible = parseFloat(divShares) || 0;
    const dps = parseFloat(divDps) || 0;
    const wht = parseFloat(divWht) || 0;
    const zakat = parseFloat(divZakat) || 0;
    if (sharesEligible <= 0 || dps <= 0) return;

    const maxId = state.dividends.reduce((m, d) => Math.max(m, d.id || 0), 0);
    const id = editingDivId ?? maxId + 1;

    await supabase.from("psx_dividends").upsert({
      id,
      status: divStatus,
      payment_date: divPayDate,
      ticker: divTicker.toUpperCase(),
      year: String(divYear),
      term: divTerm,
      shares_eligible: sharesEligible,
      dps,
      wht,
      zakat,
      reinvest: divReinvested,
      reinvest_price: 0,
    });

    setIsDivModalOpen(false);
    setEditingDivId(null);
    await loadFromSupabase();
    setToastAlert({
      title: editingDivId
        ? `Dividend Updated (${divTicker})`
        : `Dividend Recorded (${divTicker})`,
      subtitle: `Net Rs. ${Math.round(
        sharesEligible * dps - wht - zakat
      ).toLocaleString()} (${divStatus} • Reinvested: ${divReinvested})`,
    });
  };

  // Mark Unpaid Dividend as Paid
  const handleConfirmMarkPaid = async () => {
    if (!markPaidModalDiv) return;

    await supabase
      .from("psx_dividends")
      .update({
        status: "Paid",
        payment_date: markPaidDate,
      })
      .eq("id", markPaidModalDiv.id);

    setMarkPaidModalDiv(null);
    await loadFromSupabase();
    setToastAlert({
      title: `Dividend Marked as Paid (${markPaidModalDiv.ticker})`,
      subtitle: `Payment date set to ${markPaidDate}.`,
    });
  };

  const handleDeleteDividend = async (id: number) => {
    await supabase.from("psx_dividends").delete().eq("id", id);
    await loadFromSupabase();
  };

  // Add New PSX Company
  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    const ticker = newCompTicker.trim().toUpperCase();
    if (!ticker) return;
    setIsAddingCompany(true);
    try {
      await supabase.from("psx_companies").upsert({
        ticker,
        name: newCompName.trim() || `${ticker} Limited`,
        sector: "Pending PSX Sync",
        frequency: newCompFreq,
        price: 0,
      });
      setNewCompTicker("");
      setNewCompName("");
      setIsCompanyModalOpen(false);
      await syncLivePsx(false);
    } finally {
      setIsAddingCompany(false);
    }
  };

  // Toggle MCB Legacy Cash Adjustment
  const includeMcbCash = state.settings?.includeLegacyMcbInCashflow !== false;
  const handleToggleMcb = async () => {
    const nextVal = !includeMcbCash;
    setState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        includeLegacyMcbInCashflow: nextVal,
      },
    }));
    await supabase
      .from("psx_settings")
      .update({ include_legacy_mcb_in_cashflow: nextVal })
      .eq("id", 1);
  };

  // Filtered Lists
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

  const txMonths = useMemo(() => {
    const set = new Set<string>();
    analytics.enrichedTransactions.forEach((t) => {
      if (t.ym) set.add(t.ym);
    });
    return Array.from(set).sort().reverse();
  }, [analytics.enrichedTransactions]);

  const filteredTransactions = useMemo(() => {
    return [...analytics.enrichedTransactions]
      .reverse()
      .filter((t) => {
        if (txActionFilter !== "ALL" && t.action !== txActionFilter)
          return false;
        if (txMonthFilter !== "ALL" && t.ym !== txMonthFilter) return false;
        if (txSearch.trim()) {
          const q = txSearch.toLowerCase();
          return (
            t.ticker.toLowerCase().includes(q) ||
            (t.company || "").toLowerCase().includes(q) ||
            (t.notes || "").toLowerCase().includes(q) ||
            (t.ym || "").toLowerCase().includes(q)
          );
        }
        return true;
      });
  }, [
    analytics.enrichedTransactions,
    txActionFilter,
    txMonthFilter,
    txSearch,
  ]);

  const filteredDividends = useMemo(() => {
    return [...analytics.enrichedDividends]
      .reverse()
      .filter((d) => {
        if (divStatusFilter !== "ALL" && d.status !== divStatusFilter)
          return false;
        if (divReinvestFilter === "YES" && d.reinvest !== "Yes") return false;
        if (divReinvestFilter === "NO" && d.reinvest === "Yes") return false;
        if (divSearch.trim()) {
          const q = divSearch.toLowerCase();
          return (
            d.ticker.toLowerCase().includes(q) ||
            (d.company || "").toLowerCase().includes(q) ||
            (d.term || "").toLowerCase().includes(q) ||
            (d.ym || "").toLowerCase().includes(q)
          );
        }
        return true;
      });
  }, [
    analytics.enrichedDividends,
    divStatusFilter,
    divReinvestFilter,
    divSearch,
  ]);

  // Dividend Payout Calendar by Stock (Jan - Dec)
  const payoutCalendarMatrix = useMemo(() => {
    return analytics.activePositions.map((pos) => {
      const months = Array(12).fill(0);
      for (const d of state.dividends) {
        if (d.ticker !== pos.ticker) continue;
        const dt = new Date(d.paymentDate);
        if (!isNaN(dt.getTime())) {
          const mIdx = dt.getMonth();
          months[mIdx] +=
            d.sharesEligible * d.dps - d.wht - (d.zakat || 0);
        }
      }
      return {
        ticker: pos.ticker,
        name: pos.name,
        frequency: pos.frequency,
        months,
        totalNet: pos.netDividendsPaid,
      };
    });
  }, [analytics.activePositions, state.dividends]);

  const selectedModalPosition = useMemo(
    () => analytics.positions.find((p) => p.ticker === modalTicker) || null,
    [analytics.positions, modalTicker]
  );

  // Export JSON Backup
  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `psx-portfolio-backup-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    a.click();
  };

  return (
    <div className="min-h-screen pb-16">
      {/* Top Toast Notification */}
      {toastAlert && (
        <div className="fixed bottom-5 right-5 z-50 max-w-md rune-card-rose p-4 shadow-2xl border border-amber-400/40 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Bell className="w-5 h-5 text-amber-400 shrink-0 mt-0.5 animate-bounce" />
              <div>
                <h4 className="text-sm font-bold text-amber-300">
                  {toastAlert.title}
                </h4>
                <p className="text-xs text-slate-300 mt-1">
                  {toastAlert.subtitle}
                </p>
              </div>
            </div>
            <button
              onClick={() => setToastAlert(null)}
              className="text-xs text-slate-400 hover:text-white px-2 py-0.5 rounded bg-white/5"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Top Glass Header */}
      <header className="sticky top-0 z-40 rune-header">
        <div className="max-w-[1640px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/25 via-indigo-500/15 to-amber-500/25 border border-emerald-500/30 flex items-center justify-center shadow-sm">
              <Sparkles className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                  PSX Dividend &amp; Equity Terminal
                </h1>
                <span className="text-[10px] font-mono-num uppercase tracking-widest px-2 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-700 dark:text-indigo-300 font-bold">
                  Rune Edition
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      realtimeStatus === "SUBSCRIBED"
                        ? "bg-emerald-500 dark:bg-emerald-400 animate-pulse"
                        : "bg-amber-500"
                    }`}
                  />
                  Supabase Realtime:{" "}
                  <strong className="text-emerald-600 dark:text-emerald-400">
                    {realtimeStatus === "SUBSCRIBED"
                      ? "Instant Multi-Device Sync"
                      : "Connected"}
                  </strong>
                </span>
                <span>•</span>
                <span className="font-medium">{lastSyncMsg}</span>
              </div>
            </div>
          </div>

          {/* Right Controls & 1-Click Popup Entry Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => openNewTxModal()}
              className="rune-pill px-3.5 py-1.5 text-xs font-semibold flex items-center gap-1.5 text-indigo-600 dark:text-indigo-300 border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Buy / Sell
            </button>

            <button
              onClick={() => openNewDivModal()}
              className="rune-pill px-3.5 py-1.5 text-xs font-semibold flex items-center gap-1.5 text-amber-600 dark:text-amber-300 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Dividend
            </button>

            {unpaidDividendsCount > 0 && (
              <button
                onClick={() => {
                  setActiveTab("dividends");
                  setDivStatusFilter("Unpaid");
                }}
                className="rune-pill px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 text-amber-600 dark:text-amber-300 border-amber-500/30 bg-amber-500/10 cursor-pointer"
              >
                <Bell className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                Pending Payouts:{" "}
                <span className="font-mono-num font-bold">
                  {unpaidDividendsCount}
                </span>
              </button>
            )}

            <button
              onClick={() => syncLivePsx(false)}
              disabled={isSyncingPsx}
              className="rune-pill px-3.5 py-1.5 text-xs font-semibold flex items-center gap-1.5 text-emerald-600 dark:text-emerald-300 border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isSyncingPsx ? "animate-spin" : ""}`}
              />
              {isSyncingPsx
                ? "Scraping Live PSX..."
                : "Sync Live PSX & Notices"}
            </button>

            <button
              onClick={toggleTheme}
              className="rune-pill p-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              title="Toggle Light / Dark Mode"
            >
              {theme === "dark" ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-indigo-600" />
              )}
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-[1640px] mx-auto px-4 sm:px-6 pb-2.5 flex items-center gap-2 overflow-x-auto">
          {[
            {
              id: "dashboard",
              label: "Executive Charts & Analytics",
              icon: Activity,
            },
            {
              id: "holdings",
              label: `Active Holdings (${analytics.activePositions.length})`,
              icon: Layers,
            },
            {
              id: "transactions",
              label: `Transactions (${state.transactions.length})`,
              icon: Wallet,
            },
            {
              id: "dividends",
              label: `Dividends & Reinvestment (${state.dividends.length})`,
              icon: Award,
            },
            {
              id: "monthly",
              label: `Monthly Summary & Calendar`,
              icon: Calendar,
            },
            {
              id: "companies",
              label: `PSX Tickers (${state.companies.length})`,
              icon: Building2,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabId)}
                className={`rune-pill px-4 py-1.5 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  active
                    ? "rune-pill-active"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Content Container (Full Screen Width max-w-[1640px]) */}
      <main className="max-w-[1640px] mx-auto px-4 sm:px-6 pt-5 space-y-6">
        {/* 6 Executive KPI Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
          {/* 1. Live Market Value */}
          <div className="rune-card p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Live Market Value</span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-mono-num text-[10px]">
                LIVE PSX
              </span>
            </div>
            <div className="font-mono-num text-xl font-bold mt-1.5">
              Rs. {formatPkr(summary.totalMarketValue, 2)}
            </div>
            <div
              className={`text-xs font-mono-num mt-1 flex items-center gap-1 ${
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
              {formatPkr(summary.totalDayChangeValue, 2)} (
              {summary.totalDayChangePct >= 0 ? "+" : ""}
              {summary.totalDayChangePct.toFixed(2)}%)
            </div>
          </div>

          {/* 2. Active Cost Basis (WAC) */}
          <div className="rune-card p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Active Cost Basis (WAC)</span>
              <span className="font-mono-num text-[11px] text-indigo-400">
                {analytics.activePositions.length} Active
              </span>
            </div>
            <div className="font-mono-num text-xl font-bold mt-1.5">
              Rs. {formatPkr(summary.totalCostBasis, 2)}
            </div>
            <div className="text-xs text-slate-400 mt-1 font-mono-num">
              Fees+SST: Rs.{" "}
              {formatPkr(
                summary.totalBrokeragePaid + summary.totalSstPaid,
                2
              )}{" "}
              included
            </div>
          </div>

          {/* 3. Unrealized Capital P&L */}
          <div className="rune-card p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Unrealized Capital P&amp;L</span>
              <span
                className={`font-mono-num text-xs font-semibold ${
                  summary.totalUnrealizedPnl >= 0
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
              {formatPkr(summary.totalUnrealizedPnl, 2)}
            </div>
            <div className="text-xs text-slate-400 mt-1 font-mono-num">
              Realized (ALTN):{" "}
              <span
                className={
                  summary.totalRealizedPnl >= 0
                    ? "text-emerald-400 font-semibold"
                    : "text-rose-400 font-semibold"
                }
              >
                {summary.totalRealizedPnl >= 0 ? "+" : ""}Rs.{" "}
                {formatPkr(summary.totalRealizedPnl, 2)}
              </span>
            </div>
          </div>

          {/* 4. Net Dividends Paid + DRIP Reinvested */}
          <div className="rune-card-rose p-4">
            <div className="flex items-center justify-between text-xs text-amber-300/90">
              <span>Net Dividends ({state.dividends.length} Entries)</span>
              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono-num text-[10px] font-semibold">
                YoC {summary.portfolioYieldOnCostPct.toFixed(2)}%
              </span>
            </div>
            <div className="font-mono-num text-xl font-bold text-amber-400 mt-1.5">
              Rs. {formatPkr(summary.totalNetDividendsPaid, 2)}
            </div>
            <div className="text-xs text-slate-300 mt-1 font-mono-num flex items-center justify-between">
              <span>
                Reinvested (DRIP):{" "}
                <strong className="text-emerald-400">
                  Rs.{" "}
                  {formatPkr(
                    summary.totalReinvestedDividendsNet,
                    2
                  )}
                </strong>
              </span>
              {unpaidDividendsCount > 0 && (
                <span className="text-amber-300">
                  +{unpaidDividendsCount} Unpaid
                </span>
              )}
            </div>
          </div>

          {/* 5. All-Inclusive Total Return */}
          <div className="rune-card p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>All-Inclusive Return</span>
              <span className="font-mono-num text-[11px] text-emerald-400">
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
              {formatPkr(summary.totalAllInclusiveReturn, 2)}
            </div>
            <div className="text-xs text-slate-400 mt-1 font-mono-num">
              Net Return on Basis:{" "}
              <strong
                className={
                  summary.totalAllInclusiveReturnPct >= 0
                    ? "text-emerald-400"
                    : "text-rose-400"
                }
              >
                {summary.totalAllInclusiveReturnPct >= 0 ? "+" : ""}
                {summary.totalAllInclusiveReturnPct.toFixed(2)}%
              </strong>
            </div>
          </div>

          {/* 6. Out-of-Pocket Cash & MCB Toggle */}
          <div className="rune-card p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Net Out-of-Pocket Cash</span>
              <button
                onClick={handleToggleMcb}
                className={`px-2 py-0.5 rounded text-[10px] font-mono-num font-semibold border cursor-pointer ${
                  includeMcbCash
                    ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                    : "bg-white/5 border-white/10 text-slate-400"
                }`}
                title="Toggle Legacy 225 MCB Shares Sale Credit (Rs. 78,315.33)"
              >
                MCB: {includeMcbCash ? "ON" : "OFF"}
              </button>
            </div>
            <div className="font-mono-num text-xl font-bold mt-1.5">
              Rs. {formatPkr(summary.netOutOfPocketCapital, 2)}
            </div>
            <div className="text-[11px] text-slate-400 mt-1 font-mono-num">
              {includeMcbCash
                ? `Includes Rs. ${formatPkr(LEGACY_MCB_SALE.netProceeds, 2)} MCB sale`
                : "Gross Buy - Sell Cash Flow"}
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* TAB 1: ACTIVE HOLDINGS (FULL WIDTH TABLE)                 */}
        {/* ========================================================= */}
        {activeTab === "holdings" && (
          <div className="space-y-4">
            <div className="rune-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <div>
                  <span className="text-[11px] uppercase tracking-widest text-indigo-400 font-semibold">
                    Weighted Average Cost (WAC) Portfolio Engine
                  </span>
                  <h2 className="text-lg font-bold mt-0.5">
                    Active PSX Equity Holdings ({filteredHoldings.length} of{" "}
                    {analytics.activePositions.length})
                  </h2>
                </div>

                {/* Search, Sector Filter & Action Buttons */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={holdingSearch}
                      onChange={(e) => setHoldingSearch(e.target.value)}
                      placeholder="Search ticker, name, sector..."
                      className="rune-input pl-9 pr-3 py-1.5 text-xs w-56"
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Filter className="w-3.5 h-3.5 text-slate-400" />
                    <select
                      value={selectedSector}
                      onChange={(e) => setSelectedSector(e.target.value)}
                      className="rune-input px-3 py-1.5 text-xs"
                    >
                      <option value="ALL">All PSX Sectors</option>
                      {analytics.sectors.map((s) => (
                        <option key={s.sector} value={s.sector}>
                          {s.sector} ({s.count})
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={() => openNewTxModal()}
                    className="rune-pill px-3.5 py-1.5 text-xs font-semibold flex items-center gap-1.5 text-indigo-300 border-indigo-500/40 bg-indigo-500/15 hover:bg-indigo-500/25 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Buy / Sell
                  </button>

                  <button
                    onClick={() => setIsCompanyModalOpen(true)}
                    className="rune-pill px-3.5 py-1.5 text-xs font-semibold flex items-center gap-1.5 text-emerald-300 border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Company
                  </button>
                </div>
              </div>

              {/* Full-Width Holdings Table with Read-Only Live PSX Price */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-slate-400">
                      <th className="py-3 px-3">Ticker / Company</th>
                      <th className="py-3 px-3 text-right">Shares</th>
                      <th className="py-3 px-3 text-right">WAC Basis</th>
                      <th className="py-3 px-3 text-right">Total Cost</th>
                      <th className="py-3 px-3 text-right">
                        Live PSX Price (Read-Only)
                      </th>
                      <th className="py-3 px-3 text-right">Market Value</th>
                      <th className="py-3 px-3 text-right">Weight %</th>
                      <th className="py-3 px-3 text-right">Unrealized P&amp;L</th>
                      <th className="py-3 px-3 text-right">Net Dividends</th>
                      <th className="py-3 px-3 text-right">Total Return</th>
                      <th className="py-3 px-3 text-right">YoC %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-xs">
                    {filteredHoldings.map((pos) => (
                      <tr
                        key={pos.ticker}
                        onClick={() => setModalTicker(pos.ticker)}
                        className="data-row cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono-num font-bold text-indigo-400 text-sm">
                              {pos.ticker}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-400">
                              {pos.sector}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 truncate max-w-[230px]">
                            {pos.name}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono-num font-semibold">
                          {pos.shares.toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-right font-mono-num text-slate-300">
                          Rs. {formatPkr(pos.wac, 2)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono-num text-slate-300">
                          Rs. {formatPkr(pos.costBasis, 2)}
                        </td>
                        {/* Strictly Read-Only Live Price Badge */}
                        <td className="py-3 px-3 text-right">
                          <div className="inline-flex flex-col items-end">
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 font-mono-num font-bold text-emerald-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              Rs. {formatPkr(pos.livePrice, 2)}
                            </span>
                            <span
                              className={`text-[10px] font-mono-num mt-0.5 ${
                                pos.dayChange >= 0
                                  ? "text-emerald-400"
                                  : "text-rose-400"
                              }`}
                            >
                              {pos.dayChange >= 0 ? "+" : ""}
                              {formatPkr(pos.dayChange, 2)} (
                              {pos.dayChangePct >= 0 ? "+" : ""}
                              {pos.dayChangePct.toFixed(2)}%)
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono-num font-semibold">
                          Rs. {formatPkr(pos.marketValue, 2)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono-num text-slate-300">
                          {pos.weightPct.toFixed(2)}%
                        </td>
                        <td
                          className={`py-3 px-3 text-right font-mono-num font-semibold ${
                            pos.unrealizedPnl >= 0
                              ? "text-emerald-400"
                              : "text-rose-400"
                          }`}
                        >
                          <div>
                            {pos.unrealizedPnl >= 0 ? "+" : ""}Rs.{" "}
                            {formatPkr(pos.unrealizedPnl, 2)}
                          </div>
                          <div className="text-[10px]">
                            ({pos.unrealizedPnlPct >= 0 ? "+" : ""}
                            {pos.unrealizedPnlPct.toFixed(2)}%)
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono-num text-amber-400 font-semibold">
                          Rs.{" "}
                          {formatPkr(pos.netDividendsPaid, 2)}
                        </td>
                        <td
                          className={`py-3 px-3 text-right font-mono-num font-bold ${
                            pos.totalReturn >= 0
                              ? "text-emerald-400"
                              : "text-rose-400"
                          }`}
                        >
                          <div>
                            {pos.totalReturn >= 0 ? "+" : ""}Rs.{" "}
                            {formatPkr(pos.totalReturn, 2)}
                          </div>
                          <div className="text-[10px] font-normal">
                            ({pos.totalReturnPct >= 0 ? "+" : ""}
                            {pos.totalReturnPct.toFixed(2)}%)
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono-num text-amber-300 font-semibold">
                          {pos.yieldOnCostPct.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-white/15 text-xs font-mono-num font-bold bg-white/[0.02]">
                      <td className="py-3.5 px-3">
                        TOTAL ({filteredHoldings.length} ACTIVE HOLDINGS)
                      </td>
                      <td className="py-3.5 px-3 text-right">
                        {filteredHoldings
                          .reduce((s, p) => s + p.shares, 0)
                          .toLocaleString()}
                      </td>
                      <td className="py-3.5 px-3 text-right text-slate-400">
                        —
                      </td>
                      <td className="py-3.5 px-3 text-right">
                        Rs.{" "}
                        {formatPkr(
                          filteredHoldings.reduce(
                            (s, p) => s + p.costBasis,
                            0
                          ),
                          2
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-right text-slate-400">
                        LIVE PSX
                      </td>
                      <td className="py-3.5 px-3 text-right">
                        Rs.{" "}
                        {formatPkr(
                          filteredHoldings.reduce(
                            (s, p) => s + p.marketValue,
                            0
                          ),
                          2
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-right">100.0%</td>
                      <td
                        className={`py-3.5 px-3 text-right ${
                          summary.totalUnrealizedPnl >= 0
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }`}
                      >
                        {summary.totalUnrealizedPnl >= 0 ? "+" : ""}Rs.{" "}
                        {formatPkr(
                          filteredHoldings.reduce(
                            (s, p) => s + p.unrealizedPnl,
                            0
                          ),
                          2
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-right text-amber-400">
                        Rs.{" "}
                        {formatPkr(
                          filteredHoldings.reduce(
                            (s, p) => s + p.netDividendsPaid,
                            0
                          ),
                          2
                        )}
                      </td>
                      <td
                        className={`py-3.5 px-3 text-right ${
                          summary.totalAllInclusiveReturn >= 0
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }`}
                      >
                        {summary.totalAllInclusiveReturn >= 0 ? "+" : ""}Rs.{" "}
                        {formatPkr(
                          filteredHoldings.reduce(
                            (s, p) => s + p.totalReturn,
                            0
                          ),
                          2
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-right text-amber-300">
                        {summary.portfolioYieldOnCostPct.toFixed(2)}%
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Exited / Historical Positions Summary Strip */}
              {analytics.exitedPositions.length > 0 && (
                <div className="mt-5 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                  <div>
                    <strong className="text-slate-300">
                      Closed / Exited Positions (0 Active Shares):
                    </strong>{" "}
                    {analytics.exitedPositions.map((e) => (
                      <button
                        key={e.ticker}
                        onClick={() => setModalTicker(e.ticker)}
                        className="inline-flex items-center gap-1.5 mr-3 px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 cursor-pointer"
                      >
                        <span className="font-mono-num font-bold text-indigo-400">
                          {e.ticker}
                        </span>
                        <span>
                          (Realized: Rs.{" "}
                          {Math.round(e.realizedPnl).toLocaleString()} • Net
                          Div: Rs.{" "}
                          {Math.round(e.netDividendsPaid).toLocaleString()})
                        </span>
                      </button>
                    ))}
                  </div>
                  <span className="text-[11px]">
                    Click any row to open WAC vs. Live PSX Lot Inspector
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: TRANSACTIONS LEDGER (109 ENTRIES, FULL WIDTH!)     */}
        {/* ========================================================= */}
        {activeTab === "transactions" && (
          <div className="rune-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <span className="text-[11px] uppercase tracking-widest text-indigo-400 font-semibold">
                  Complete Audit Trail • Auto Brokerage &amp; SST Calculation
                </span>
                <h2 className="text-lg font-bold mt-0.5">
                  Buy / Sell Transactions Ledger ({filteredTransactions.length}{" "}
                  of {state.transactions.length})
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={txSearch}
                    onChange={(e) => setTxSearch(e.target.value)}
                    placeholder="Search ticker, notes, month..."
                    className="rune-input pl-8 pr-3 py-1.5 text-xs w-52"
                  />
                </div>
                <select
                  value={txActionFilter}
                  onChange={(e) => setTxActionFilter(e.target.value)}
                  className="rune-input px-3 py-1.5 text-xs"
                >
                  <option value="ALL">All Actions (Buy &amp; Sell)</option>
                  <option value="Buy">Buy Orders Only</option>
                  <option value="Sell">Sell Orders Only</option>
                </select>
                <select
                  value={txMonthFilter}
                  onChange={(e) => setTxMonthFilter(e.target.value)}
                  className="rune-input px-3 py-1.5 text-xs"
                >
                  <option value="ALL">All Months</option>
                  {txMonths.map((m) => (
                    <option key={m} value={m}>
                      {formatYmLabel(m)}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => openNewTxModal()}
                  className="rune-pill px-4 py-1.5 text-xs font-semibold flex items-center gap-1.5 text-indigo-300 border-indigo-500/40 bg-indigo-500/15 hover:bg-indigo-500/25 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Buy / Sell Order
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-3">Date</th>
                    <th className="py-3 px-3">Month</th>
                    <th className="py-3 px-3">Ticker / Company</th>
                    <th className="py-3 px-3">Action</th>
                    <th className="py-3 px-3 text-right">Shares</th>
                    <th className="py-3 px-3 text-right">Price</th>
                    <th className="py-3 px-3 text-right">Gross Amount</th>
                    <th className="py-3 px-3 text-right">Brk + SST</th>
                    <th className="py-3 px-3 text-right">Net Cash Flow</th>
                    <th className="py-3 px-3 text-right">Running WAC</th>
                    <th className="py-3 px-3">Notes</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-xs">
                  {filteredTransactions.map((t) => (
                    <tr key={t.id} className="data-row">
                      <td className="py-2.5 px-3 font-mono-num text-slate-300 whitespace-nowrap">
                        {t.date}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                        {formatYmLabel(t.ym)}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-mono-num font-bold text-indigo-400">
                          {t.ticker}
                        </span>
                        <span className="text-[11px] text-slate-400 ml-2">
                          {t.company}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            t.action === "Buy"
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                          }`}
                        >
                          {t.action}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-num font-semibold">
                        {t.shares.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-num">
                        Rs. {t.price.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-num text-slate-300">
                        Rs. {Math.round(t.grossAmount).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-num text-slate-400">
                        Rs. {(t.brkFees + t.sst).toFixed(2)}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-mono-num font-semibold ${
                          t.action === "Buy"
                            ? "text-indigo-300"
                            : "text-emerald-400"
                        }`}
                      >
                        Rs. {Math.round(t.netCashFlow).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-num text-slate-300">
                        Rs. {t.runningWac.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 max-w-[200px] truncate">
                        {t.notes || "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => openEditTxModal(t)}
                          className="text-slate-400 hover:text-indigo-400 p-1 cursor-pointer mr-1"
                          title="Edit Transaction"
                        >
                          <Edit3 className="w-3.5 h-3.5 inline" />
                        </button>
                        <button
                          onClick={() => handleDeleteTransaction(t.id)}
                          className="text-slate-400 hover:text-rose-400 p-1 cursor-pointer"
                          title="Delete Transaction"
                        >
                          <Trash2 className="w-3.5 h-3.5 inline" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-white/15 text-xs font-mono-num font-bold bg-white/[0.02]">
                    <td colSpan={4} className="py-3.5 px-3">
                      TOTAL ({filteredTransactions.length} TRANSACTIONS)
                    </td>
                    <td className="py-3.5 px-3 text-right">
                      {filteredTransactions
                        .reduce((s, t) => s + t.shares, 0)
                        .toLocaleString()}
                    </td>
                    <td className="py-3.5 px-3 text-right text-slate-400">—</td>
                    <td className="py-3.5 px-3 text-right">
                      Rs.{" "}
                      {Math.round(
                        filteredTransactions.reduce(
                          (s, t) => s + t.grossAmount,
                          0
                        )
                      ).toLocaleString()}
                    </td>
                    <td className="py-3.5 px-3 text-right text-slate-300">
                      Rs.{" "}
                      {Math.round(
                        filteredTransactions.reduce(
                          (s, t) => s + t.brkFees + t.sst,
                          0
                        )
                      ).toLocaleString()}
                    </td>
                    <td className="py-3.5 px-3 text-right text-indigo-300">
                      Rs.{" "}
                      {Math.round(
                        filteredTransactions.reduce(
                          (s, t) => s + t.netCashFlow,
                          0
                        )
                      ).toLocaleString()}
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: DIVIDEND VAULT & DRIP REINVESTMENT (47 ENTRIES)    */}
        {/* ========================================================= */}
        {activeTab === "dividends" && (
          <div className="space-y-6">
            {/* Relevant-Only PSX Dividend Announcements Banner */}
            {relevantAnnouncements.length > 0 && (
              <div className="rune-card-rose p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div>
                    <span className="text-[11px] uppercase tracking-widest text-amber-400 font-semibold">
                      Relevant PSX Cash Dividend Announcements (Held Stocks
                      Only)
                    </span>
                    <h3 className="text-base font-bold mt-0.5">
                      New Actionable Dividend Notices (
                      {relevantAnnouncements.length})
                    </h3>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {relevantAnnouncements.map((a) => (
                    <div
                      key={a.id}
                      className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex flex-col justify-between text-xs"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono-num font-bold text-indigo-400">
                            {a.ticker}
                          </span>
                          <span className="font-mono-num text-[11px] text-slate-400">
                            {a.announcementDate}
                          </span>
                        </div>
                        <p className="text-slate-200 mt-1.5 font-medium">
                          {a.title}
                        </p>
                      </div>
                      <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/5">
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono-num text-[10px]">
                          Parsed DPS: Rs. {a.parsedDps?.toFixed(2)} (
                          {a.parsedTerm})
                        </span>
                        {a.pdfUrl && (
                          <a
                            href={a.pdfUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-indigo-400 hover:underline text-[11px]"
                          >
                            PDF <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Full-Width Dividend Vault & Reinvestment (DRIP) Table */}
            <div className="rune-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <span className="text-[11px] uppercase tracking-widest text-amber-400 font-semibold">
                    Dividend Ledger • Paid vs. Unpaid Workflow • DRIP
                    Reinvestment Tracking
                  </span>
                  <h2 className="text-lg font-bold mt-0.5">
                    Dividend Entries &amp; Reinvestment Vault (
                    {filteredDividends.length} of {state.dividends.length})
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={divSearch}
                      onChange={(e) => setDivSearch(e.target.value)}
                      placeholder="Search ticker, term, month..."
                      className="rune-input pl-8 pr-3 py-1.5 text-xs w-48"
                    />
                  </div>
                  <select
                    value={divStatusFilter}
                    onChange={(e) => setDivStatusFilter(e.target.value)}
                    className="rune-input px-3 py-1.5 text-xs"
                  >
                    <option value="ALL">
                      All Status ({state.dividends.length})
                    </option>
                    <option value="Paid">
                      Paid Only (
                      {
                        state.dividends.filter((d) => d.status === "Paid")
                          .length
                      }
                      )
                    </option>
                    <option value="Unpaid">
                      Unpaid / Pending ({unpaidDividendsCount})
                    </option>
                  </select>
                  <select
                    value={divReinvestFilter}
                    onChange={(e) => setDivReinvestFilter(e.target.value)}
                    className="rune-input px-3 py-1.5 text-xs"
                  >
                    <option value="ALL">All Reinvestment (DRIP &amp; Cash)</option>
                    <option value="YES">
                      Reinvested (DRIP: Rs.{" "}
                      {Math.round(
                        summary.totalReinvestedDividendsNet
                      ).toLocaleString()}
                      )
                    </option>
                    <option value="NO">Cash Retained Only</option>
                  </select>
                  <button
                    onClick={() => openNewDivModal()}
                    className="rune-pill px-4 py-1.5 text-xs font-semibold flex items-center gap-1.5 text-amber-300 border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Dividend
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-slate-400">
                      <th className="py-3 px-2.5">Status / Action</th>
                      <th className="py-3 px-2.5">Payment Date</th>
                      <th className="py-3 px-2.5">Ticker / Company</th>
                      <th className="py-3 px-2.5">Year &amp; Term</th>
                      <th className="py-3 px-2.5 text-right">
                        Eligible Shares
                      </th>
                      <th className="py-3 px-2.5 text-right">DPS</th>
                      <th className="py-3 px-2.5 text-right">Gross</th>
                      <th className="py-3 px-2.5 text-right">WHT + Zakat</th>
                      <th className="py-3 px-2.5 text-right">Net Cash</th>
                      <th className="py-3 px-2.5 text-center">Reinvest?</th>
                      <th className="py-3 px-2.5">
                        Reinvestment Details (DRIP Match)
                      </th>
                      <th className="py-3 px-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-xs">
                    {filteredDividends.map((d) => (
                      <tr key={d.id} className="data-row">
                        <td className="py-2.5 px-2.5 whitespace-nowrap">
                          {d.status === "Paid" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[11px] font-semibold">
                              <CheckCircle2 className="w-3 h-3" /> Paid
                            </span>
                          ) : (
                            <button
                              onClick={() => {
                                setMarkPaidModalDiv(d);
                                setMarkPaidDate(
                                  d.paymentDate ||
                                    new Date().toISOString().slice(0, 10)
                                );
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-amber-300 text-[11px] font-bold cursor-pointer transition"
                              title="Click when dividend is credited to bank to mark Paid and set date"
                            >
                              <Sparkles className="w-3 h-3" />
                              Unpaid → Mark Paid
                            </button>
                          )}
                        </td>
                        <td className="py-2.5 px-2.5 font-mono-num text-slate-300 whitespace-nowrap">
                          <div>{d.paymentDate || "Pending"}</div>
                          <div className="text-[10px] text-slate-400">
                            {formatYmLabel(d.ym)}
                          </div>
                        </td>
                        <td className="py-2.5 px-2.5">
                          <span className="font-mono-num font-bold text-indigo-400">
                            {d.ticker}
                          </span>
                          <div className="text-[11px] text-slate-400 truncate max-w-[160px]">
                            {d.company}
                          </div>
                        </td>
                        <td className="py-2.5 px-2.5 font-mono-num text-slate-300 whitespace-nowrap">
                          {d.year} •{" "}
                          <span className="px-1.5 py-0.5 rounded bg-white/5 text-amber-300">
                            {d.term}
                          </span>
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono-num">
                          {d.sharesEligible.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono-num text-emerald-300 font-semibold">
                          Rs. {d.dps.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono-num text-slate-300">
                          Rs. {Math.round(d.grossDividend).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono-num text-rose-400">
                          -Rs. {Math.round(d.wht + d.zakat).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono-num font-bold text-amber-400">
                          Rs. {Math.round(d.netDividend).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-2.5 text-center">
                          {d.reinvest === "Yes" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-400/40 text-indigo-300 text-[10px] font-bold">
                              <Repeat className="w-2.5 h-2.5" /> YES (DRIP)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-white/5 text-slate-400 text-[10px]">
                              No
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-2.5 text-xs">
                          {d.reinvest === "Yes" ? (
                            d.matchedDripTx ? (
                              <span className="font-mono-num text-emerald-300">
                                Bought{" "}
                                <strong>{d.matchedDripTx.shares} sh</strong> @
                                Rs.{d.matchedDripTx.price.toFixed(2)} (
                                {d.matchedDripTx.date})
                              </span>
                            ) : (
                              <span className="text-indigo-300">
                                Reinvested into Portfolio Pool
                              </span>
                            )
                          ) : (
                            <span className="text-slate-400">
                              Cash Retained
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                          <button
                            onClick={() => openEditDivModal(d)}
                            className="text-slate-400 hover:text-indigo-400 p-1 cursor-pointer mr-1"
                            title="Edit Dividend"
                          >
                            <Edit3 className="w-3.5 h-3.5 inline" />
                          </button>
                          <button
                            onClick={() => handleDeleteDividend(d.id)}
                            className="text-slate-400 hover:text-rose-400 p-1 cursor-pointer"
                            title="Delete Dividend"
                          >
                            <Trash2 className="w-3.5 h-3.5 inline" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-white/15 text-xs font-mono-num font-bold bg-white/[0.02]">
                      <td colSpan={6} className="py-3.5 px-2.5">
                        TOTAL ({filteredDividends.length} DIVIDEND ENTRIES)
                      </td>
                      <td className="py-3.5 px-2.5 text-right">
                        Rs.{" "}
                        {Math.round(
                          filteredDividends.reduce(
                            (s, d) => s + d.grossDividend,
                            0
                          )
                        ).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-2.5 text-right text-rose-400">
                        -Rs.{" "}
                        {Math.round(
                          filteredDividends.reduce(
                            (s, d) => s + d.wht + d.zakat,
                            0
                          )
                        ).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-2.5 text-right text-amber-400">
                        Rs.{" "}
                        {Math.round(
                          filteredDividends.reduce(
                            (s, d) => s + d.netDividend,
                            0
                          )
                        ).toLocaleString()}
                      </td>
                      <td colSpan={3} className="py-3.5 px-2.5 text-emerald-400">
                        Reinvested (DRIP): Rs.{" "}
                        {Math.round(
                          filteredDividends
                            .filter((d) => d.reinvest === "Yes")
                            .reduce((s, d) => s + d.netDividend, 0)
                        ).toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 4: MONTHLY SUMMARY & DIVIDEND PAYOUT CALENDAR         */}
        {/* ========================================================= */}
        {activeTab === "monthly" && (
          <div className="space-y-6">
            {/* Monthly Investment, Dividend & Reinvestment Summary */}
            <div className="rune-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <span className="text-[11px] uppercase tracking-widest text-emerald-400 font-semibold">
                    Monthly Cash Flow &amp; Reinvestment Ledger
                  </span>
                  <h2 className="text-lg font-bold mt-0.5">
                    Monthly Investment, Dividend &amp; DRIP Reinvestment Summary
                  </h2>
                </div>
                <button
                  onClick={handleToggleMcb}
                  className={`rune-pill px-3.5 py-1.5 text-xs font-semibold cursor-pointer ${
                    includeMcbCash
                      ? "text-emerald-300 border-emerald-500/40 bg-emerald-500/15"
                      : "text-slate-400"
                  }`}
                >
                  Include MCB Legacy Sale (Rs. 78,315.33):{" "}
                  {includeMcbCash ? "ON" : "OFF"}
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-slate-400">
                      <th className="py-3 px-3">Month</th>
                      <th className="py-3 px-3 text-right">
                        Gross Capital Bought
                      </th>
                      <th className="py-3 px-3 text-right">
                        Capital Sold / MCB
                      </th>
                      <th className="py-3 px-3 text-right">
                        Net Capital Deployed
                      </th>
                      <th className="py-3 px-3 text-right">
                        Net Dividends Received
                      </th>
                      <th className="py-3 px-3 text-right">
                        Dividends Reinvested (DRIP)
                      </th>
                      <th className="py-3 px-3 text-right">
                        Out-of-Pocket Cash
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-xs font-mono-num">
                    {analytics.monthlySummary.map((m) => {
                      const sold = includeMcbCash
                        ? m.sellInflow
                        : m.sellInflowExLegacy;
                      const netDeployed = m.buyOutflow - sold;
                      const outOfPocket = netDeployed - m.reinvValue;
                      return (
                        <tr key={m.ym} className="data-row">
                          <td className="py-2.5 px-3 font-sans font-semibold text-slate-200">
                            {formatYmLabel(m.ym)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-300">
                            Rs. {Math.round(m.buyOutflow).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 text-right text-emerald-400">
                            {sold > 0
                              ? `Rs. ${Math.round(sold).toLocaleString()}`
                              : "—"}
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold text-indigo-300">
                            Rs. {Math.round(netDeployed).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold text-amber-400">
                            {m.netDiv > 0
                              ? `Rs. ${Math.round(m.netDiv).toLocaleString()}`
                              : "—"}
                          </td>
                          <td className="py-2.5 px-3 text-right text-emerald-300">
                            {m.reinvValue > 0
                              ? `Rs. ${Math.round(
                                  m.reinvValue
                                ).toLocaleString()}`
                              : "—"}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold">
                            Rs. {Math.round(outOfPocket).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Dividend Payout Calendar Matrix (Jan - Dec) */}
            <div className="rune-card p-5">
              <div className="mb-4">
                <span className="text-[11px] uppercase tracking-widest text-amber-400 font-semibold">
                  12-Month Dividend Heatmap by Holding
                </span>
                <h2 className="text-lg font-bold mt-0.5">
                  Annual Dividend Payout Calendar (Jan – Dec)
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-slate-400">
                      <th className="py-2.5 px-2.5">Ticker</th>
                      <th className="py-2.5 px-2.5">Cadence</th>
                      {MONTH_SHORT.map((m) => (
                        <th key={m} className="py-2.5 px-2 text-right">
                          {m}
                        </th>
                      ))}
                      <th className="py-2.5 px-2.5 text-right">Total Net</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono-num">
                    {payoutCalendarMatrix.map((row) => (
                      <tr key={row.ticker} className="data-row">
                        <td className="py-2 px-2.5 font-bold text-indigo-400">
                          {row.ticker}
                        </td>
                        <td className="py-2 px-2.5 font-sans text-[11px] text-slate-400">
                          {row.frequency}
                        </td>
                        {row.months.map((val, idx) => (
                          <td
                            key={idx}
                            className={`py-2 px-2 text-right ${
                              val > 0
                                ? "text-emerald-300 font-semibold bg-emerald-500/10"
                                : "text-slate-600"
                            }`}
                          >
                            {val > 0 ? Math.round(val).toLocaleString() : "·"}
                          </td>
                        ))}
                        <td className="py-2 px-2.5 text-right font-bold text-amber-400">
                          Rs. {Math.round(row.totalNet).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 1: EXECUTIVE CHARTS & ANALYTICS                       */}
        {/* ========================================================= */}
        {activeTab === "dashboard" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
              <div className="lg:col-span-7 flex flex-col h-full">
                <MonthlyDividendChart
                  data={analytics.monthlyDividends}
                  totalGross={summary.totalGrossDividendsPaid}
                  totalNet={summary.totalNetDividendsPaid}
                  totalWht={summary.totalWhtPaid}
                  totalZakat={summary.totalZakatPaid}
                />
              </div>
              <div className="lg:col-span-5 flex flex-col h-full">
                <SectorAllocationCard
                  sectors={analytics.sectors}
                  selectedSector={selectedSector}
                  onSelectSector={(sec) => {
                    setSelectedSector(sec);
                    if (sec !== "ALL") setActiveTab("holdings");
                  }}
                />
              </div>
            </div>

            <StockLeaderboardChart
              positions={analytics.activePositions}
              onSelectTicker={(ticker: string) => setModalTicker(ticker)}
            />
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 6: PSX TICKERS & CLOUD DIRECTORY (FULL WIDTH)         */}
        {/* ========================================================= */}
        {activeTab === "companies" && (
          <div className="rune-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <span className="text-[11px] uppercase tracking-widest text-emerald-400 font-semibold">
                  PSX Data Portal Scraper Directory • Cloud Backup
                </span>
                <h2 className="text-lg font-bold mt-0.5">
                  Monitored PSX Companies ({state.companies.length})
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setIsCompanyModalOpen(true)}
                  className="rune-pill px-3.5 py-1.5 text-xs font-semibold flex items-center gap-1.5 text-emerald-300 border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add New PSX Ticker
                </button>
                <button
                  onClick={handleExportJson}
                  className="rune-pill px-3.5 py-1.5 text-xs font-semibold flex items-center gap-1.5 text-indigo-300 border-indigo-500/40 bg-indigo-500/10 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download JSON Backup
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-3">Ticker</th>
                    <th className="py-3 px-3">Company Name</th>
                    <th className="py-3 px-3">Sector</th>
                    <th className="py-3 px-3">Payout Cadence</th>
                    <th className="py-3 px-3 text-right">Live PSX Price</th>
                    <th className="py-3 px-3 text-right">Day Change</th>
                    <th className="py-3 px-3 text-right">52-Week Range</th>
                    <th className="py-3 px-3 text-right">Active Shares</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-xs">
                  {analytics.positions.map((p) => (
                    <tr
                      key={p.ticker}
                      onClick={() => setModalTicker(p.ticker)}
                      className="data-row cursor-pointer"
                    >
                      <td className="py-2.5 px-3 font-mono-num font-bold text-indigo-400">
                        {p.ticker}
                      </td>
                      <td className="py-2.5 px-3 font-medium">{p.name}</td>
                      <td className="py-2.5 px-3 text-slate-400">{p.sector}</td>
                      <td className="py-2.5 px-3 text-slate-300">
                        {p.frequency}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-num font-bold text-emerald-300">
                        Rs. {p.livePrice.toFixed(2)}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-mono-num ${
                          p.dayChange >= 0
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }`}
                      >
                        {p.dayChange >= 0 ? "+" : ""}
                        {p.dayChange.toFixed(2)} (
                        {p.dayChangePct >= 0 ? "+" : ""}
                        {p.dayChangePct.toFixed(2)}%)
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-num text-slate-400">
                        {p.high52 || "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-num font-semibold">
                        {p.shares.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* ========================================================= */}
      {/* POPUP MODAL 1: ADD / EDIT BUY OR SELL TRANSACTION         */}
      {/* ========================================================= */}
      {isTxModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setIsTxModalOpen(false)}
        >
          <div
            className="rune-card w-full max-w-lg p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <div>
                <span className="text-[11px] uppercase tracking-widest text-indigo-400 font-semibold">
                  PSX Trade Execution
                </span>
                <h3 className="text-base font-bold mt-0.5">
                  {editingTxId
                    ? "Edit Buy / Sell Transaction"
                    : "Record New Buy / Sell Order"}
                </h3>
              </div>
              <button
                onClick={() => setIsTxModalOpen(false)}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTransaction} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Trade Date</label>
                  <input
                    type="date"
                    value={txDate}
                    onChange={(e) => setTxDate(e.target.value)}
                    className="rune-input w-full px-3 py-2"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Action</label>
                  <select
                    value={txAction}
                    onChange={(e) =>
                      setTxAction(e.target.value as "Buy" | "Sell")
                    }
                    className="rune-input w-full px-3 py-2 font-semibold"
                  >
                    <option value="Buy">Buy (Accumulate)</option>
                    <option value="Sell">Sell (Reduce / Exit)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">PSX Ticker</label>
                <select
                  value={txTicker}
                  onChange={(e) => {
                    const t = e.target.value;
                    setTxTicker(t);
                    const c = state.companies.find((x) => x.ticker === t);
                    if (c && c.price > 0) {
                      handleSharesOrPriceChange(txShares, String(c.price));
                    }
                  }}
                  className="rune-input w-full px-3 py-2 font-mono-num"
                >
                  {state.companies.map((c) => (
                    <option key={c.ticker} value={c.ticker}>
                      {c.ticker} — {c.name} (Live: Rs. {c.price.toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Shares</label>
                  <input
                    type="number"
                    step="any"
                    value={txShares}
                    onChange={(e) =>
                      handleSharesOrPriceChange(e.target.value, txPrice)
                    }
                    className="rune-input w-full px-3 py-2 font-mono-num"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">
                    Execution Price (PKR)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={txPrice}
                    onChange={(e) =>
                      handleSharesOrPriceChange(txShares, e.target.value)
                    }
                    className="rune-input w-full px-3 py-2 font-mono-num"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">
                    Brokerage Fee (Auto)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={txBrk}
                    onChange={(e) => setTxBrk(e.target.value)}
                    className="rune-input w-full px-3 py-2 font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">
                    SST 15% (Auto)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={txSst}
                    onChange={(e) => setTxSst(e.target.value)}
                    className="rune-input w-full px-3 py-2 font-mono-num"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">
                  Notes (Optional, e.g., DRIP Reinvestment)
                </label>
                <input
                  type="text"
                  value={txNotes}
                  onChange={(e) => setTxNotes(e.target.value)}
                  placeholder="e.g. Dividend Reinvested / Core Buy"
                  className="rune-input w-full px-3 py-2"
                />
              </div>

              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between font-mono-num">
                <span className="text-slate-400">Net Settlement Impact:</span>
                <strong className="text-sm text-emerald-400">
                  Rs.{" "}
                  {Math.round(
                    (parseFloat(txShares) || 0) * (parseFloat(txPrice) || 0) +
                      (txAction === "Buy" ? 1 : -1) *
                        ((parseFloat(txBrk) || 0) + (parseFloat(txSst) || 0))
                  ).toLocaleString()}
                </strong>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsTxModalOpen(false)}
                  className="rune-pill px-4 py-2 text-xs text-slate-400 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Plus className="w-4 h-4" />
                  {editingTxId ? "Save Changes" : `Save ${txAction} Order`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* POPUP MODAL 2: ADD / EDIT DIVIDEND (+ DRIP REINVESTMENT)  */}
      {/* ========================================================= */}
      {isDivModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setIsDivModalOpen(false)}
        >
          <div
            className="rune-card-rose w-full max-w-lg p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <div>
                <span className="text-[11px] uppercase tracking-widest text-amber-400 font-semibold">
                  Dividend Payout &amp; DRIP Reinvestment
                </span>
                <h3 className="text-base font-bold mt-0.5">
                  {editingDivId
                    ? "Edit Dividend Entry"
                    : "Record New Dividend Payout"}
                </h3>
              </div>
              <button
                onClick={() => setIsDivModalOpen(false)}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveDividend} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">PSX Ticker</label>
                  <select
                    value={divTicker}
                    onChange={(e) => handleDivTickerSelect(e.target.value)}
                    className="rune-input w-full px-3 py-2 font-mono-num"
                  >
                    {state.companies.map((c) => (
                      <option key={c.ticker} value={c.ticker}>
                        {c.ticker} — {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">
                    Payout Status
                  </label>
                  <select
                    value={divStatus}
                    onChange={(e) =>
                      setDivStatus(e.target.value as "Paid" | "Unpaid")
                    }
                    className="rune-input w-full px-3 py-2 font-semibold"
                  >
                    <option value="Unpaid">Unpaid (Announced / Pending)</option>
                    <option value="Paid">Paid (Credited to Bank)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-slate-400 mb-1">Date</label>
                  <input
                    type="date"
                    value={divPayDate}
                    onChange={(e) => setDivPayDate(e.target.value)}
                    className="rune-input w-full px-2.5 py-2"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Year</label>
                  <input
                    type="number"
                    value={divYear}
                    onChange={(e) => setDivYear(e.target.value)}
                    className="rune-input w-full px-2.5 py-2 font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Term</label>
                  <select
                    value={divTerm}
                    onChange={(e) => setDivTerm(e.target.value)}
                    className="rune-input w-full px-2.5 py-2 font-mono-num"
                  >
                    <option value="Q1">Q1</option>
                    <option value="Q2">Q2</option>
                    <option value="Q3">Q3</option>
                    <option value="H1">H1</option>
                    <option value="F">Final (F)</option>
                    <option value="Interim">Interim</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">
                    Eligible Shares
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={divShares}
                    onChange={(e) => {
                      setDivShares(e.target.value);
                      const sh = parseFloat(e.target.value) || 0;
                      const dps = parseFloat(divDps) || 0;
                      setDivWht(String(Math.round(sh * dps * 0.15)));
                    }}
                    className="rune-input w-full px-3 py-2 font-mono-num"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">
                    Dividend / Share (DPS)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={divDps}
                    onChange={(e) => {
                      setDivDps(e.target.value);
                      const sh = parseFloat(divShares) || 0;
                      const dps = parseFloat(e.target.value) || 0;
                      setDivWht(String(Math.round(sh * dps * 0.15)));
                    }}
                    className="rune-input w-full px-3 py-2 font-mono-num"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">
                    WHT Tax (15% Auto)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={divWht}
                    onChange={(e) => setDivWht(e.target.value)}
                    className="rune-input w-full px-3 py-2 font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Zakat</label>
                  <input
                    type="number"
                    step="any"
                    value={divZakat}
                    onChange={(e) => setDivZakat(e.target.value)}
                    className="rune-input w-full px-3 py-2 font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">
                    Reinvested (DRIP)?
                  </label>
                  <select
                    value={divReinvested}
                    onChange={(e) =>
                      setDivReinvested(e.target.value as "Yes" | "No")
                    }
                    className="rune-input w-full px-3 py-2 font-semibold"
                  >
                    <option value="No">No (Cash Retained)</option>
                    <option value="Yes">Yes (Reinvested DRIP)</option>
                  </select>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between font-mono-num">
                <span className="text-slate-400">Net Dividend Payout:</span>
                <strong className="text-sm text-amber-400">
                  Rs.{" "}
                  {Math.round(
                    (parseFloat(divShares) || 0) * (parseFloat(divDps) || 0) -
                      (parseFloat(divWht) || 0) -
                      (parseFloat(divZakat) || 0)
                  ).toLocaleString()}
                </strong>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsDivModalOpen(false)}
                  className="rune-pill px-4 py-2 text-xs text-slate-400 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Plus className="w-4 h-4" />
                  {editingDivId ? "Update Dividend" : "Save Dividend Entry"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* POPUP MODAL 3: MARK DIVIDEND AS PAID                      */}
      {/* ========================================================= */}
      {markPaidModalDiv && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setMarkPaidModalDiv(null)}
        >
          <div
            className="rune-card-rose w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-amber-300">
              Confirm Dividend Credit ({markPaidModalDiv.ticker})
            </h3>
            <p className="text-xs text-slate-300 mt-1">
              Mark{" "}
              <strong>
                {markPaidModalDiv.ticker} ({markPaidModalDiv.term}{" "}
                {markPaidModalDiv.year})
              </strong>{" "}
              for{" "}
              <strong className="text-emerald-400">
                Rs.{" "}
                {Math.round(
                  markPaidModalDiv.sharesEligible * markPaidModalDiv.dps -
                    markPaidModalDiv.wht -
                    (markPaidModalDiv.zakat || 0)
                ).toLocaleString()}{" "}
                Net
              </strong>{" "}
              as <strong>Paid</strong> and record the bank credit date:
            </p>

            <div className="mt-4">
              <label className="block text-xs text-slate-400 mb-1">
                Date Dividend Received in Bank
              </label>
              <input
                type="date"
                value={markPaidDate}
                onChange={(e) => setMarkPaidDate(e.target.value)}
                className="rune-input w-full px-3 py-2 text-sm font-mono-num"
              />
            </div>

            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={() => setMarkPaidModalDiv(null)}
                className="rune-pill px-4 py-2 text-xs text-slate-400 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmMarkPaid}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                Confirm Paid &amp; Save Date
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* POPUP MODAL 4: ADD NEW PSX COMPANY                        */}
      {/* ========================================================= */}
      {isCompanyModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setIsCompanyModalOpen(false)}
        >
          <div
            className="rune-card w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <div>
                <span className="text-[11px] uppercase tracking-widest text-emerald-400 font-semibold">
                  Auto-Scraped from PSX Portal
                </span>
                <h3 className="text-base font-bold mt-0.5">
                  Add New PSX Company
                </h3>
              </div>
              <button
                onClick={() => setIsCompanyModalOpen(false)}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddCompany} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">
                  PSX Ticker Symbol (e.g. LUCK, MARI, PSO)
                </label>
                <input
                  type="text"
                  value={newCompTicker}
                  onChange={(e) =>
                    setNewCompTicker(e.target.value.toUpperCase())
                  }
                  placeholder="LUCK"
                  className="rune-input w-full px-3 py-2 font-mono-num uppercase"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">
                  Company Name (Optional — Auto-Scraped)
                </label>
                <input
                  type="text"
                  value={newCompName}
                  onChange={(e) => setNewCompName(e.target.value)}
                  placeholder="Lucky Cement Limited"
                  className="rune-input w-full px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">
                  Dividend Cadence
                </label>
                <select
                  value={newCompFreq}
                  onChange={(e) => setNewCompFreq(e.target.value)}
                  className="rune-input w-full px-3 py-2"
                >
                  <option value="Quarterly">Quarterly</option>
                  <option value="Semi-Annual">Semi-Annual</option>
                  <option value="Annual">Annual</option>
                </select>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCompanyModalOpen(false)}
                  className="rune-pill px-4 py-2 text-xs text-slate-400 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAddingCompany}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Cloud className="w-4 h-4" />
                  {isAddingCompany
                    ? "Scraping PSX..."
                    : "Add & Sync Live Price"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Deep-Dive Modal */}
      <StockDetailModal
        position={selectedModalPosition}
        dividends={state.dividends}
        announcements={relevantAnnouncements}
        onClose={() => setModalTicker(null)}
      />
    </div>
  );
}
