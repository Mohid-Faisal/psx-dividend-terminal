"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import seedPortfolioData from "@/data/seed-portfolio.json";
import {
  CompanyRecord,
  DividendRecord,
  PortfolioState,
  PsxAnnouncement,
  TransactionRecord,
} from "@/types/portfolio";
import {
  computeBrokerageAndSst,
  getSectorColor,
  HoldingRecord,
  runAccountingEngine,
} from "@/lib/accounting";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { fetchPortfolioFromSupabase } from "@/lib/db-service";

const Portfolio3DTowers = dynamic(
  () => import("@/components/Portfolio3DTowers"),
  {
    ssr: false,
    loading: () => (
      <div className="canvas-3d-wrap flex items-center justify-center text-slate-300 font-mono text-xs">
        Loading Interactive 3D Portfolio Scene...
      </div>
    ),
  }
);

type TabId =
  | "overview"
  | "holdings"
  | "transactions"
  | "dividends"
  | "monthly"
  | "research";

function fmtPKR(val: number, decimals = 0): string {
  const num = Number(val) || 0;
  return (
    "Rs. " +
    num.toLocaleString("en-PK", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
}

function fmtSignedPKR(val: number, decimals = 0): string {
  const num = Number(val) || 0;
  const sign = num > 0 ? "+" : num < 0 ? "-" : "";
  return (
    sign +
    "Rs. " +
    Math.abs(num).toLocaleString("en-PK", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
}

function fmtNum(val: number, decimals = 0): string {
  return (Number(val) || 0).toLocaleString("en-PK", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export default function PsxPortfolioTerminalPage() {
  const [state, setState] = useState<PortfolioState>(() => {
    const raw = seedPortfolioData as unknown as PortfolioState;
    return {
      companies: raw.companies || [],
      transactions: raw.transactions || [],
      dividends: raw.dividends || [],
      settings: raw.settings || {
        includeLegacyMcbInCashflow: true,
        defaultBrokerageRate: 0.0017,
        defaultMinBrkPerShare: 0.05,
        defaultSstRate: 0.15,
      },
      lastUpdated: raw.lastUpdated || new Date().toISOString(),
    };
  });

  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [cloudSynced, setCloudSynced] = useState<boolean>(false);
  const [syncingPsx, setSyncingPsx] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>("");
  const [announcements, setAnnouncements] = useState<PsxAnnouncement[]>([]);
  const [toastBanner, setToastBanner] = useState<string | null>(null);

  // Filters & Sorting
  const [sectorSortMetric, setSectorSortMetric] = useState<
    "marketValue" | "activeCostBasis" | "netDivPaid" | "totalReturn"
  >("marketValue");
  const [holdingsSearch, setHoldingsSearch] = useState("");
  const [holdingsSectorFilter, setHoldingsSectorFilter] = useState("ALL");
  const [holdingsStatusFilter, setHoldingsStatusFilter] = useState<
    "ACTIVE" | "ALL" | "CLOSED"
  >("ACTIVE");
  const [holdingsSort, setHoldingsSort] = useState<{
    col: keyof HoldingRecord;
    asc: boolean;
  }>({ col: "marketValue", asc: false });

  const [txSearch, setTxSearch] = useState("");
  const [txActionFilter, setTxActionFilter] = useState<"ALL" | "Buy" | "Sell">(
    "ALL"
  );
  const [txMonthFilter, setTxMonthFilter] = useState("ALL");

  const [divSearch, setDivSearch] = useState("");
  const [divStatusFilter, setDivStatusFilter] = useState<
    "ALL" | "Paid" | "Unpaid"
  >("ALL");
  const [divReinvFilter, setDivReinvFilter] = useState<"ALL" | "Yes" | "No">(
    "ALL"
  );

  // Research tab state
  const [researchTicker, setResearchTicker] = useState("HUBC");
  const [researchChartMode, setResearchChartMode] = useState<"custom" | "psx">(
    "custom"
  );

  // Popup Modal 1: Add / Edit Buy or Sell Transaction
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [txEditId, setTxEditId] = useState<number | null>(null);
  const [txDate, setTxDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [txTicker, setTxTicker] = useState("HUBC");
  const [txAction, setTxAction] = useState<"Buy" | "Sell">("Buy");
  const [txNotes, setTxNotes] = useState("");
  const [txShares, setTxShares] = useState("");
  const [txPrice, setTxPrice] = useState("");
  const [txBrk, setTxBrk] = useState("0");
  const [txSst, setTxSst] = useState("0");
  const [txSaving, setTxSaving] = useState(false);

  // Popup Modal 2: Add / Edit Dividend
  const [divModalOpen, setDivModalOpen] = useState(false);
  const [divEditId, setDivEditId] = useState<number | null>(null);
  const [divDate, setDivDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [divTicker, setDivTicker] = useState("HUBC");
  const [divYear, setDivYear] = useState("2026");
  const [divTerm, setDivTerm] = useState("Interim I");
  const [divShares, setDivShares] = useState("");
  const [divDps, setDivDps] = useState("");
  const [divWht, setDivWht] = useState("0");
  const [divZakat, setDivZakat] = useState("0");
  const [divStatus, setDivStatus] = useState<"Paid" | "Unpaid">("Paid");
  const [divReinvest, setDivReinvest] = useState<"Yes" | "No">("No");
  const [divSaving, setDivSaving] = useState(false);

  // Popup Modal 3: Add New PSX Company
  const [compModalOpen, setCompModalOpen] = useState(false);
  const [compTicker, setCompTicker] = useState("");
  const [compFreq, setCompFreq] = useState("Qtr");
  const [compName, setCompName] = useState("");
  const [compSector, setCompSector] = useState("COMMERCIAL BANKS");
  const [compPrice, setCompPrice] = useState("0");
  const [compFetching, setCompFetching] = useState(false);

  // Popup Modal 4: Mark Dividend Paid & Set Payment Date
  const [markPaidModalDiv, setMarkPaidModalDiv] =
    useState<DividendRecord | null>(null);
  const [markPaidDate, setMarkPaidDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );

  // Theme initialization (Defaults to crisp Light Mode like before)
  useEffect(() => {
    const saved = localStorage.getItem("psx_theme_v5") as
      | "light"
      | "dark"
      | null;
    const initial = saved === "dark" ? "dark" : "light";
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("psx_theme_v5", next);
  };

  // Run Zero-Bug Accounting Engine
  const computed = useMemo(() => runAccountingEngine(state), [state]);

  // Fetch initial portfolio from Supabase
  const fetchPortfolioFromCloud = useCallback(async () => {
    try {
      const data = await fetchPortfolioFromSupabase();
      if (data?.companies?.length) {
        setState({
          companies: data.companies,
          transactions: data.transactions || [],
          dividends: data.dividends || [],
          announcements: data.announcements || [],
          settings: data.settings || {
            includeLegacyMcbInCashflow: true,
            defaultBrokerageRate: 0.0017,
            defaultMinBrkPerShare: 0.05,
            defaultSstRate: 0.15,
          },
          lastUpdated: data.lastUpdated || new Date().toISOString(),
        });
        if (Array.isArray(data.announcements)) {
          setAnnouncements(data.announcements);
        }
        setCloudSynced(true);
      }
    } catch (err) {
      console.error("Error fetching cloud portfolio:", err);
    }
  }, []);

  // Sync live PSX prices + scan PSX dividend announcements
  const syncLivePsxPricesAndDividends = useCallback(
    async (silent = false) => {
      if (syncingPsx) return;
      setSyncingPsx(true);
      try {
        const res = await fetch("/api/psx/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.companies) && data.companies.length > 0) {
            setState((prev) => ({
              ...prev,
              companies: data.companies,
              lastUpdated: new Date().toISOString(),
            }));
          }
          setLastSyncTime(
            new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })
          );
          const newAnns = Array.isArray(data.newDividendAnnouncements)
            ? data.newDividendAnnouncements
            : [];
          if (newAnns.length > 0) {
            await fetchPortfolioFromCloud();
            setToastBanner(
              `🔔 PSX Dividend Monitor: ${newAnns.length} new dividend announcement(s) detected and queued as Unpaid!`
            );
          } else if (!silent) {
            setToastBanner(
              `✓ Synced live PSX prices for ${data.updatedCount || 27} stocks in ${((data.durationMs || 4000) / 1000).toFixed(1)}s`
            );
          }
        }
      } catch (e) {
        console.error("PSX live sync failed:", e);
      } finally {
        setSyncingPsx(false);
      }
    },
    [syncingPsx, fetchPortfolioFromCloud]
  );

  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    fetchPortfolioFromCloud().then(() => {
      syncLivePsxPricesAndDividends(true);
    });
  }, [fetchPortfolioFromCloud, syncLivePsxPricesAndDividends]);

  // Subscribe to Supabase Realtime so any Add, Edit, or Delete on either laptop or phone syncs immediately
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel("psx-realtime-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "psx_transactions" },
        () => fetchPortfolioFromCloud()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "psx_dividends" },
        () => fetchPortfolioFromCloud()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "psx_companies" },
        () => fetchPortfolioFromCloud()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "psx_settings" },
        () => fetchPortfolioFromCloud()
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setCloudSynced(true);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPortfolioFromCloud]);

  // Sorted tickers for dropdowns
  const sortedTickers = useMemo(
    () =>
      [...computed.holdings].sort((a, b) => a.ticker.localeCompare(b.ticker)),
    [computed.holdings]
  );

  // OpenStockResearch helper
  const openStockResearch = (ticker: string) => {
    setResearchTicker(ticker);
    setActiveTab("research");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // =========================================================================
  // MODAL 1: ADD / EDIT BUY OR SELL TRANSACTION
  // =========================================================================
  const openTxModal = (editId: number | null = null) => {
    if (editId !== null) {
      const t = state.transactions.find((x) => x.id === editId);
      if (!t) return;
      setTxEditId(editId);
      setTxDate(t.date);
      setTxTicker(t.ticker);
      setTxAction(t.action);
      setTxNotes(t.notes || "");
      setTxShares(String(t.shares));
      setTxPrice(String(t.price));
      setTxBrk(String(t.brkFees));
      setTxSst(String(t.sst));
    } else {
      const defaultSym = "HUBC";
      const liveP = computed.compMap[defaultSym]?.price || 0;
      setTxEditId(null);
      setTxDate(new Date().toISOString().slice(0, 10));
      setTxTicker(defaultSym);
      setTxAction("Buy");
      setTxNotes("");
      setTxShares("");
      setTxPrice(liveP > 0 ? String(liveP) : "");
      setTxBrk("0");
      setTxSst("0");
    }
    setTxModalOpen(true);
  };

  const handleTxTickerChange = (newSym: string) => {
    setTxTicker(newSym);
    const liveP = computed.compMap[newSym]?.price || 0;
    const priceStr = liveP > 0 ? String(liveP) : txPrice;
    if (liveP > 0) setTxPrice(priceStr);
    if (txEditId === null) {
      const { brkFees, sst } = computeBrokerageAndSst(
        Number(txShares) || 0,
        Number(priceStr) || 0,
        txNotes
      );
      setTxBrk(brkFees.toFixed(2));
      setTxSst(sst.toFixed(2));
    }
  };

  const handleTxSharesOrPriceOrNotesChange = (
    newShares: string,
    newPrice: string,
    newNotes: string,
    forceRecalc = false
  ) => {
    setTxShares(newShares);
    setTxPrice(newPrice);
    setTxNotes(newNotes);
    if (txEditId === null || forceRecalc) {
      const { brkFees, sst } = computeBrokerageAndSst(
        Number(newShares) || 0,
        Number(newPrice) || 0,
        newNotes
      );
      setTxBrk(brkFees.toFixed(2));
      setTxSst(sst.toFixed(2));
    }
  };

  const saveTxForm = async () => {
    const shares = Math.abs(Number(txShares) || 0);
    const price = Number(txPrice) || 0;
    const brkFees = Number(txBrk) || 0;
    const sst = Number(txSst) || 0;
    const notes = txNotes.trim();

    if (!txDate || !txTicker || shares <= 0 || price <= 0) {
      alert("Please fill in Date, Ticker, Shares, and Price.");
      return;
    }

    const company = computed.compMap[txTicker]?.name || txTicker;
    setTxSaving(true);

    try {
      const supabase = getSupabaseBrowserClient();
      if (txEditId !== null) {
        // Optimistic update
        setState((prev) => ({
          ...prev,
          transactions: prev.transactions.map((x) =>
            x.id === txEditId
              ? {
                  id: txEditId,
                  date: txDate,
                  ticker: txTicker,
                  company,
                  action: txAction,
                  shares,
                  price,
                  brkFees,
                  sst,
                  notes,
                }
              : x
          ),
        }));

        if (supabase) {
          const { error } = await supabase
            .from("psx_transactions")
            .update({
              date: txDate,
              ticker: txTicker,
              company,
              action: txAction,
              shares,
              price,
              brk_fees: brkFees,
              sst,
              notes,
            })
            .eq("id", txEditId);
          if (error) throw error;
        }
        setToastBanner(`✓ Updated ${txAction} transaction for ${txTicker}`);
      } else {
        const tempId =
          state.transactions.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
        const newRec: TransactionRecord = {
          id: tempId,
          date: txDate,
          ticker: txTicker,
          company,
          action: txAction,
          shares,
          price,
          brkFees,
          sst,
          notes,
        };
        setState((prev) => ({
          ...prev,
          transactions: [...prev.transactions, newRec],
        }));

        if (supabase) {
          const { data, error } = await supabase
            .from("psx_transactions")
            .insert({
              date: txDate,
              ticker: txTicker,
              company,
              action: txAction,
              shares,
              price,
              brk_fees: brkFees,
              sst,
              notes,
            })
            .select()
            .single();
          if (error) throw error;
          if (data?.id) {
            setState((prev) => ({
              ...prev,
              transactions: prev.transactions.map((x) =>
                x.id === tempId ? { ...x, id: Number(data.id) } : x
              ),
            }));
          }
        }
        setToastBanner(
          `✓ Added ${txAction} (${shares} sh of ${txTicker}) — Synced to Cloud`
        );
      }
      setTxModalOpen(false);
    } catch (err) {
      console.error("Failed to save transaction:", err);
      alert("Error syncing transaction to cloud. Please try again.");
    } finally {
      setTxSaving(false);
    }
  };

  const deleteTransaction = async (id: number) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this transaction? This deletion will sync immediately across all laptops and phones."
      )
    )
      return;

    setState((prev) => ({
      ...prev,
      transactions: prev.transactions.filter((x) => x.id !== id),
    }));

    try {
      const supabase = getSupabaseBrowserClient();
      if (supabase) {
        const { error } = await supabase
          .from("psx_transactions")
          .delete()
          .eq("id", id);
        if (error) throw error;
      }
      setToastBanner("✓ Transaction deleted across all synced devices");
    } catch (err) {
      console.error("Delete transaction error:", err);
      fetchPortfolioFromCloud();
    }
  };

  // =========================================================================
  // MODAL 2: ADD / EDIT DIVIDEND
  // =========================================================================
  const calcEligibleSharesOnDate = useCallback(
    (sym: string, dt: string) => {
      const targetDate = dt || "9999-12-31";
      let sh = sym === "MCB" ? 225 : 0;
      state.transactions.forEach((t) => {
        if (t.ticker === sym && t.date <= targetDate) {
          sh += t.action === "Buy" ? Number(t.shares) : -Number(t.shares);
        }
      });
      return Math.max(0, sh);
    },
    [state.transactions]
  );

  const openDivModal = (editId: number | null = null) => {
    if (editId !== null) {
      const d = state.dividends.find((x) => x.id === editId);
      if (!d) return;
      setDivEditId(editId);
      setDivDate(d.paymentDate);
      setDivTicker(d.ticker);
      setDivYear(d.year);
      setDivTerm(d.term);
      setDivShares(String(d.sharesEligible));
      setDivDps(String(d.dps));
      setDivWht(String(d.wht));
      setDivZakat(String(d.zakat || 0));
      setDivStatus(d.status || "Paid");
      setDivReinvest(d.reinvest || "No");
    } else {
      const defaultSym = "HUBC";
      const today = new Date().toISOString().slice(0, 10);
      const elig = calcEligibleSharesOnDate(defaultSym, today);
      setDivEditId(null);
      setDivDate(today);
      setDivTicker(defaultSym);
      setDivYear("2026");
      setDivTerm("Interim I");
      setDivShares(String(elig));
      setDivDps("");
      setDivWht("0");
      setDivZakat("0");
      setDivStatus("Paid");
      setDivReinvest("No");
    }
    setDivModalOpen(true);
  };

  const applyDivWhtPreset = (ratePct: number) => {
    const sh = Number(divShares) || 0;
    const dps = Number(divDps) || 0;
    setDivWht(String(Math.round(sh * dps * (ratePct / 100))));
  };

  const saveDivForm = async () => {
    const sharesEligible = Number(divShares) || 0;
    const dps = Number(divDps) || 0;
    const wht = Number(divWht) || 0;
    const zakat = Number(divZakat) || 0;

    if (!divDate || !divTicker || sharesEligible <= 0 || dps <= 0) {
      alert(
        "Please fill in Date, Ticker, Eligible Shares, and Dividend per Share."
      );
      return;
    }

    setDivSaving(true);
    try {
      const supabase = getSupabaseBrowserClient();
      if (divEditId !== null) {
        setState((prev) => ({
          ...prev,
          dividends: prev.dividends.map((x) =>
            x.id === divEditId
              ? {
                  ...x,
                  id: divEditId,
                  paymentDate: divDate,
                  ticker: divTicker,
                  year: divYear.trim(),
                  term: divTerm,
                  sharesEligible,
                  status: divStatus,
                  dps,
                  wht,
                  zakat,
                  reinvest: divReinvest,
                }
              : x
          ),
        }));

        if (supabase) {
          const { error } = await supabase
            .from("psx_dividends")
            .update({
              payment_date: divDate,
              ticker: divTicker,
              year: divYear.trim(),
              term: divTerm,
              shares_eligible: sharesEligible,
              status: divStatus,
              dps,
              wht,
              zakat,
              reinvest: divReinvest,
            })
            .eq("id", divEditId);
          if (error) throw error;
        }
        setToastBanner(`✓ Updated dividend record for ${divTicker}`);
      } else {
        const tempId =
          state.dividends.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
        const newDiv: DividendRecord = {
          id: tempId,
          paymentDate: divDate,
          ticker: divTicker,
          year: divYear.trim(),
          term: divTerm,
          sharesEligible,
          status: divStatus,
          dps,
          wht,
          zakat,
          reinvest: divReinvest,
          reinvestPrice: 0,
        };
        setState((prev) => ({
          ...prev,
          dividends: [...prev.dividends, newDiv],
        }));

        if (supabase) {
          const { data, error } = await supabase
            .from("psx_dividends")
            .insert({
              payment_date: divDate,
              ticker: divTicker,
              year: divYear.trim(),
              term: divTerm,
              shares_eligible: sharesEligible,
              status: divStatus,
              dps,
              wht,
              zakat,
              reinvest: divReinvest,
              reinvest_price: 0,
            })
            .select()
            .single();
          if (error) throw error;
          if (data?.id) {
            setState((prev) => ({
              ...prev,
              dividends: prev.dividends.map((x) =>
                x.id === tempId ? { ...x, id: Number(data.id) } : x
              ),
            }));
          }
        }
        setToastBanner(
          `✓ Added ${divStatus} dividend for ${divTicker} — Synced to Cloud`
        );
      }
      setDivModalOpen(false);
    } catch (err) {
      console.error("Failed to save dividend:", err);
      alert("Error syncing dividend to cloud. Please try again.");
    } finally {
      setDivSaving(false);
    }
  };

  const deleteDividend = async (id: number) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this dividend record? This deletion will sync immediately across all laptops and phones."
      )
    )
      return;

    setState((prev) => ({
      ...prev,
      dividends: prev.dividends.filter((x) => x.id !== id),
    }));

    try {
      const supabase = getSupabaseBrowserClient();
      if (supabase) {
        const { error } = await supabase
          .from("psx_dividends")
          .delete()
          .eq("id", id);
        if (error) throw error;
      }
      setToastBanner("✓ Dividend record deleted across all synced devices");
    } catch (err) {
      console.error("Delete dividend error:", err);
      fetchPortfolioFromCloud();
    }
  };

  // Clicking Status pill: If Unpaid, open "Mark as Paid & Set Date" modal; if Paid, confirm toggle to Unpaid
  const handleStatusPillClick = async (d: DividendRecord) => {
    if (d.status === "Unpaid") {
      setMarkPaidModalDiv(d);
      setMarkPaidDate(
        d.paymentDate || new Date().toISOString().slice(0, 10)
      );
    } else {
      const nextStatus: "Paid" | "Unpaid" = "Unpaid";
      setState((prev) => ({
        ...prev,
        dividends: prev.dividends.map((x) =>
          x.id === d.id ? { ...x, status: nextStatus } : x
        ),
      }));
      const supabase = getSupabaseBrowserClient();
      if (supabase) {
        await supabase
          .from("psx_dividends")
          .update({ status: nextStatus })
          .eq("id", d.id);
      }
      setToastBanner(`Marked ${d.ticker} dividend as Unpaid`);
    }
  };

  const confirmMarkDividendPaid = async () => {
    if (!markPaidModalDiv) return;
    const id = markPaidModalDiv.id;
    const payDate = markPaidDate || new Date().toISOString().slice(0, 10);

    setState((prev) => ({
      ...prev,
      dividends: prev.dividends.map((x) =>
        x.id === id
          ? { ...x, status: "Paid", paymentDate: payDate }
          : x
      ),
    }));

    try {
      const supabase = getSupabaseBrowserClient();
      if (supabase) {
        await supabase
          .from("psx_dividends")
          .update({ status: "Paid", payment_date: payDate })
          .eq("id", id);
      }
      setToastBanner(
        `✓ Marked ${markPaidModalDiv.ticker} dividend as PAID on ${payDate}!`
      );
    } catch (err) {
      console.error("Error marking dividend paid:", err);
    } finally {
      setMarkPaidModalDiv(null);
    }
  };

  // Queue a detected PSX announcement into Unpaid Dividends with 1 click
  const queueAnnouncementAsUnpaidDividend = async (ann: PsxAnnouncement) => {
    const dps = ann.parsedDps || 0;
    const payDate =
      ann.announcementDate || new Date().toISOString().slice(0, 10);
    const eligShares =
      computed.compMap[ann.ticker]?.activeShares ||
      calcEligibleSharesOnDate(ann.ticker, payDate);
    if (eligShares <= 0 || dps <= 0) {
      alert(
        `Cannot auto-queue ${ann.ticker}: Held shares (${eligShares}) or DPS (${dps}) is 0.`
      );
      return;
    }
    const isIpp =
      computed.compMap[ann.ticker]?.sector ===
      "POWER GENERATION & DISTRIBUTION";
    const whtRate = isIpp ? 0.075 : 0.15;
    const gross = eligShares * dps;
    const wht = Math.round(gross * whtRate);

    const tempId =
      state.dividends.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
    const newDiv: DividendRecord = {
      id: tempId,
      paymentDate: payDate,
      ticker: ann.ticker,
      year: ann.parsedYear || "2026",
      term: ann.parsedTerm || "Interim I",
      sharesEligible: eligShares,
      status: "Unpaid",
      dps,
      wht,
      zakat: 0,
      reinvest: "No",
      reinvestPrice: 0,
      announcementId: ann.id,
    };

    setState((prev) => ({
      ...prev,
      dividends: [...prev.dividends, newDiv],
    }));

    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      await supabase
        .from("psx_announcements")
        .update({ added_to_dividends: true })
        .eq("id", ann.id);
      const { data } = await supabase
        .from("psx_dividends")
        .insert({
          payment_date: payDate,
          ticker: ann.ticker,
          year: ann.parsedYear || "2026",
          term: ann.parsedTerm || "Interim I",
          shares_eligible: eligShares,
          status: "Unpaid",
          dps,
          wht,
          zakat: 0,
          reinvest: "No",
          reinvest_price: 0,
          announcement_id: ann.id,
        })
        .select()
        .single();
      if (data?.id) {
        setState((prev) => ({
          ...prev,
          dividends: prev.dividends.map((x) =>
            x.id === tempId ? { ...x, id: Number(data.id) } : x
          ),
        }));
      }
    }
    setAnnouncements((prev) =>
      prev.map((x) =>
        x.id === ann.id ? { ...x, addedToDividends: true } : x
      )
    );
    setToastBanner(
      `✓ Added ${ann.ticker} (Rs. ${dps}/sh) to Unpaid Dividends Queue!`
    );
  };

  // =========================================================================
  // MODAL 3: ADD NEW PSX COMPANY
  // =========================================================================
  const autoFetchNewTickerInfo = async () => {
    const sym = compTicker.trim().toUpperCase();
    if (!sym) return;
    setCompFetching(true);
    try {
      const res = await fetch(`/api/psx/company?ticker=${sym}`);
      if (res.ok) {
        const q = await res.json();
        if (q.name) setCompName(q.name);
        if (q.sector) setCompSector(q.sector.toUpperCase());
        if (q.price > 0) setCompPrice(String(q.price));
      }
    } catch (e) {
      console.error("Failed to fetch PSX company info:", e);
    } finally {
      setCompFetching(false);
    }
  };

  const saveCompanyForm = async () => {
    const ticker = compTicker.trim().toUpperCase();
    const name = compName.trim() || ticker;
    const price = Number(compPrice) || 0;
    if (!ticker) {
      alert("Please enter a PSX Ticker Symbol.");
      return;
    }

    const newComp: CompanyRecord = {
      ticker,
      name,
      frequency: compFreq,
      sector: compSector,
      price,
      ldcp: price,
      change: 0,
      changePct: 0,
      pe: "N/A",
      high52: "",
      dayRange: "",
      volume: "0",
      asOf: "Live PSX",
    };

    setState((prev) => {
      const exists = prev.companies.some((c) => c.ticker === ticker);
      return {
        ...prev,
        companies: exists
          ? prev.companies.map((c) => (c.ticker === ticker ? newComp : c))
          : [...prev.companies, newComp],
      };
    });

    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      await supabase.from("psx_companies").upsert({
        ticker,
        name,
        frequency: compFreq,
        sector: compSector,
        price,
        ldcp: price,
        change: 0,
        change_pct: 0,
        pe: "N/A",
        high_52: "",
        day_range: "",
        volume: "0",
        as_of: "Live PSX",
      });
    }

    setCompModalOpen(false);
    setToastBanner(`✓ Saved PSX ticker ${ticker} (${name})`);
    syncLivePsxPricesAndDividends(true);
  };

  // Toggle Legacy MCB Sale Cashflow setting
  const toggleMcbLegacySetting = async (checked: boolean) => {
    setState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        includeLegacyMcbInCashflow: checked,
      },
    }));
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      await supabase
        .from("psx_settings")
        .update({ include_legacy_mcb_in_cashflow: checked })
        .eq("id", 1);
    }
  };

  // =========================================================================
  // DERIVED TABLES & LISTS
  // =========================================================================
  const t = computed.totals;

  const sectorBreakdownList = useMemo(() => {
    const map: Record<
      string,
      {
        sector: string;
        marketValue: number;
        activeCostBasis: number;
        netDivPaid: number;
        totalReturn: number;
        count: number;
      }
    > = {};
    computed.holdings
      .filter((h) => h.activeShares > 0)
      .forEach((h) => {
        const sec = h.sector || "OTHER";
        if (!map[sec]) {
          map[sec] = {
            sector: sec,
            marketValue: 0,
            activeCostBasis: 0,
            netDivPaid: 0,
            totalReturn: 0,
            count: 0,
          };
        }
        map[sec].marketValue += h.marketValue;
        map[sec].activeCostBasis += h.activeCostBasis;
        map[sec].netDivPaid += h.netDivPaid;
        map[sec].totalReturn += h.totalReturn;
        map[sec].count += 1;
      });
    return Object.values(map).sort(
      (a, b) => b[sectorSortMetric] - a[sectorSortMetric]
    );
  }, [computed.holdings, sectorSortMetric]);

  const filteredHoldings = useMemo(() => {
    const q = holdingsSearch.toLowerCase().trim();
    return computed.holdings
      .filter((h) => {
        if (holdingsStatusFilter === "ACTIVE" && h.activeShares <= 0)
          return false;
        if (holdingsStatusFilter === "CLOSED" && h.activeShares > 0)
          return false;
        if (
          holdingsSectorFilter !== "ALL" &&
          h.sector !== holdingsSectorFilter
        )
          return false;
        if (
          q &&
          !`${h.ticker} ${h.name} ${h.sector}`.toLowerCase().includes(q)
        )
          return false;
        return true;
      })
      .sort((a, b) => {
        const va = a[holdingsSort.col];
        const vb = b[holdingsSort.col];
        if (typeof va === "string" && typeof vb === "string") {
          return holdingsSort.asc
            ? va.localeCompare(vb)
            : vb.localeCompare(va);
        }
        return holdingsSort.asc
          ? Number(va) - Number(vb)
          : Number(vb) - Number(va);
      });
  }, [
    computed.holdings,
    holdingsSearch,
    holdingsSectorFilter,
    holdingsStatusFilter,
    holdingsSort,
  ]);

  const handleSortHoldings = (col: keyof HoldingRecord) => {
    setHoldingsSort((prev) =>
      prev.col === col
        ? { col, asc: !prev.asc }
        : {
            col,
            asc: col === "ticker" || col === "name" || col === "sector",
          }
    );
  };

  const filteredTransactions = useMemo(() => {
    const q = txSearch.toLowerCase().trim();
    return [...computed.transactions].reverse().filter((tx) => {
      if (txActionFilter !== "ALL" && tx.action !== txActionFilter)
        return false;
      if (txMonthFilter !== "ALL" && tx.ym !== txMonthFilter) return false;
      if (
        q &&
        !`${tx.ticker} ${tx.company} ${tx.notes || ""} ${tx.date}`
          .toLowerCase()
          .includes(q)
      )
        return false;
      return true;
    });
  }, [computed.transactions, txSearch, txActionFilter, txMonthFilter]);

  const filteredDividends = useMemo(() => {
    const q = divSearch.toLowerCase().trim();
    return [...computed.dividends].reverse().filter((d) => {
      if (divStatusFilter !== "ALL" && d.status !== divStatusFilter)
        return false;
      if (divReinvFilter !== "ALL" && d.reinvest !== divReinvFilter)
        return false;
      if (
        q &&
        !`${d.ticker} ${d.company} ${d.year} ${d.term}`
          .toLowerCase()
          .includes(q)
      )
        return false;
      return true;
    });
  }, [computed.dividends, divSearch, divStatusFilter, divReinvFilter]);

  const unpaidDivCount = useMemo(
    () => computed.dividends.filter((d) => d.status === "Unpaid").length,
    [computed.dividends]
  );

  const allSectors = useMemo(
    () =>
      Array.from(
        new Set(computed.holdings.map((h) => h.sector).filter(Boolean))
      ).sort(),
    [computed.holdings]
  );

  // Selected Stock for Tab 6 (Research)
  const selectedStock =
    computed.compMap[researchTicker] || computed.holdings[0];

  // Positions for 3D scene
  const positionsFor3D = useMemo(
    () =>
      computed.holdings
        .filter((h) => h.activeShares > 0)
        .map((h) => ({
          ticker: h.ticker,
          name: h.name,
          sector: h.sector,
          frequency: h.frequency,
          shares: h.activeShares,
          totalSharesBought: h.totalBuyShares,
          totalSharesSold: h.totalSellShares,
          wac: h.wac,
          costBasis: h.activeCostBasis,
          livePrice: h.price,
          ldcp: h.ldcp,
          dayChange: h.change,
          dayChangePct: h.changePct,
          marketValue: h.marketValue,
          unrealizedPnl: h.unrealizedPnL,
          unrealizedPnlPct: h.unrealizedPct,
          realizedPnl: h.realizedPnL,
          grossDividends: h.grossDivPaid,
          whtTotal: h.whtPaid,
          zakatTotal: h.zakatPaid,
          netDividendsPaid: h.netDivPaid,
          netDividendsUnpaid: h.netDivUnpaid,
          totalReturn: h.totalReturn,
          totalReturnPct: h.totalReturnPct,
          yieldOnCostPct: h.yoc,
          currentYieldPct:
            h.marketValue > 0 ? (h.netDivPaid / h.marketValue) * 100 : 0,
          weightPct: h.weight,
          high52: h.high52,
          dayRange: h.dayRange,
          volume: h.volume,
          pe: h.pe,
          asOf: h.asOf,
          lots: [],
        })),
    [computed.holdings]
  );

  // =========================================================================
  // RENDER
  // =========================================================================
  return (
    <div>
      {/* TOP EXECUTIVE NAVY HEADER */}
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">PSX</div>
          <div>
            <div className="brand-name">
              PSX Portfolio &amp; Dividend Intelligence
            </div>
            <div className="brand-meta">
              <span
                style={{
                  background: cloudSynced
                    ? "rgba(16, 185, 129, 0.28)"
                    : "rgba(245, 158, 11, 0.25)",
                  color: "#ffffff",
                  border: cloudSynced
                    ? "1px solid #34d399"
                    : "1px solid #fbbf24",
                  padding: "1px 8px",
                  borderRadius: "99px",
                  fontWeight: 700,
                  fontSize: "11px",
                }}
              >
                {cloudSynced
                  ? "✓ Instant Cloud Sync Active — All laptops & phones synced"
                  : "⟳ Connecting to Cloud Database..."}
              </span>
              {lastSyncTime && (
                <span style={{ opacity: 0.9 }}>
                  • Live PSX Prices Synced at {lastSyncTime}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="btn-group">
          <button
            className="btn btn-header"
            onClick={() => {
              setActiveTab("dividends");
              setDivStatusFilter("Unpaid");
            }}
            title="View Unpaid & Announced PSX Dividends"
          >
            🔔 Unpaid Dividends ({unpaidDivCount})
          </button>
          <button
            className="btn btn-header"
            onClick={() => syncLivePsxPricesAndDividends(false)}
            disabled={syncingPsx}
          >
            {syncingPsx ? "⟳ Syncing PSX..." : "↻ Sync Live PSX Prices"}
          </button>
          <button className="btn btn-header" onClick={toggleTheme}>
            {theme === "light" ? "🌙 Dark Mode" : "☀️ Light Mode"}
          </button>
          <button className="btn btn-emerald" onClick={() => openTxModal(null)}>
            + Add Buy / Sell
          </button>
          <button className="btn btn-amber" onClick={() => openDivModal(null)}>
            + Add Dividend
          </button>
        </div>
      </header>

      {/* TOAST NOTIFICATION BANNER */}
      {toastBanner && (
        <div
          style={{
            background: "var(--pos-pill)",
            color: "var(--pos-strong)",
            borderBottom: "1px solid var(--pos-border)",
            padding: "8px 24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontWeight: 600,
            fontSize: "12.5px",
          }}
        >
          <span>{toastBanner}</span>
          <button
            onClick={() => setToastBanner(null)}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontWeight: 700,
              color: "inherit",
            }}
          >
            ✕ Dismiss
          </button>
        </div>
      )}

      {/* FAMILIAR 6-TAB NAVIGATION BAR */}
      <nav className="nav-bar">
        <div className="nav-links">
          <button
            className={`nav-btn ${activeTab === "overview" ? "active" : ""}`}
            onClick={() => setActiveTab("overview")}
          >
            Overview &amp; Charts
          </button>
          <button
            className={`nav-btn ${activeTab === "holdings" ? "active" : ""}`}
            onClick={() => setActiveTab("holdings")}
          >
            My Stocks (Prices){" "}
            <span className="count-pill">{t.activeHoldingsCount}</span>
          </button>
          <button
            className={`nav-btn ${activeTab === "transactions" ? "active" : ""}`}
            onClick={() => setActiveTab("transactions")}
          >
            Transactions{" "}
            <span className="count-pill">{computed.transactions.length}</span>
          </button>
          <button
            className={`nav-btn ${activeTab === "dividends" ? "active" : ""}`}
            onClick={() => setActiveTab("dividends")}
          >
            Dividends{" "}
            <span className="count-pill">{computed.dividends.length}</span>
          </button>
          <button
            className={`nav-btn ${activeTab === "monthly" ? "active" : ""}`}
            onClick={() => setActiveTab("monthly")}
          >
            Monthly Summary
          </button>
          <button
            className={`nav-btn ${activeTab === "research" ? "active" : ""}`}
            onClick={() => setActiveTab("research")}
          >
            PSX Stock Charts &amp; Links
          </button>
        </div>
        <div className="btn-group">
          <span className="status-pill pill-paid mono">
            +{fmtPKR(t.totalNetDivPaid, 0)} Net Paid
          </span>
        </div>
      </nav>

      {/* MAIN FULL-SCREEN-WIDTH CONTAINER */}
      <main className="container">
        {/* ===================================================================
            TAB 1: OVERVIEW & CHARTS
            =================================================================== */}
        {activeTab === "overview" && (
          <section>
            {/* 5 KPI Summary Cards */}
            <div className="kpi-row">
              <div
                className="kpi-box"
                style={{ "--kpi-color": "#2563eb" } as React.CSSProperties}
              >
                <div className="kpi-title">
                  <span>Current Portfolio Value</span>
                </div>
                <div className="kpi-main">
                  {fmtPKR(t.totalMarketValue, 0)}
                </div>
                <div className="kpi-foot">
                  <span>
                    {t.activeHoldingsCount} Active Stocks (
                    {fmtNum(t.totalActiveShares)} sh)
                  </span>
                  <span className="mono">
                    Cost: {fmtPKR(t.totalActiveCostBasis, 0)}
                  </span>
                </div>
              </div>

              <div
                className="kpi-box"
                style={{ "--kpi-color": "#4f46e5" } as React.CSSProperties}
              >
                <div className="kpi-title">
                  <span>Net Cash Invested</span>
                </div>
                <div className="kpi-main">
                  {fmtPKR(t.netCashInvested, 0)}
                </div>
                <div className="kpi-foot">
                  <span>Buys: {fmtPKR(t.totalBuyOutflow, 0)}</span>
                  <span className="mono">
                    Sells: +{fmtPKR(t.effectiveSellInflow, 0)}
                  </span>
                </div>
              </div>

              <div
                className="kpi-box"
                style={{ "--kpi-color": "#059669" } as React.CSSProperties}
              >
                <div className="kpi-title">
                  <span>Net Dividends Received</span>
                </div>
                <div className="kpi-main pos">
                  +{fmtPKR(t.totalNetDivPaid, 2)}
                </div>
                <div className="kpi-foot">
                  <span>Gross: {fmtPKR(t.totalGrossDivPaid, 0)}</span>
                  <span className="mono">
                    Tax/Zakat: -{fmtPKR(t.totalTaxWithheld, 0)}
                  </span>
                </div>
              </div>

              <div
                className="kpi-box"
                style={
                  {
                    "--kpi-color":
                      t.totalUnrealizedPnL >= 0 ? "#059669" : "#dc2626",
                  } as React.CSSProperties
                }
              >
                <div className="kpi-title">
                  <span>Unrealized Capital P&amp;L</span>
                </div>
                <div
                  className={`kpi-main ${
                    t.totalUnrealizedPnL >= 0 ? "pos" : "neg"
                  }`}
                >
                  {fmtSignedPKR(t.totalUnrealizedPnL, 0)}
                </div>
                <div className="kpi-foot">
                  <span>
                    Realized (ALTN): {fmtSignedPKR(t.totalRealizedPnL, 0)}
                  </span>
                  <span
                    className={`pnl-pill ${
                      t.totalUnrealizedPnL >= 0 ? "pnl-pos" : "pnl-neg"
                    }`}
                  >
                    {t.totalUnrealizedPct >= 0 ? "+" : ""}
                    {t.totalUnrealizedPct.toFixed(2)}%
                  </span>
                </div>
              </div>

              <div
                className="kpi-box"
                style={
                  {
                    "--kpi-color":
                      t.allInNetProfit >= 0 ? "#059669" : "#e11d48",
                  } as React.CSSProperties
                }
              >
                <div className="kpi-title">
                  <span>Total Net Return (Cap + Divs)</span>
                </div>
                <div
                  className={`kpi-main ${
                    t.allInNetProfit >= 0 ? "pos" : "neg"
                  }`}
                >
                  {fmtSignedPKR(t.allInNetProfit, 0)}
                </div>
                <div className="kpi-foot">
                  <span>
                    Reinvested: {fmtPKR(t.totalReinvestedDivNet, 0)}
                  </span>
                  <span
                    className={`pnl-pill ${
                      t.allInNetProfit >= 0 ? "pnl-pos" : "pnl-neg"
                    }`}
                  >
                    {t.allInRoiPct >= 0 ? "+" : ""}
                    {t.allInRoiPct.toFixed(2)}% ROI
                  </span>
                </div>
              </div>
            </div>

            {/* Row 1: Monthly Dividends Chart + Sector Breakdown */}
            <div className="grid-2">
              <div className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">
                      Monthly Net Dividends &amp; Cumulative Income
                    </div>
                    <div className="card-subtitle">
                      Monthly cash dividends received after WHT/Zakat vs.
                      cumulative growth curve
                    </div>
                  </div>
                </div>
                <div className="card-body">
                  <div>
                    <div className="chart-legend">
                      <span className="legend-item">
                        <span
                          className="legend-swatch"
                          style={{ background: "#10b981" }}
                        />
                        <span>Net Dividend Paid (Rs. — Left Axis)</span>
                      </span>
                      <span className="legend-item">
                        <span
                          className="legend-swatch"
                          style={{ background: "#f59e0b" }}
                        />
                        <span>WHT &amp; Zakat Tax Deducted (Stacked Top)</span>
                      </span>
                      <span className="legend-item">
                        <span
                          className="legend-line"
                          style={{ background: "#2563eb" }}
                        />
                        <span>Cumulative Net Dividends (Rs. — Right Axis)</span>
                      </span>
                    </div>
                    <MonthlyDividendsSvgChart monthly={computed.monthly} />
                  </div>
                  <MonthlyStatStrip
                    monthly={computed.monthly}
                    totals={computed.totals}
                  />
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">
                      Portfolio Allocation by PSX Sector
                    </div>
                    <div className="card-subtitle">
                      Click any sector bar to filter your holdings table
                    </div>
                  </div>
                  <select
                    className="select"
                    value={sectorSortMetric}
                    onChange={(e) =>
                      setSectorSortMetric(
                        e.target.value as typeof sectorSortMetric
                      )
                    }
                  >
                    <option value="marketValue">By Market Value</option>
                    <option value="activeCostBasis">By Cost Invested</option>
                    <option value="netDivPaid">By Net Dividends</option>
                    <option value="totalReturn">By Total Return</option>
                  </select>
                </div>
                <div
                  className="card-body"
                  style={{ justifyContent: "flex-start" }}
                >
                  {(() => {
                    const tot =
                      sectorBreakdownList.reduce(
                        (s, x) => s + Math.max(0, x[sectorSortMetric]),
                        0
                      ) || 1;
                    return sectorBreakdownList.map((s) => {
                      const val = s[sectorSortMetric];
                      const pct = Math.max(0, (val / tot) * 100);
                      const col = getSectorColor(s.sector);
                      return (
                        <div
                          key={s.sector}
                          style={{
                            padding: "6px 0",
                            borderBottom: "1px solid var(--border)",
                            cursor: "pointer",
                          }}
                          onClick={() => {
                            setHoldingsSectorFilter(s.sector);
                            setActiveTab("holdings");
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              fontSize: "12px",
                              marginBottom: "4px",
                            }}
                          >
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "7px",
                                fontWeight: 600,
                              }}
                            >
                              <span
                                style={{
                                  width: "10px",
                                  height: "10px",
                                  borderRadius: "3px",
                                  background: col,
                                  display: "inline-block",
                                }}
                              />
                              <span>{s.sector}</span>
                              <span className="muted">({s.count})</span>
                            </span>
                            <span className="mono">
                              <b>{fmtPKR(val, 0)}</b>{" "}
                              <span className="muted">
                                ({pct.toFixed(1)}%)
                              </span>
                              <span
                                className={
                                  s.totalReturn >= 0 ? "pos" : "neg"
                                }
                                style={{ marginLeft: "6px" }}
                              >
                                {fmtSignedPKR(s.totalReturn, 0)}
                              </span>
                            </span>
                          </div>
                          <div
                            style={{
                              height: "6px",
                              background: "var(--bg-subtle)",
                              borderRadius: "99px",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                width: `${Math.min(100, pct)}%`,
                                height: "100%",
                                background: col,
                                borderRadius: "99px",
                              }}
                            />
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>

            {/* Row 2: Stock Profit/Loss Leaderboard + 3D Portfolio View */}
            <div className="grid-equal">
              <div className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">
                      Stock Profit/Loss &amp; Dividend Leaderboard
                    </div>
                    <div className="card-subtitle">
                      Ranked by Total Net Return (Unrealized P&amp;L + Realized
                      P&amp;L + Net Dividends)
                    </div>
                  </div>
                </div>
                <div
                  className="table-container"
                  style={{ maxHeight: "390px", overflowY: "auto" }}
                >
                  <table>
                    <thead>
                      <tr>
                        <th>Ticker</th>
                        <th>Company</th>
                        <th className="right">Market Value</th>
                        <th className="right">Unrealized P&amp;L</th>
                        <th className="right">Net Dividends</th>
                        <th className="right">Total Return</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...computed.holdings]
                        .filter((h) => h.activeShares > 0)
                        .sort((a, b) => b.totalReturn - a.totalReturn)
                        .map((h) => (
                          <tr
                            key={h.ticker}
                            onClick={() => openStockResearch(h.ticker)}
                            style={{ cursor: "pointer" }}
                          >
                            <td
                              className="mono fw-700"
                              style={{ color: "var(--primary)" }}
                            >
                              {h.ticker}
                            </td>
                            <td className="fw-600">{h.name}</td>
                            <td className="mono right fw-600">
                              {fmtPKR(h.marketValue, 0)}
                            </td>
                            <td
                              className={`mono right ${
                                h.unrealizedPnL >= 0 ? "pos" : "neg"
                              }`}
                            >
                              {fmtSignedPKR(h.unrealizedPnL, 0)}
                            </td>
                            <td className="mono right pos">
                              {h.netDivPaid > 0
                                ? "+" + fmtPKR(h.netDivPaid, 0)
                                : "—"}
                            </td>
                            <td className="mono right">
                              <span
                                className={`pnl-pill ${
                                  h.totalReturn >= 0 ? "pnl-pos" : "pnl-neg"
                                }`}
                              >
                                {fmtSignedPKR(h.totalReturn, 0)} (
                                {h.totalReturnPct >= 0 ? "+" : ""}
                                {h.totalReturnPct.toFixed(1)}%)
                              </span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">
                      3D Portfolio Value &amp; Dividend Towers
                    </div>
                    <div className="card-subtitle">
                      Drag to rotate • Scroll to zoom • Click any 3D tower to
                      inspect stock
                    </div>
                  </div>
                </div>
                <div className="card-body">
                  <div className="chart-legend" style={{ marginBottom: "8px" }}>
                    <span className="legend-item">
                      <span
                        className="legend-swatch"
                        style={{ background: "#10b981" }}
                      />
                      <span>Tower Height = Market Value (Profitable)</span>
                    </span>
                    <span className="legend-item">
                      <span
                        className="legend-swatch"
                        style={{ background: "#f43f5e" }}
                      />
                      <span>Tower Height = Market Value (Negative P&amp;L)</span>
                    </span>
                    <span className="legend-item">
                      <span
                        className="legend-dot"
                        style={{
                          border: "2px solid #f59e0b",
                          background: "transparent",
                        }}
                      />
                      <span>Gold Halo Ring = Dividend Payer</span>
                    </span>
                  </div>
                  <div className="canvas-3d-wrap">
                    <Portfolio3DTowers
                      positions={positionsFor3D}
                      onSelectTicker={(sym) => openStockResearch(sym)}
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ===================================================================
            TAB 2: MY STOCKS (PRICES) — FULL SCREEN WIDTH, READ-ONLY LIVE PRICE
            =================================================================== */}
        {activeTab === "holdings" && (
          <section>
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">
                    My PSX Stocks, Live Read-Only Prices &amp; Returns
                  </div>
                  <div className="card-subtitle">
                    Click any column header to sort • Latest prices are fetched
                    live from PSX (read-only) • Click &quot;Chart&quot; to view
                    stock orders &amp; chart
                  </div>
                </div>
                <div className="btn-group">
                  <input
                    type="text"
                    className="input"
                    placeholder="Search ticker or company..."
                    value={holdingsSearch}
                    onChange={(e) => setHoldingsSearch(e.target.value)}
                  />
                  <select
                    className="select"
                    value={holdingsSectorFilter}
                    onChange={(e) => setHoldingsSectorFilter(e.target.value)}
                  >
                    <option value="ALL">
                      All Sectors ({allSectors.length})
                    </option>
                    {allSectors.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <select
                    className="select"
                    value={holdingsStatusFilter}
                    onChange={(e) =>
                      setHoldingsStatusFilter(
                        e.target.value as typeof holdingsStatusFilter
                      )
                    }
                  >
                    <option value="ACTIVE">
                      Active Holdings ({t.activeHoldingsCount})
                    </option>
                    <option value="ALL">
                      All Tickers ({computed.holdings.length})
                    </option>
                    <option value="CLOSED">Sold / Closed (ALTN, MCB)</option>
                  </select>
                  <button
                    className="btn btn-primary"
                    onClick={() => setCompModalOpen(true)}
                  >
                    + Add New Company
                  </button>
                </div>
              </div>

              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th onClick={() => handleSortHoldings("ticker")}>
                        Ticker ↕
                      </th>
                      <th onClick={() => handleSortHoldings("name")}>
                        Company Name ↕
                      </th>
                      <th onClick={() => handleSortHoldings("sector")}>
                        Sector ↕
                      </th>
                      <th>Div Freq</th>
                      <th
                        className="right"
                        onClick={() => handleSortHoldings("activeShares")}
                      >
                        Shares Held ↕
                      </th>
                      <th
                        className="right"
                        onClick={() => handleSortHoldings("wac")}
                      >
                        Avg Buy Price ↕
                      </th>
                      <th
                        className="right"
                        onClick={() => handleSortHoldings("price")}
                      >
                        Latest Price (Live PSX) ↕
                      </th>
                      <th
                        className="right"
                        onClick={() => handleSortHoldings("changePct")}
                      >
                        Day Chg ↕
                      </th>
                      <th
                        className="right"
                        onClick={() => handleSortHoldings("activeCostBasis")}
                      >
                        Total Cost ↕
                      </th>
                      <th
                        className="right"
                        onClick={() => handleSortHoldings("marketValue")}
                      >
                        Market Value ↕
                      </th>
                      <th
                        className="right"
                        onClick={() => handleSortHoldings("weight")}
                      >
                        Weight % ↕
                      </th>
                      <th
                        className="right"
                        onClick={() => handleSortHoldings("unrealizedPnL")}
                      >
                        Unrealized P&amp;L ↕
                      </th>
                      <th
                        className="right"
                        onClick={() => handleSortHoldings("netDivPaid")}
                      >
                        Net Dividends ↕
                      </th>
                      <th
                        className="right"
                        onClick={() => handleSortHoldings("totalReturn")}
                      >
                        Total Return ↕
                      </th>
                      <th className="center">Chart</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHoldings.map((h) => {
                      const secCol = getSectorColor(h.sector);
                      const dayCls =
                        h.change > 0 ? "pos" : h.change < 0 ? "neg" : "muted";
                      const priceVsWacCls =
                        h.wac > 0 ? (h.price >= h.wac ? "pos" : "neg") : "";
                      return (
                        <tr key={h.ticker}>
                          <td
                            className="mono fw-700"
                            style={{
                              cursor: "pointer",
                              color: "var(--primary)",
                            }}
                            onClick={() => openStockResearch(h.ticker)}
                          >
                            {h.ticker}
                          </td>
                          <td className="fw-600">{h.name}</td>
                          <td>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "5px",
                                fontSize: "11px",
                                fontWeight: 600,
                                padding: "2px 8px",
                                borderRadius: "4px",
                                background: `${secCol}18`,
                                color: secCol,
                                border: `1px solid ${secCol}40`,
                              }}
                            >
                              {h.sector}
                            </span>
                          </td>
                          <td>{h.frequency}</td>
                          <td className="mono right fw-600">
                            {fmtNum(h.activeShares)}
                          </td>
                          <td className="mono right">
                            {h.wac > 0 ? "Rs. " + h.wac.toFixed(2) : "—"}
                          </td>
                          <td
                            className={`mono right fw-700 ${priceVsWacCls}`}
                            title="Live PSX Market Price (Read-Only)"
                          >
                            Rs. {h.price.toFixed(2)}
                          </td>
                          <td className={`mono right ${dayCls}`}>
                            {h.change >= 0 ? "+" : ""}
                            {h.changePct.toFixed(2)}%
                          </td>
                          <td className="mono right">
                            {fmtPKR(h.activeCostBasis, 0)}
                          </td>
                          <td className="mono right fw-700">
                            {fmtPKR(h.marketValue, 0)}
                          </td>
                          <td className="mono right">
                            {h.weight.toFixed(1)}%
                          </td>
                          <td
                            className={`mono right ${
                              h.unrealizedPnL >= 0 ? "pos" : "neg"
                            }`}
                          >
                            {fmtSignedPKR(h.unrealizedPnL, 0)} (
                            {h.unrealizedPct >= 0 ? "+" : ""}
                            {h.unrealizedPct.toFixed(1)}%)
                          </td>
                          <td className="mono right pos">
                            {h.netDivPaid > 0
                              ? "+" + fmtPKR(h.netDivPaid, 0)
                              : "—"}
                          </td>
                          <td className="mono right">
                            <span
                              className={`pnl-pill ${
                                h.totalReturn >= 0 ? "pnl-pos" : "pnl-neg"
                              }`}
                            >
                              {fmtSignedPKR(h.totalReturn, 0)} (
                              {h.totalReturnPct >= 0 ? "+" : ""}
                              {h.totalReturnPct.toFixed(1)}%)
                            </span>
                          </td>
                          <td className="center">
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => openStockResearch(h.ticker)}
                            >
                              Chart
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    {(() => {
                      const sumSh = filteredHoldings.reduce(
                        (s, r) => s + r.activeShares,
                        0
                      );
                      const sumCost = filteredHoldings.reduce(
                        (s, r) => s + r.activeCostBasis,
                        0
                      );
                      const sumMV = filteredHoldings.reduce(
                        (s, r) => s + r.marketValue,
                        0
                      );
                      const sumUnreal = filteredHoldings.reduce(
                        (s, r) => s + r.unrealizedPnL,
                        0
                      );
                      const sumDiv = filteredHoldings.reduce(
                        (s, r) => s + r.netDivPaid,
                        0
                      );
                      const sumRet = filteredHoldings.reduce(
                        (s, r) => s + r.totalReturn,
                        0
                      );
                      return (
                        <tr>
                          <td colSpan={4}>
                            Total ({filteredHoldings.length} Stocks)
                          </td>
                          <td className="mono right">{fmtNum(sumSh)}</td>
                          <td colSpan={3} />
                          <td className="mono right">{fmtPKR(sumCost, 0)}</td>
                          <td className="mono right">{fmtPKR(sumMV, 0)}</td>
                          <td className="mono right">100%</td>
                          <td
                            className={`mono right ${
                              sumUnreal >= 0 ? "pos" : "neg"
                            }`}
                          >
                            {fmtSignedPKR(sumUnreal, 0)}
                          </td>
                          <td className="mono right pos">
                            +{fmtPKR(sumDiv, 0)}
                          </td>
                          <td
                            className={`mono right ${
                              sumRet >= 0 ? "pos" : "neg"
                            }`}
                          >
                            {fmtSignedPKR(sumRet, 0)}
                          </td>
                          <td />
                        </tr>
                      );
                    })()}
                  </tfoot>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ===================================================================
            TAB 3: TRANSACTIONS — FULL SCREEN WIDTH + POPUP MODAL BUTTON
            =================================================================== */}
        {activeTab === "transactions" && (
          <section>
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">
                    Buy &amp; Sell Transactions Log (
                    {computed.transactions.length} Total)
                  </div>
                  <div className="card-subtitle">
                    Complete chronological history with brokerage fees, 15% SST,
                    and running Weighted Average Cost (WAC)
                  </div>
                </div>
                <div className="btn-group">
                  <input
                    type="text"
                    className="input"
                    placeholder="Filter ticker, notes..."
                    value={txSearch}
                    onChange={(e) => setTxSearch(e.target.value)}
                  />
                  <select
                    className="select"
                    value={txActionFilter}
                    onChange={(e) =>
                      setTxActionFilter(
                        e.target.value as typeof txActionFilter
                      )
                    }
                  >
                    <option value="ALL">All (Buy &amp; Sell)</option>
                    <option value="Buy">Buys Only</option>
                    <option value="Sell">Sells Only</option>
                  </select>
                  <select
                    className="select"
                    value={txMonthFilter}
                    onChange={(e) => setTxMonthFilter(e.target.value)}
                  >
                    <option value="ALL">All Months</option>
                    {computed.monthly.map((m) => (
                      <option key={m.ym} value={m.ym}>
                        {m.ym}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn btn-emerald"
                    onClick={() => openTxModal(null)}
                  >
                    + Add Buy / Sell
                  </button>
                </div>
              </div>

              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Month</th>
                      <th>Ticker</th>
                      <th>Company</th>
                      <th>Action</th>
                      <th className="right">Shares</th>
                      <th className="right">Price / Share</th>
                      <th className="right">Gross Amount</th>
                      <th className="right">Brk Fees</th>
                      <th className="right">SST</th>
                      <th className="right">Net Cash Flow</th>
                      <th className="right">Avg Buy Price</th>
                      <th>Notes</th>
                      <th className="center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.map((tx) => (
                      <tr key={tx.id}>
                        <td className="mono">{tx.date}</td>
                        <td className="mono muted">{tx.ym}</td>
                        <td
                          className="mono fw-700"
                          style={{
                            color: "var(--primary)",
                            cursor: "pointer",
                          }}
                          onClick={() => openStockResearch(tx.ticker)}
                        >
                          {tx.ticker}
                        </td>
                        <td className="fw-600">{tx.company}</td>
                        <td>
                          <span
                            className={`status-pill ${
                              tx.action === "Buy" ? "pill-buy" : "pill-sell"
                            }`}
                          >
                            {tx.action}
                          </span>
                        </td>
                        <td className="mono right fw-600">
                          {fmtNum(tx.shares)}
                        </td>
                        <td className="mono right">
                          Rs. {tx.price.toFixed(2)}
                        </td>
                        <td className="mono right">
                          {fmtPKR(tx.grossAmount, 2)}
                        </td>
                        <td className="mono right muted">
                          {tx.brkFees.toFixed(2)}
                        </td>
                        <td className="mono right muted">
                          {tx.sst.toFixed(2)}
                        </td>
                        <td
                          className={`mono right ${
                            tx.netCashFlow >= 0 ? "pos" : "neg"
                          }`}
                        >
                          {fmtSignedPKR(tx.netCashFlow, 2)}
                        </td>
                        <td className="mono right">
                          Rs. {tx.runningWac.toFixed(2)}
                        </td>
                        <td>
                          {tx.notes ? (
                            <span className="status-pill pill-drip">
                              {tx.notes}
                            </span>
                          ) : (
                            ""
                          )}
                        </td>
                        <td className="center">
                          <div
                            style={{
                              display: "inline-flex",
                              gap: "5px",
                            }}
                          >
                            <button
                              className="btn btn-sm"
                              onClick={() => openTxModal(tx.id)}
                            >
                              Edit
                            </button>
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={() => deleteTransaction(tx.id)}
                            >
                              Del
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    {(() => {
                      const sumGross = filteredTransactions.reduce(
                        (s, tx) => s + tx.grossAmount,
                        0
                      );
                      const sumBrk = filteredTransactions.reduce(
                        (s, tx) => s + tx.brkFees,
                        0
                      );
                      const sumSst = filteredTransactions.reduce(
                        (s, tx) => s + tx.sst,
                        0
                      );
                      const sumNet = filteredTransactions.reduce(
                        (s, tx) => s + tx.netCashFlow,
                        0
                      );
                      return (
                        <tr>
                          <td colSpan={7}>
                            Total ({filteredTransactions.length} Transactions)
                          </td>
                          <td className="mono right">{fmtPKR(sumGross, 2)}</td>
                          <td className="mono right">{fmtPKR(sumBrk, 2)}</td>
                          <td className="mono right">{fmtPKR(sumSst, 2)}</td>
                          <td
                            className={`mono right ${
                              sumNet >= 0 ? "pos" : "neg"
                            }`}
                          >
                            {fmtSignedPKR(sumNet, 2)}
                          </td>
                          <td colSpan={3} />
                        </tr>
                      );
                    })()}
                  </tfoot>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ===================================================================
            TAB 4: DIVIDENDS — FULL SCREEN WIDTH + PSX MONITOR + POPUP MODAL
            =================================================================== */}
        {activeTab === "dividends" && (
          <section>
            {/* Automated PSX Dividend Announcements Monitor Card */}
            {announcements.filter(
              (a) => a.isDividend && !a.addedToDividends && (a.parsedDps || 0) > 0
            ).length > 0 && (
              <div
                className="card"
                style={{
                  borderTop: "4px solid #d97706",
                  marginBottom: "18px",
                }}
              >
                <div className="card-header">
                  <div>
                    <div className="card-title">
                      🔔 PSX Live Dividend Announcements Detected (
                      {
                        announcements.filter(
                          (a) =>
                            a.isDividend &&
                            !a.addedToDividends &&
                            (a.parsedDps || 0) > 0
                        ).length
                      }{" "}
                      New)
                    </div>
                    <div className="card-subtitle">
                      Automatically monitored from official Pakistan Stock
                      Exchange company notices — Click &quot;+ Queue Unpaid
                      Dividend&quot; to add to your ledger
                    </div>
                  </div>
                </div>
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Ticker</th>
                        <th>Announcement Title</th>
                        <th>Period</th>
                        <th className="right">Announced DPS</th>
                        <th>Announcement Date</th>
                        <th className="right">Your Eligible Shares</th>
                        <th className="center">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {announcements
                        .filter(
                          (a) =>
                            a.isDividend &&
                            !a.addedToDividends &&
                            (a.parsedDps || 0) > 0
                        )
                        .map((ann) => {
                          const sh =
                            computed.compMap[ann.ticker]?.activeShares || 0;
                          return (
                            <tr key={ann.id} className="div-unpaid-row">
                              <td
                                className="mono fw-700"
                                style={{ color: "var(--primary)" }}
                              >
                                {ann.ticker}
                              </td>
                              <td className="fw-600">{ann.title}</td>
                              <td className="mono">
                                {ann.parsedYear} {ann.parsedTerm}
                              </td>
                              <td className="mono right fw-700">
                                Rs. {(ann.parsedDps || 0).toFixed(2)}
                              </td>
                              <td className="mono">{ann.announcementDate}</td>
                              <td className="mono right">{fmtNum(sh)} sh</td>
                              <td className="center">
                                <button
                                  className="btn btn-sm btn-amber"
                                  onClick={() =>
                                    queueAnnouncementAsUnpaidDividend(ann)
                                  }
                                >
                                  + Queue Unpaid Dividend
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">
                    Dividend Entitlements, Tax Withholding &amp; DRIP
                    Reinvestment Tracker ({computed.dividends.length} Total)
                  </div>
                  <div className="card-subtitle">
                    Green rows = Paid • Amber rows = Unpaid (Click any{" "}
                    <b>Unpaid</b> status pill when paid to set the payment date
                    &amp; mark it Paid)
                  </div>
                </div>
                <div className="btn-group">
                  <input
                    type="text"
                    className="input"
                    placeholder="Filter ticker, term..."
                    value={divSearch}
                    onChange={(e) => setDivSearch(e.target.value)}
                  />
                  <select
                    className="select"
                    value={divStatusFilter}
                    onChange={(e) =>
                      setDivStatusFilter(
                        e.target.value as typeof divStatusFilter
                      )
                    }
                  >
                    <option value="ALL">
                      All Statuses ({computed.dividends.length})
                    </option>
                    <option value="Paid">
                      Paid Only ({computed.dividends.length - unpaidDivCount})
                    </option>
                    <option value="Unpaid">
                      Unpaid Only ({unpaidDivCount})
                    </option>
                  </select>
                  <select
                    className="select"
                    value={divReinvFilter}
                    onChange={(e) =>
                      setDivReinvFilter(
                        e.target.value as typeof divReinvFilter
                      )
                    }
                  >
                    <option value="ALL">All (Reinvest &amp; Cash)</option>
                    <option value="Yes">Reinvested (DRIP)</option>
                    <option value="No">Cash Retained</option>
                  </select>
                  <button
                    className="btn btn-amber"
                    onClick={() => openDivModal(null)}
                  >
                    + Add Dividend
                  </button>
                </div>
              </div>

              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Payment Date</th>
                      <th>Month</th>
                      <th>Ticker</th>
                      <th>Company</th>
                      <th>Year</th>
                      <th>Term</th>
                      <th className="center">Status</th>
                      <th className="right">Eligible Shares</th>
                      <th className="right">Div / Share</th>
                      <th className="right">Gross Dividend</th>
                      <th className="right">WHT</th>
                      <th className="right">Zakat</th>
                      <th className="right">Net Dividend</th>
                      <th className="center">Reinvest?</th>
                      <th>Reinvestment Details</th>
                      <th className="center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDividends.map((d) => {
                      const rowCls =
                        d.status === "Paid"
                          ? "div-paid-row"
                          : "div-unpaid-row";
                      const pillCls =
                        d.status === "Paid" ? "pill-paid" : "pill-unpaid";
                      return (
                        <tr key={d.id} className={rowCls}>
                          <td className="mono">{d.paymentDate}</td>
                          <td className="mono muted">{d.ym}</td>
                          <td
                            className="mono fw-700"
                            style={{
                              color: "var(--primary)",
                              cursor: "pointer",
                            }}
                            onClick={() => openStockResearch(d.ticker)}
                          >
                            {d.ticker}
                          </td>
                          <td className="fw-600">{d.company}</td>
                          <td className="mono">{d.year}</td>
                          <td className="mono">{d.term}</td>
                          <td className="center">
                            <span
                              className={`status-pill ${pillCls}`}
                              style={{ cursor: "pointer" }}
                              onClick={() => handleStatusPillClick(d)}
                              title={
                                d.status === "Unpaid"
                                  ? "Click to mark Paid & set payment date"
                                  : "Click to mark Unpaid"
                              }
                            >
                              {d.status === "Unpaid"
                                ? "⏳ Unpaid (Mark Paid)"
                                : "✓ Paid"}
                            </span>
                          </td>
                          <td className="mono right">
                            {fmtNum(d.sharesEligible)}
                          </td>
                          <td className="mono right">
                            Rs. {d.dps.toFixed(2)}
                          </td>
                          <td className="mono right fw-600">
                            {fmtPKR(d.grossDividend, 2)}
                          </td>
                          <td className="mono right neg">
                            -{fmtPKR(d.wht, 2)}
                          </td>
                          <td
                            className={`mono right ${
                              d.zakat > 0 ? "neg" : "muted"
                            }`}
                          >
                            {d.zakat > 0 ? "-" + fmtPKR(d.zakat, 2) : "0.00"}
                          </td>
                          <td className="mono right pos">
                            +{fmtPKR(d.netDividend, 2)}
                          </td>
                          <td className="center">
                            {d.reinvest === "Yes" ? (
                              <span className="status-pill pill-drip">Yes</span>
                            ) : (
                              "No"
                            )}
                          </td>
                          <td>
                            {d.reinvest === "Yes" ? (
                              d.matchedDripTx ? (
                                <span className="status-pill pill-drip">
                                  Bought {d.matchedDripTx.shares} sh @ Rs.
                                  {d.matchedDripTx.price} (
                                  {d.matchedDripTx.date})
                                </span>
                              ) : (
                                <span className="status-pill pill-drip">
                                  Reinvested
                                </span>
                              )
                            ) : (
                              <span className="muted">Cash Retained</span>
                            )}
                          </td>
                          <td className="center">
                            <div
                              style={{
                                display: "inline-flex",
                                gap: "5px",
                              }}
                            >
                              <button
                                className="btn btn-sm"
                                onClick={() => openDivModal(d.id)}
                              >
                                Edit
                              </button>
                              <button
                                className="btn btn-sm btn-danger"
                                onClick={() => deleteDividend(d.id)}
                              >
                                Del
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    {(() => {
                      const sumGross = filteredDividends.reduce(
                        (s, d) => s + d.grossDividend,
                        0
                      );
                      const sumWht = filteredDividends.reduce(
                        (s, d) => s + d.wht,
                        0
                      );
                      const sumZakat = filteredDividends.reduce(
                        (s, d) => s + d.zakat,
                        0
                      );
                      const sumNet = filteredDividends.reduce(
                        (s, d) => s + d.netDividend,
                        0
                      );
                      return (
                        <tr>
                          <td colSpan={9}>
                            Total ({filteredDividends.length} Dividend Records)
                          </td>
                          <td className="mono right">{fmtPKR(sumGross, 2)}</td>
                          <td className="mono right neg">
                            -{fmtPKR(sumWht, 2)}
                          </td>
                          <td className="mono right neg">
                            -{fmtPKR(sumZakat, 2)}
                          </td>
                          <td className="mono right pos">
                            +{fmtPKR(sumNet, 2)}
                          </td>
                          <td colSpan={3} />
                        </tr>
                      );
                    })()}
                  </tfoot>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ===================================================================
            TAB 5: MONTHLY SUMMARY & DIVIDEND PAYOUT CALENDAR MATRIX
            =================================================================== */}
        {activeTab === "monthly" && (
          <section>
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">
                    Monthly Investment &amp; Dividend Summary
                  </div>
                  <div className="card-subtitle">
                    Exact monthly breakdown of capital invested, sales proceeds,
                    gross dividends, taxes withheld, and net dividend yield
                  </div>
                </div>
                <label
                  style={{
                    fontSize: "12px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={
                      state.settings?.includeLegacyMcbInCashflow !== false
                    }
                    onChange={(e) => toggleMcbLegacySetting(e.target.checked)}
                  />
                  Include MCB Legacy Sale (+Rs. 78,315 on Nov 25, 2025)
                </label>
              </div>

              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th className="right">Shares Purchased (Cost)</th>
                      <th className="right">Shares Sold (Proceeds)</th>
                      <th className="right">Net Cash Invested</th>
                      <th className="right">Gross Dividend</th>
                      <th className="right">WHT Deducted</th>
                      <th className="right">Zakat Deducted</th>
                      <th className="right">Net Dividend Paid</th>
                      <th className="right">Monthly Div Yield</th>
                      <th className="right">Dividends Reinvested</th>
                    </tr>
                  </thead>
                  <tbody>
                    {computed.monthly.map((m) => {
                      const includeLegacy =
                        state.settings?.includeLegacyMcbInCashflow !== false;
                      const sellIn = includeLegacy
                        ? m.sellInflow
                        : m.sellInflowExLegacy;
                      const netInv = m.buyOutflow - sellIn;
                      const totMV = t.totalMarketValue || 1;
                      const yld = (m.netDiv / totMV) * 100;
                      return (
                        <tr key={m.ym}>
                          <td
                            className="mono fw-700"
                            style={{ color: "var(--primary)" }}
                          >
                            {m.ym}
                          </td>
                          <td
                            className={`mono right ${
                              m.buyOutflow > 0 ? "neg" : "muted"
                            }`}
                          >
                            {m.buyOutflow > 0
                              ? "-" + fmtPKR(m.buyOutflow, 2)
                              : "Rs. 0.00"}
                          </td>
                          <td
                            className={`mono right ${
                              sellIn > 0 ? "pos" : "muted"
                            }`}
                          >
                            {sellIn > 0
                              ? "+" + fmtPKR(sellIn, 2)
                              : "Rs. 0.00"}
                          </td>
                          <td className="mono right fw-600">
                            {fmtPKR(netInv, 2)}
                          </td>
                          <td className="mono right">
                            {fmtPKR(m.grossDiv, 2)}
                          </td>
                          <td
                            className={`mono right ${
                              m.wht > 0 ? "neg" : "muted"
                            }`}
                          >
                            {m.wht > 0 ? "-" + fmtPKR(m.wht, 2) : "Rs. 0.00"}
                          </td>
                          <td
                            className={`mono right ${
                              m.zakat > 0 ? "neg" : "muted"
                            }`}
                          >
                            {m.zakat > 0
                              ? "-" + fmtPKR(m.zakat, 2)
                              : "Rs. 0.00"}
                          </td>
                          <td
                            className={`mono right ${
                              m.netDiv > 0 ? "pos" : "muted"
                            }`}
                          >
                            {m.netDiv > 0
                              ? "+" + fmtPKR(m.netDiv, 2)
                              : "Rs. 0.00"}
                          </td>
                          <td className="mono right">{yld.toFixed(2)}%</td>
                          <td
                            className="mono right"
                            style={{
                              color: "var(--purple)",
                              fontWeight: 600,
                            }}
                          >
                            {m.reinvValue > 0
                              ? fmtPKR(m.reinvValue, 2)
                              : "Rs. 0.00"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Total</td>
                      <td className="mono right neg">
                        -{fmtPKR(t.totalBuyOutflow, 2)}
                      </td>
                      <td className="mono right pos">
                        +{fmtPKR(t.effectiveSellInflow, 2)}
                      </td>
                      <td className="mono right">
                        {fmtPKR(t.netCashInvested, 2)}
                      </td>
                      <td className="mono right">
                        {fmtPKR(t.totalGrossDivPaid, 2)}
                      </td>
                      <td className="mono right neg">
                        -{fmtPKR(t.totalWhtPaid, 2)}
                      </td>
                      <td className="mono right neg">
                        -{fmtPKR(t.totalZakatPaid, 2)}
                      </td>
                      <td className="mono right pos">
                        +{fmtPKR(t.totalNetDivPaid, 2)}
                      </td>
                      <td className="mono right">
                        {(
                          (t.totalNetDivPaid / (t.totalMarketValue || 1)) *
                          100
                        ).toFixed(2)}
                        %
                      </td>
                      <td
                        className="mono right"
                        style={{ color: "var(--purple)" }}
                      >
                        {fmtPKR(t.totalReinvestedDivNet, 2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Dividend Payout Calendar Matrix */}
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">
                    Dividend Payout Calendar by Stock (Jan – Dec)
                  </div>
                  <div className="card-subtitle">
                    See which months each PSX company pays dividends into your
                    account
                  </div>
                </div>
              </div>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Ticker</th>
                      <th>Company</th>
                      <th>Frequency</th>
                      {[
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
                      ].map((m) => (
                        <th key={m} className="right">
                          {m}
                        </th>
                      ))}
                      <th className="right">Total Net Div</th>
                    </tr>
                  </thead>
                  <tbody>
                    {computed.holdings
                      .filter(
                        (h) => h.netDivPaid > 0 || h.frequency !== "None"
                      )
                      .map((h) => {
                        const mVals = new Array(12).fill(0);
                        h.divRecords
                          .filter((d) => d.status === "Paid")
                          .forEach((d) => {
                            const idx =
                              parseInt(d.paymentDate.slice(5, 7), 10) - 1;
                            if (idx >= 0 && idx < 12)
                              mVals[idx] += d.netDividend;
                          });
                        return (
                          <tr key={h.ticker}>
                            <td
                              className="mono fw-700"
                              style={{
                                color: "var(--primary)",
                                cursor: "pointer",
                              }}
                              onClick={() => openStockResearch(h.ticker)}
                            >
                              {h.ticker}
                            </td>
                            <td className="fw-600">{h.name}</td>
                            <td>{h.frequency}</td>
                            {mVals.map((v, idx) => (
                              <td
                                key={idx}
                                className={`mono right ${
                                  v > 0 ? "pos" : "muted"
                                }`}
                              >
                                {v > 0
                                  ? "+" + Math.round(v).toLocaleString()
                                  : "—"}
                              </td>
                            ))}
                            <td className="mono right pos">
                              +{fmtPKR(h.netDivPaid, 0)}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ===================================================================
            TAB 6: PSX STOCK CHARTS & LINKS
            =================================================================== */}
        {activeTab === "research" && selectedStock && (
          <section>
            <div className="card">
              <div className="card-header">
                <div className="btn-group">
                  <label className="fw-700">Select PSX Stock:</label>
                  <select
                    className="select"
                    value={researchTicker}
                    onChange={(e) => setResearchTicker(e.target.value)}
                  >
                    {sortedTickers.map((h) => (
                      <option key={h.ticker} value={h.ticker}>
                        {h.ticker} — {h.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className={
                      researchChartMode === "custom"
                        ? "btn btn-sm btn-primary"
                        : "btn btn-sm"
                    }
                    onClick={() => setResearchChartMode("custom")}
                  >
                    📊 Position &amp; Price Chart
                  </button>
                  <button
                    className={
                      researchChartMode === "psx"
                        ? "btn btn-sm btn-primary"
                        : "btn btn-sm"
                    }
                    onClick={() => setResearchChartMode("psx")}
                  >
                    🏛️ Live Official PSX Portal Page
                  </button>
                </div>
                <div className="btn-group">
                  <a
                    className="btn btn-sm btn-primary"
                    href={`https://www.tradingview.com/chart/?symbol=PSX%3A${selectedStock.ticker}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    📈 Open PSX:{selectedStock.ticker} on TradingView ↗
                  </a>
                  <a
                    className="btn btn-sm"
                    href={`https://dps.psx.com.pk/company/${selectedStock.ticker}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    🏛️ Official PSX Page ({selectedStock.ticker}) ↗
                  </a>
                  <a
                    className="btn btn-sm"
                    href={`https://sarmaya.pk/psx/stock/${selectedStock.ticker}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    💎 Sarmaya.pk ↗
                  </a>
                </div>
              </div>

              {/* Selected Stock KPI Strip */}
              <div
                style={{
                  padding: "14px 20px",
                  borderBottom: "1px solid var(--border)",
                  background: "var(--bg-subtle)",
                }}
              >
                <div className="kpi-row" style={{ marginBottom: 0 }}>
                  <div
                    className="kpi-box"
                    style={
                      {
                        padding: "12px 16px",
                        "--kpi-color": "#2563eb",
                      } as React.CSSProperties
                    }
                  >
                    <div className="kpi-title">Live PSX Price</div>
                    <div className="kpi-main" style={{ fontSize: "19px" }}>
                      Rs. {selectedStock.price.toFixed(2)}
                    </div>
                    <div className="kpi-foot">
                      <span>LDCP: Rs.{selectedStock.ldcp.toFixed(2)}</span>
                      <span
                        className={selectedStock.change >= 0 ? "pos" : "neg"}
                      >
                        {selectedStock.change >= 0 ? "+" : ""}
                        {selectedStock.changePct.toFixed(2)}%
                      </span>
                    </div>
                  </div>

                  <div
                    className="kpi-box"
                    style={
                      {
                        padding: "12px 16px",
                        "--kpi-color": "#d97706",
                      } as React.CSSProperties
                    }
                  >
                    <div className="kpi-title">Your Avg Buy Price</div>
                    <div className="kpi-main" style={{ fontSize: "19px" }}>
                      Rs. {selectedStock.wac.toFixed(2)}
                    </div>
                    <div className="kpi-foot">
                      <span>Shares Held</span>
                      <span className="mono fw-700">
                        {fmtNum(selectedStock.activeShares)} sh
                      </span>
                    </div>
                  </div>

                  <div
                    className="kpi-box"
                    style={
                      {
                        padding: "12px 16px",
                        "--kpi-color": "#4f46e5",
                      } as React.CSSProperties
                    }
                  >
                    <div className="kpi-title">Market Value</div>
                    <div className="kpi-main" style={{ fontSize: "19px" }}>
                      {fmtPKR(selectedStock.marketValue, 0)}
                    </div>
                    <div className="kpi-foot">
                      <span>Cost Basis</span>
                      <span className="mono">
                        {fmtPKR(selectedStock.activeCostBasis, 0)}
                      </span>
                    </div>
                  </div>

                  <div
                    className="kpi-box"
                    style={
                      {
                        padding: "12px 16px",
                        "--kpi-color":
                          selectedStock.unrealizedPnL >= 0
                            ? "#059669"
                            : "#dc2626",
                      } as React.CSSProperties
                    }
                  >
                    <div className="kpi-title">Unrealized P&amp;L</div>
                    <div
                      className={`kpi-main ${
                        selectedStock.unrealizedPnL >= 0 ? "pos" : "neg"
                      }`}
                      style={{ fontSize: "19px" }}
                    >
                      {fmtSignedPKR(selectedStock.unrealizedPnL, 0)}
                    </div>
                    <div className="kpi-foot">
                      <span>Return %</span>
                      <span
                        className={
                          selectedStock.unrealizedPnL >= 0 ? "pos" : "neg"
                        }
                      >
                        {selectedStock.unrealizedPct >= 0 ? "+" : ""}
                        {selectedStock.unrealizedPct.toFixed(2)}%
                      </span>
                    </div>
                  </div>

                  <div
                    className="kpi-box"
                    style={
                      {
                        padding: "12px 16px",
                        "--kpi-color": "#059669",
                      } as React.CSSProperties
                    }
                  >
                    <div className="kpi-title">Net Dividends + Cap P&amp;L</div>
                    <div
                      className={`kpi-main ${
                        selectedStock.totalReturn >= 0 ? "pos" : "neg"
                      }`}
                      style={{ fontSize: "19px" }}
                    >
                      {fmtSignedPKR(selectedStock.totalReturn, 0)}
                    </div>
                    <div className="kpi-foot">
                      <span>Net Divs Paid</span>
                      <span className="pos">
                        +{fmtPKR(selectedStock.netDivPaid, 0)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Chart or Official PSX Portal iframe */}
              {researchChartMode === "psx" ? (
                <div style={{ padding: 0 }}>
                  <iframe
                    src={`https://dps.psx.com.pk/company/${selectedStock.ticker}`}
                    style={{
                      width: "100%",
                      height: "480px",
                      border: "none",
                    }}
                    title={`PSX ${selectedStock.ticker}`}
                  />
                </div>
              ) : (
                <div className="card-body" style={{ minHeight: "380px" }}>
                  <StockPositionSvgChart stock={selectedStock} />
                </div>
              )}
            </div>

            {/* Side-by-Side Buy/Sell Lots & Dividend History for Selected Stock */}
            <div className="grid-equal">
              <div className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">
                      Buy / Sell Orders for {selectedStock.ticker} (
                      {selectedStock.lots.length})
                    </div>
                    <div className="card-subtitle">
                      Every purchase lot vs. current market price and Average
                      Buy Price (WAC)
                    </div>
                  </div>
                </div>
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Action</th>
                        <th className="right">Shares</th>
                        <th className="right">Trade Price</th>
                        <th className="right">Current vs Trade</th>
                        <th className="right">Net Cash Flow</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedStock.lots.map((l) => {
                        const diffPerSh = selectedStock.price - l.price;
                        const lotPnl =
                          l.action === "Buy" ? diffPerSh * l.shares : 0;
                        return (
                          <tr key={l.id}>
                            <td className="mono">{l.date}</td>
                            <td>
                              <span
                                className={`status-pill ${
                                  l.action === "Buy" ? "pill-buy" : "pill-sell"
                                }`}
                              >
                                {l.action}
                              </span>
                            </td>
                            <td className="mono right fw-600">
                              {fmtNum(l.shares)}
                            </td>
                            <td className="mono right">
                              Rs. {l.price.toFixed(2)}
                            </td>
                            <td
                              className={`mono right ${
                                lotPnl >= 0 ? "pos" : "neg"
                              }`}
                            >
                              {l.action === "Buy"
                                ? fmtSignedPKR(lotPnl, 0)
                                : "—"}
                            </td>
                            <td
                              className={`mono right ${
                                l.netCashFlow >= 0 ? "pos" : "neg"
                              }`}
                            >
                              {fmtSignedPKR(l.netCashFlow, 2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">
                      Dividends Received for {selectedStock.ticker} (
                      {selectedStock.divRecords.length})
                    </div>
                    <div className="card-subtitle">
                      Historical dividend payouts and tax deductions for this
                      stock
                    </div>
                  </div>
                </div>
                <div className="table-container">
                  {selectedStock.divRecords.length > 0 ? (
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Period</th>
                          <th className="center">Status</th>
                          <th className="right">Shares</th>
                          <th className="right">DPS</th>
                          <th className="right">WHT/Zakat</th>
                          <th className="right">Net Dividend</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedStock.divRecords.map((d) => (
                          <tr
                            key={d.id}
                            className={
                              d.status === "Paid"
                                ? "div-paid-row"
                                : "div-unpaid-row"
                            }
                          >
                            <td className="mono">{d.paymentDate}</td>
                            <td className="mono">
                              {d.year} {d.term}
                            </td>
                            <td className="center">
                              <span
                                className={`status-pill ${
                                  d.status === "Paid"
                                    ? "pill-paid"
                                    : "pill-unpaid"
                                }`}
                              >
                                {d.status}
                              </span>
                            </td>
                            <td className="mono right">
                              {fmtNum(d.sharesEligible)}
                            </td>
                            <td className="mono right">
                              Rs. {d.dps.toFixed(2)}
                            </td>
                            <td className="mono right neg">
                              -{fmtPKR(d.wht + d.zakat, 0)}
                            </td>
                            <td className="mono right pos">
                              +{fmtPKR(d.netDividend, 2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div
                      style={{
                        padding: "24px",
                        color: "var(--text-muted)",
                        textAlign: "center",
                      }}
                    >
                      No dividend payouts recorded yet for{" "}
                      {selectedStock.ticker}.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* =====================================================================
          POPUP MODAL 1: ADD / EDIT BUY OR SELL TRANSACTION
          ===================================================================== */}
      {txModalOpen && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setTxModalOpen(false);
          }}
        >
          <div className="modal-box">
            <div className="card-header">
              <div className="card-title">
                {txEditId !== null
                  ? "Edit Buy / Sell Transaction"
                  : "Add Buy / Sell Transaction"}
              </div>
              <button
                className="btn btn-sm"
                onClick={() => setTxModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="card-body">
              <div className="form-grid">
                <div className="form-field">
                  <label>Trade Date</label>
                  <input
                    type="date"
                    className="input mono"
                    value={txDate}
                    onChange={(e) => setTxDate(e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label>Ticker Symbol</label>
                  <select
                    className="select"
                    value={txTicker}
                    onChange={(e) => handleTxTickerChange(e.target.value)}
                  >
                    {sortedTickers.map((h) => (
                      <option key={h.ticker} value={h.ticker}>
                        {h.ticker} — {h.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label>Action (Buy / Sell)</label>
                  <select
                    className="select"
                    value={txAction}
                    onChange={(e) =>
                      setTxAction(e.target.value as "Buy" | "Sell")
                    }
                  >
                    <option value="Buy">Buy (Add Shares)</option>
                    <option value="Sell">Sell (Reduce Shares)</option>
                  </select>
                </div>
                <div className="form-field">
                  <label>Notes (e.g. Dividend Reinvest, IPO, Stock Splits)</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Dividend Reinvest / IPO"
                    value={txNotes}
                    onChange={(e) =>
                      handleTxSharesOrPriceOrNotesChange(
                        txShares,
                        txPrice,
                        e.target.value
                      )
                    }
                  />
                </div>
                <div className="form-field">
                  <label>Number of Shares</label>
                  <input
                    type="number"
                    step="1"
                    className="input mono"
                    placeholder="e.g. 100"
                    value={txShares}
                    onChange={(e) =>
                      handleTxSharesOrPriceOrNotesChange(
                        e.target.value,
                        txPrice,
                        txNotes
                      )
                    }
                  />
                </div>
                <div className="form-field">
                  <label>Price per Share (Rs.)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input mono"
                    placeholder="e.g. 215.50"
                    value={txPrice}
                    onChange={(e) =>
                      handleTxSharesOrPriceOrNotesChange(
                        txShares,
                        e.target.value,
                        txNotes
                      )
                    }
                  />
                </div>
                <div className="form-field">
                  <label>
                    Brokerage Fee (Rs.)
                    <button
                      type="button"
                      className="btn btn-sm"
                      style={{ padding: "1px 6px", marginLeft: "6px" }}
                      onClick={() =>
                        handleTxSharesOrPriceOrNotesChange(
                          txShares,
                          txPrice,
                          txNotes,
                          true
                        )
                      }
                    >
                      Auto
                    </button>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    className="input mono"
                    value={txBrk}
                    onChange={(e) => setTxBrk(e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label>SST 15% on Brokerage (Rs.)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input mono"
                    value={txSst}
                    onChange={(e) => setTxSst(e.target.value)}
                  />
                </div>
                <div
                  className="form-field full"
                  style={{
                    background: "var(--bg-subtle)",
                    padding: "12px",
                    borderRadius: "6px",
                    border: "1px solid var(--border)",
                  }}
                >
                  {(() => {
                    const sh = Number(txShares) || 0;
                    const pr = Number(txPrice) || 0;
                    const brk = Number(txBrk) || 0;
                    const sst = Number(txSst) || 0;
                    const gross = sh * pr;
                    const net =
                      txAction === "Buy"
                        ? -(gross + brk + sst)
                        : gross - brk - sst;
                    return (
                      <div className="mono" style={{ fontSize: "12.5px" }}>
                        Gross: <b>{fmtPKR(gross, 2)}</b> | Fees:{" "}
                        <b>{fmtPKR(brk + sst, 2)}</b> | Net Cash Flow:{" "}
                        <b className={net >= 0 ? "pos" : "neg"}>
                          {fmtSignedPKR(net, 2)}
                        </b>
                      </div>
                    );
                  })()}
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                  marginTop: "18px",
                }}
              >
                <button
                  className="btn"
                  onClick={() => setTxModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-emerald"
                  onClick={saveTxForm}
                  disabled={txSaving}
                >
                  {txSaving ? "Saving..." : "Save Transaction"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          POPUP MODAL 2: ADD / EDIT DIVIDEND PAYMENT
          ===================================================================== */}
      {divModalOpen && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDivModalOpen(false);
          }}
        >
          <div className="modal-box">
            <div className="card-header">
              <div className="card-title">
                {divEditId !== null
                  ? "Edit Dividend Payment"
                  : "Add Dividend Payment"}
              </div>
              <button
                className="btn btn-sm"
                onClick={() => setDivModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="card-body">
              <div className="form-grid">
                <div className="form-field">
                  <label>Payment Date</label>
                  <input
                    type="date"
                    className="input mono"
                    value={divDate}
                    onChange={(e) => {
                      const d = e.target.value;
                      setDivDate(d);
                      if (divEditId === null) {
                        setDivShares(
                          String(calcEligibleSharesOnDate(divTicker, d))
                        );
                      }
                    }}
                  />
                </div>
                <div className="form-field">
                  <label>Ticker Symbol</label>
                  <select
                    className="select"
                    value={divTicker}
                    onChange={(e) => {
                      const s = e.target.value;
                      setDivTicker(s);
                      if (divEditId === null) {
                        setDivShares(
                          String(calcEligibleSharesOnDate(s, divDate))
                        );
                      }
                    }}
                  >
                    {sortedTickers.map((h) => (
                      <option key={h.ticker} value={h.ticker}>
                        {h.ticker} — {h.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label>Year</label>
                  <input
                    type="text"
                    className="input mono"
                    value={divYear}
                    onChange={(e) => setDivYear(e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label>Dividend Term</label>
                  <select
                    className="select"
                    value={divTerm}
                    onChange={(e) => setDivTerm(e.target.value)}
                  >
                    <option value="Interim I">Interim I</option>
                    <option value="Interim II">Interim II</option>
                    <option value="Interim III">Interim III</option>
                    <option value="Final">Final</option>
                  </select>
                </div>
                <div className="form-field">
                  <label>
                    Eligible Shares
                    <button
                      type="button"
                      className="btn btn-sm"
                      style={{ padding: "1px 6px", marginLeft: "6px" }}
                      onClick={() =>
                        setDivShares(
                          String(calcEligibleSharesOnDate(divTicker, divDate))
                        )
                      }
                    >
                      Auto-Fill Held
                    </button>
                  </label>
                  <input
                    type="number"
                    step="1"
                    className="input mono"
                    value={divShares}
                    onChange={(e) => setDivShares(e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label>Dividend per Share (DPS Rs.)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input mono"
                    placeholder="e.g. 5.00"
                    value={divDps}
                    onChange={(e) => setDivDps(e.target.value)}
                  />
                </div>
                <div className="form-field full">
                  <label>Quick WHT Tax Calculation:</label>
                  <div className="btn-group">
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => applyDivWhtPreset(15)}
                    >
                      15% Standard Filer
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => applyDivWhtPreset(7.5)}
                    >
                      7.5% IPP Power
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => applyDivWhtPreset(25)}
                    >
                      25% REIT / Fund
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => applyDivWhtPreset(0)}
                    >
                      0% Exempt
                    </button>
                  </div>
                </div>
                <div className="form-field">
                  <label>Withholding Tax WHT (Rs.)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input mono"
                    value={divWht}
                    onChange={(e) => setDivWht(e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label>Zakat Deducted (Rs.)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input mono"
                    value={divZakat}
                    onChange={(e) => setDivZakat(e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label>Payment Status</label>
                  <select
                    className="select"
                    value={divStatus}
                    onChange={(e) =>
                      setDivStatus(e.target.value as "Paid" | "Unpaid")
                    }
                  >
                    <option value="Paid">Paid (Received in Bank)</option>
                    <option value="Unpaid">Unpaid (Announced / Pending)</option>
                  </select>
                </div>
                <div className="form-field">
                  <label>Reinvested in Stock (DRIP)?</label>
                  <select
                    className="select"
                    value={divReinvest}
                    onChange={(e) =>
                      setDivReinvest(e.target.value as "Yes" | "No")
                    }
                  >
                    <option value="No">No (Cash Retained)</option>
                    <option value="Yes">Yes (Reinvested in Shares)</option>
                  </select>
                </div>
                <div
                  className="form-field full"
                  style={{
                    background: "var(--bg-subtle)",
                    padding: "12px",
                    borderRadius: "6px",
                    border: "1px solid var(--border)",
                  }}
                >
                  {(() => {
                    const sh = Number(divShares) || 0;
                    const dps = Number(divDps) || 0;
                    const wht = Number(divWht) || 0;
                    const zakat = Number(divZakat) || 0;
                    const gross = sh * dps;
                    const net = gross - wht - zakat;
                    return (
                      <div className="mono" style={{ fontSize: "12.5px" }}>
                        Gross Dividend: <b>{fmtPKR(gross, 2)}</b> | Tax + Zakat:{" "}
                        <b className="neg">-{fmtPKR(wht + zakat, 2)}</b> | Net
                        Dividend: <b className="pos">+{fmtPKR(net, 2)}</b>
                      </div>
                    );
                  })()}
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                  marginTop: "18px",
                }}
              >
                <button
                  className="btn"
                  onClick={() => setDivModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-amber"
                  onClick={saveDivForm}
                  disabled={divSaving}
                >
                  {divSaving ? "Saving..." : "Save Dividend"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          POPUP MODAL 3: ADD NEW PSX COMPANY
          ===================================================================== */}
      {compModalOpen && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCompModalOpen(false);
          }}
        >
          <div className="modal-box">
            <div className="card-header">
              <div className="card-title">Add New PSX Company</div>
              <button
                className="btn btn-sm"
                onClick={() => setCompModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="card-body">
              <div className="form-grid">
                <div className="form-field">
                  <label>
                    PSX Ticker Symbol
                    <button
                      type="button"
                      className="btn btn-sm"
                      style={{ padding: "1px 6px", marginLeft: "6px" }}
                      onClick={autoFetchNewTickerInfo}
                      disabled={compFetching}
                    >
                      {compFetching ? "Fetching..." : "Auto-Fill from PSX"}
                    </button>
                  </label>
                  <input
                    type="text"
                    className="input mono"
                    placeholder="e.g. LUCK, MARI, SYS"
                    style={{ textTransform: "uppercase" }}
                    value={compTicker}
                    onChange={(e) =>
                      setCompTicker(e.target.value.toUpperCase())
                    }
                  />
                </div>
                <div className="form-field">
                  <label>Dividend Frequency</label>
                  <select
                    className="select"
                    value={compFreq}
                    onChange={(e) => setCompFreq(e.target.value)}
                  >
                    <option value="Qtr">Quarterly (Qtr)</option>
                    <option value="Semi">Semi-Annual (Semi)</option>
                    <option value="Annual">Annual</option>
                    <option value="Monthly">Monthly</option>
                    <option value="None">None</option>
                  </select>
                </div>
                <div className="form-field full">
                  <label>Company Name</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Lucky Cement Limited"
                    value={compName}
                    onChange={(e) => setCompName(e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label>PSX Sector</label>
                  <input
                    type="text"
                    className="input"
                    value={compSector}
                    onChange={(e) => setCompSector(e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label>Live PSX Price (Rs.)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input mono"
                    value={compPrice}
                    onChange={(e) => setCompPrice(e.target.value)}
                  />
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                  marginTop: "18px",
                }}
              >
                <button
                  className="btn"
                  onClick={() => setCompModalOpen(false)}
                >
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={saveCompanyForm}>
                  Save Company
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          POPUP MODAL 4: MARK DIVIDEND AS PAID & SET PAYMENT DATE
          ===================================================================== */}
      {markPaidModalDiv && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMarkPaidModalDiv(null);
          }}
        >
          <div className="modal-box" style={{ maxWidth: "460px" }}>
            <div className="card-header">
              <div className="card-title">
                ✓ Mark {markPaidModalDiv.ticker} Dividend as Paid
              </div>
              <button
                className="btn btn-sm"
                onClick={() => setMarkPaidModalDiv(null)}
              >
                ✕
              </button>
            </div>
            <div className="card-body">
              <div style={{ marginBottom: "14px", fontSize: "13px" }}>
                Confirm payout for <b>{markPaidModalDiv.ticker}</b> (
                {markPaidModalDiv.year} {markPaidModalDiv.term} —{" "}
                {fmtNum(markPaidModalDiv.sharesEligible)} sh @ Rs.{" "}
                {markPaidModalDiv.dps.toFixed(2)}/sh):
              </div>
              <div className="form-field" style={{ marginBottom: "16px" }}>
                <label>Date Dividend Was Received in Bank</label>
                <input
                  type="date"
                  className="input mono"
                  value={markPaidDate}
                  onChange={(e) => setMarkPaidDate(e.target.value)}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                }}
              >
                <button
                  className="btn"
                  onClick={() => setMarkPaidModalDiv(null)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-emerald"
                  onClick={confirmMarkDividendPaid}
                >
                  ✓ Confirm Paid
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS: SVG CHARTS & STAT STRIPS (Exact Match to Uncle's Layout)
// ============================================================================

function MonthlyDividendsSvgChart({
  monthly,
}: {
  monthly: ReturnType<typeof runAccountingEngine>["monthly"];
}) {
  const w = 680;
  const h = 290;
  const padL = 52;
  const padR = 48;
  const padT = 28;
  const padB = 34;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const maxVal = Math.max(...monthly.map((m) => m.grossDiv), 8500);

  let runningCum = 0;
  const cumArr = monthly.map((m) => {
    runningCum += m.netDiv;
    return runningCum;
  });
  const maxCum = Math.max(...cumArr, 32000);

  const colW = plotW / Math.max(monthly.length, 1);
  const barW = Math.min(32, colW * 0.58);
  const pts: string[] = [];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="295">
      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const y = padT + plotH * (1 - f);
        const val = Math.round(maxVal * f);
        const cVal = Math.round((maxCum * f) / 1000);
        return (
          <g key={f}>
            <line
              x1={padL}
              y1={y}
              x2={w - padR}
              y2={y}
              stroke="var(--border)"
              strokeDasharray="3 3"
            />
            <text
              x={padL - 8}
              y={y + 3}
              textAnchor="end"
              fill="var(--text-muted)"
              fontSize="10"
              fontFamily="JetBrains Mono"
            >
              {val.toLocaleString()}
            </text>
            <text
              x={w - padR + 6}
              y={y + 3}
              textAnchor="start"
              fill="#2563eb"
              fontSize="10"
              fontFamily="JetBrains Mono"
            >
              {cVal}K
            </text>
          </g>
        );
      })}

      {monthly.map((m, i) => {
        const cx = padL + i * colW + colW / 2;
        const x = cx - barW / 2;
        const netH = (m.netDiv / maxVal) * plotH;
        const taxH = ((m.wht + m.zakat) / maxVal) * plotH;
        const yNet = padT + plotH - netH;
        const yTax = yNet - taxH;
        const cyCum = padT + plotH - (cumArr[i] / maxCum) * plotH;
        pts.push(`${cx},${cyCum}`);

        return (
          <g key={m.ym}>
            <rect
              x={x}
              y={yNet}
              width={barW}
              height={Math.max(netH, 1)}
              rx="4"
              fill="#10b981"
            >
              <title>
                {m.ym} Net Dividend: {fmtPKR(m.netDiv, 2)}
              </title>
            </rect>
            {taxH > 0 && (
              <rect
                x={x}
                y={yTax}
                width={barW}
                height={taxH}
                rx="2"
                fill="#f59e0b"
              >
                <title>
                  {m.ym} WHT &amp; Zakat: {fmtPKR(m.wht + m.zakat, 2)}
                </title>
              </rect>
            )}
            {m.netDiv > 0 && (
              <text
                x={cx}
                y={yTax - 6}
                textAnchor="middle"
                fill="var(--text-main)"
                fontSize="10"
                fontWeight="700"
                fontFamily="JetBrains Mono"
              >
                {Math.round(m.netDiv).toLocaleString()}
              </text>
            )}
            <text
              x={cx}
              y={h - 10}
              textAnchor="middle"
              fill="var(--text-muted)"
              fontSize="10.5"
              fontWeight="600"
              fontFamily="JetBrains Mono"
            >
              {m.ym.slice(2)}
            </text>
          </g>
        );
      })}

      <polyline
        fill="none"
        stroke="#2563eb"
        strokeWidth="2.5"
        points={pts.join(" ")}
      />
      {pts.map((p, idx) => {
        const [px, py] = p.split(",");
        return (
          <circle
            key={idx}
            cx={px}
            cy={py}
            r="3.5"
            fill="#ffffff"
            stroke="#2563eb"
            strokeWidth="2"
          >
            <title>
              Cumulative Net Divs ({monthly[idx].ym}):{" "}
              {fmtPKR(cumArr[idx], 0)}
            </title>
          </circle>
        );
      })}
    </svg>
  );
}

function MonthlyStatStrip({
  monthly,
  totals,
}: {
  monthly: ReturnType<typeof runAccountingEngine>["monthly"];
  totals: ReturnType<typeof runAccountingEngine>["totals"];
}) {
  const bestMonth = [...monthly].sort((a, b) => b.netDiv - a.netDiv)[0] || {
    ym: "N/A",
    netDiv: 0,
  };
  const activeDivMonths = monthly.filter((m) => m.netDiv > 0).length || 1;

  return (
    <div className="chart-stat-strip">
      <div className="chart-stat-item">
        <div className="chart-stat-lbl">Peak Dividend Month</div>
        <div className="chart-stat-val pos">
          {bestMonth.ym} (+{fmtPKR(bestMonth.netDiv, 0)})
        </div>
      </div>
      <div className="chart-stat-item">
        <div className="chart-stat-lbl">Avg Per Paying Month</div>
        <div className="chart-stat-val pos">
          +{fmtPKR(totals.totalNetDivPaid / activeDivMonths, 0)} / mo
        </div>
      </div>
      <div className="chart-stat-item">
        <div className="chart-stat-lbl">Total Gross Dividends</div>
        <div className="chart-stat-val">
          {fmtPKR(totals.totalGrossDivPaid, 0)}
        </div>
      </div>
      <div className="chart-stat-item">
        <div className="chart-stat-lbl">WHT &amp; Zakat Deducted</div>
        <div className="chart-stat-val neg">
          -{fmtPKR(totals.totalTaxWithheld, 0)}
        </div>
      </div>
    </div>
  );
}

function StockPositionSvgChart({ stock }: { stock: HoldingRecord }) {
  const lots = stock.lots || [];
  let low52 = stock.price * 0.85;
  let high52 = stock.price * 1.15;
  if (stock.high52 && stock.high52.includes("-")) {
    const parts = stock.high52
      .split("-")
      .map((x) => parseFloat(x.replace(/,/g, "").trim()));
    if (parts.length === 2 && parts[1] > 0) {
      low52 = parts[0];
      high52 = parts[1];
    }
  }

  const points: {
    date: string;
    price: number;
    label: string;
    type: string;
  }[] = [];
  lots.forEach((l) => {
    points.push({
      date: l.date,
      price: l.price,
      label: `${l.action} ${l.shares}sh @ Rs.${l.price}`,
      type: l.action,
    });
  });
  if (stock.ldcp > 0) {
    points.push({
      date: "Prev Close",
      price: stock.ldcp,
      label: `LDCP: Rs.${stock.ldcp}`,
      type: "LDCP",
    });
  }
  if (stock.price > 0) {
    points.push({
      date: "Live PSX",
      price: stock.price,
      label: `Live: Rs.${stock.price}`,
      type: "LIVE",
    });
  }

  const allPrices = [
    ...points.map((p) => p.price),
    stock.wac,
    low52,
    high52,
  ].filter((v) => v > 0);
  const minP = (allPrices.length ? Math.min(...allPrices) : 10) * 0.94;
  const maxP = (allPrices.length ? Math.max(...allPrices) : 100) * 1.06;

  const w = 680;
  const ch = 310;
  const padL = 58;
  const padR = 65;
  const padT = 26;
  const padB = 38;
  const plotW = w - padL - padR;
  const plotH = ch - padT - padB;

  const getY = (val: number) =>
    padT + plotH - ((val - minP) / Math.max(maxP - minP, 1)) * plotH;

  const coords = points.map((pt, i) => ({
    ...pt,
    x: padL + (i / Math.max(points.length - 1, 1)) * plotW,
    y: getY(pt.price),
  }));

  const linePath = coords.map((c) => `${c.x},${c.y}`).join(" ");
  const areaPath =
    coords.length > 1
      ? `M ${coords[0].x},${padT + plotH} L ` +
        coords.map((c) => `${c.x},${c.y}`).join(" L ") +
        ` L ${coords[coords.length - 1].x},${padT + plotH} Z`
      : "";

  const isUpOverall = stock.wac > 0 ? stock.price >= stock.wac : true;
  const mainColor = isUpOverall ? "#10b981" : "#ef4444";
  const yWac = stock.wac > 0 ? getY(stock.wac) : null;
  const yLive = stock.price > 0 ? getY(stock.price) : null;

  return (
    <div>
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "8px",
          }}
        >
          <div>
            <span className="fw-700" style={{ fontSize: "15px" }}>
              PSX:{stock.ticker} — {stock.name}
            </span>
            <span
              className="muted"
              style={{ fontSize: "12px", marginLeft: "8px" }}
            >
              ({stock.sector})
            </span>
          </div>
        </div>
        <div className="chart-legend" style={{ marginBottom: "8px" }}>
          <span className="legend-item">
            <span
              className="legend-dot"
              style={{
                background: "#2563eb",
                border: "2px solid #fff",
                boxShadow: "0 0 0 1px #2563eb",
              }}
            />
            <span>Your Buy Order Price</span>
          </span>
          <span className="legend-item">
            <span
              className="legend-dot"
              style={{
                background: "#dc2626",
                border: "2px solid #fff",
                boxShadow: "0 0 0 1px #dc2626",
              }}
            />
            <span>Your Sell Order Price</span>
          </span>
          <span className="legend-item">
            <span
              className="legend-dot"
              style={{
                background: "#64748b",
                border: "2px solid #fff",
                boxShadow: "0 0 0 1px #64748b",
              }}
            />
            <span>Prev Day Close (LDCP)</span>
          </span>
          <span className="legend-item">
            <span
              className="legend-dash"
              style={{ borderColor: "#d97706" }}
            />
            <span style={{ color: "#d97706", fontWeight: 700 }}>
              Your Avg Buy Price (WAC: Rs.{stock.wac.toFixed(2)})
            </span>
          </span>
          <span className="legend-item">
            <span
              className="legend-line"
              style={{ background: mainColor }}
            />
            <span style={{ color: mainColor, fontWeight: 700 }}>
              Live PSX Price (NOW: Rs.{stock.price.toFixed(2)})
            </span>
          </span>
        </div>

        <svg viewBox={`0 0 ${w} ${ch}`} width="100%" height="315">
          <defs>
            <linearGradient id="stockGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={mainColor} stopOpacity="0.28" />
              <stop offset="100%" stopColor={mainColor} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map((f) => {
            const y = padT + plotH * (1 - f);
            const pVal = minP + (maxP - minP) * f;
            return (
              <g key={f}>
                <line
                  x1={padL}
                  y1={y}
                  x2={w - padR}
                  y2={y}
                  stroke="var(--border)"
                  strokeDasharray="3 3"
                />
                <text
                  x={padL - 8}
                  y={y + 4}
                  textAnchor="end"
                  fill="var(--text-muted)"
                  fontSize="10"
                  fontFamily="JetBrains Mono"
                >
                  Rs.{pVal.toFixed(1)}
                </text>
              </g>
            );
          })}
          {areaPath && <path d={areaPath} fill="url(#stockGrad)" />}
          {coords.length > 1 && (
            <polyline
              fill="none"
              stroke={mainColor}
              strokeWidth="2.5"
              points={linePath}
            />
          )}
          {yWac !== null && (
            <g>
              <line
                x1={padL}
                y1={yWac}
                x2={w - padR}
                y2={yWac}
                stroke="#d97706"
                strokeWidth="2"
                strokeDasharray="6 4"
              />
              <rect
                x={w - padR + 2}
                y={yWac - 9}
                width="60"
                height="18"
                rx="3"
                fill="#d97706"
              />
              <text
                x={w - padR + 32}
                y={yWac + 3}
                textAnchor="middle"
                fill="#fff"
                fontSize="9.5"
                fontWeight="700"
                fontFamily="JetBrains Mono"
              >
                WAC {stock.wac.toFixed(1)}
              </text>
            </g>
          )}
          {yLive !== null && (
            <g>
              <line
                x1={padL}
                y1={yLive}
                x2={w - padR}
                y2={yLive}
                stroke={mainColor}
                strokeWidth="1.5"
                strokeDasharray="2 2"
              />
              <rect
                x={w - padR + 2}
                y={yLive - 9}
                width="60"
                height="18"
                rx="3"
                fill={mainColor}
              />
              <text
                x={w - padR + 32}
                y={yLive + 3}
                textAnchor="middle"
                fill="#fff"
                fontSize="9.5"
                fontWeight="700"
                fontFamily="JetBrains Mono"
              >
                NOW {stock.price.toFixed(1)}
              </text>
            </g>
          )}
          {coords.map((c, idx) => {
            const dotColor =
              c.type === "Buy"
                ? "#2563eb"
                : c.type === "Sell"
                ? "#dc2626"
                : c.type === "LIVE"
                ? mainColor
                : "#64748b";
            return (
              <g key={idx}>
                <circle
                  cx={c.x}
                  cy={c.y}
                  r="5.5"
                  fill={dotColor}
                  stroke="#ffffff"
                  strokeWidth="2"
                >
                  <title>
                    {c.date}: {c.label}
                  </title>
                </circle>
                <text
                  x={c.x}
                  y={c.y - 10}
                  textAnchor="middle"
                  fill="var(--text-main)"
                  fontSize="10"
                  fontWeight="600"
                  fontFamily="JetBrains Mono"
                >
                  {c.price.toFixed(1)}
                </text>
                <text
                  x={c.x}
                  y={ch - 12}
                  textAnchor="middle"
                  fill="var(--text-muted)"
                  fontSize="9.5"
                  fontFamily="JetBrains Mono"
                >
                  {c.date.slice(-5)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="chart-stat-strip" style={{ marginTop: "8px" }}>
        <div className="chart-stat-item">
          <div className="chart-stat-lbl">52-Week Range</div>
          <div className="chart-stat-val">{stock.high52 || "N/A"}</div>
        </div>
        <div className="chart-stat-item">
          <div className="chart-stat-lbl">Day Range</div>
          <div className="chart-stat-val">{stock.dayRange || "N/A"}</div>
        </div>
        <div className="chart-stat-item">
          <div className="chart-stat-lbl">P/E Ratio (TTM)</div>
          <div className="chart-stat-val">{stock.pe || "N/A"}</div>
        </div>
        <div className="chart-stat-item">
          <div className="chart-stat-lbl">Volume Traded</div>
          <div className="chart-stat-val">{stock.volume || "0"}</div>
        </div>
      </div>
    </div>
  );
}
