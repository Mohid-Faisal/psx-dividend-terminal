import {
  PortfolioState,
  PositionSummary,
  TransactionRecord,
  DividendRecord,
} from "@/types/portfolio";

export const LEGACY_MCB_SALE = {
  date: "2025-11-25",
  ticker: "MCB",
  shares: 225,
  price: 348.75,
  netProceeds: 78315.33,
};

export const SECTOR_COLORS: Record<string, string> = {
  "POWER GENERATION & DISTRIBUTION": "#0284c7",
  "COMMERCIAL BANKS": "#2563eb",
  "FERTILIZER": "#059669",
  "OIL & GAS EXPLORATION COMPANIES": "#d97706",
  "OIL & GAS MARKETING COMPANIES": "#ea580c",
  "CEMENT": "#4f46e5",
  "TECHNOLOGY & COMMUNICATION": "#7c3aed",
  "TEXTILE COMPOSITE": "#db2777",
  "PHARMACEUTICALS": "#0d9488",
  "CHEMICAL": "#9333ea",
  "AUTOMOBILE ASSEMBLER": "#e11d48",
  "AUTOMOBILE PARTS & ACCESSORIES": "#be123c",
  "INV. BANKS / INV. COS. / SECURITIES COS.": "#0891b2",
  "REAL ESTATE INVESTMENT TRUST": "#65a30d",
  "FOOD & PERSONAL CARE PRODUCTS": "#16a34a",
  "GLASS & CERAMICS": "#ca8a04",
  "SYNTHETIC & RAYON": "#c026d3",
  "EXCHANGE TRADED FUNDS": "#475569",
  "MODARABAS": "#0f766e",
  "PAPER, BOARD & PACKAGING": "#b45309",
};

export function getSectorColor(sector?: string): string {
  return SECTOR_COLORS[(sector || "").toUpperCase()] || "#475569";
}

export function computeBrokerageAndSst(
  shares: number,
  price: number,
  notes = "",
  rate = 0.0017,
  minPerShare = 0.05,
  sstRate = 0.15
) {
  const sh = Math.abs(Number(shares) || 0);
  const pr = Number(price) || 0;
  if (notes.toUpperCase().includes("IPO") || sh <= 0) {
    return { brkFees: 0, sst: 0 };
  }
  const brkFees = Number(Math.max(sh * minPerShare, sh * pr * rate).toFixed(2));
  const sst = Number((brkFees * sstRate).toFixed(2));
  return { brkFees, sst };
}

export interface EnrichedTransaction extends TransactionRecord {
  grossAmount: number;
  netCashFlow: number;
  ym: string;
  runningWac: number;
  runningShares: number;
}

export interface EnrichedDividend extends DividendRecord {
  company: string;
  grossDividend: number;
  netDividend: number;
  ym: string;
  matchedDripTx?: EnrichedTransaction | null;
}

export interface HoldingRecord {
  ticker: string;
  name: string;
  frequency: string;
  sector: string;
  price: number;
  ldcp: number;
  change: number;
  changePct: number;
  pe: string;
  high52: string;
  dayRange: string;
  volume: string;
  asOf: string;
  legacyShares: number;
  activeShares: number;
  activeCostBasis: number;
  totalBuyShares: number;
  totalBuyCost: number;
  totalSellShares: number;
  totalSellNet: number;
  realizedPnL: number;
  isLegacyLiquidation: boolean;
  grossDivPaid: number;
  whtPaid: number;
  zakatPaid: number;
  netDivPaid: number;
  netDivUnpaid: number;
  reinvestedDivNet: number;
  trailingAnnualDps: number;
  wac: number;
  marketValue: number;
  unrealizedPnL: number;
  unrealizedPct: number;
  totalReturn: number;
  totalReturnPct: number;
  yoc: number;
  weight: number;
  lots: EnrichedTransaction[];
  divRecords: EnrichedDividend[];
}

export interface MonthlyRecord {
  ym: string;
  buyOutflow: number;
  sellInflow: number;
  sellInflowExLegacy: number;
  grossDiv: number;
  wht: number;
  zakat: number;
  netDiv: number;
  reinvValue: number;
}

export function runAccountingEngine(state: PortfolioState) {
  const compMap: Record<string, HoldingRecord> = {};

  (state.companies || []).forEach((c) => {
    const sym = (c.ticker || "").trim().toUpperCase();
    if (!sym) return;
    const legacySh = sym === "MCB" ? 225 : 0;
    compMap[sym] = {
      ticker: sym,
      name: c.name || sym,
      frequency: c.frequency || "None",
      sector: c.sector || "OTHER",
      price: Number(c.price) || 0,
      ldcp: Number(c.ldcp) || Number(c.price) || 0,
      change: Number(c.change) || 0,
      changePct: Number(c.changePct) || 0,
      pe: c.pe || "N/A",
      high52: c.high52 || "",
      dayRange: c.dayRange || "",
      volume: c.volume || "0",
      asOf: c.asOf || "",
      legacyShares: legacySh,
      activeShares: legacySh,
      activeCostBasis: 0,
      totalBuyShares: 0,
      totalBuyCost: 0,
      totalSellShares: 0,
      totalSellNet: 0,
      realizedPnL: 0,
      isLegacyLiquidation: false,
      grossDivPaid: 0,
      whtPaid: 0,
      zakatPaid: 0,
      netDivPaid: 0,
      netDivUnpaid: 0,
      reinvestedDivNet: 0,
      trailingAnnualDps: 0,
      wac: 0,
      marketValue: 0,
      unrealizedPnL: 0,
      unrealizedPct: 0,
      totalReturn: 0,
      totalReturnPct: 0,
      yoc: 0,
      weight: 0,
      lots: [],
      divRecords: [],
    };
  });

  [...(state.transactions || []), ...(state.dividends || [])].forEach(
    (item: { ticker?: string; company?: string }) => {
      const sym = (item.ticker || "").trim().toUpperCase();
      if (sym && !compMap[sym]) {
        const legacySh = sym === "MCB" ? 225 : 0;
        compMap[sym] = {
          ticker: sym,
          name: item.company || sym,
          frequency: "None",
          sector: "OTHER",
          price: 0,
          ldcp: 0,
          change: 0,
          changePct: 0,
          pe: "N/A",
          high52: "",
          dayRange: "",
          volume: "0",
          asOf: "",
          legacyShares: legacySh,
          activeShares: legacySh,
          activeCostBasis: 0,
          totalBuyShares: 0,
          totalBuyCost: 0,
          totalSellShares: 0,
          totalSellNet: 0,
          realizedPnL: 0,
          isLegacyLiquidation: false,
          grossDivPaid: 0,
          whtPaid: 0,
          zakatPaid: 0,
          netDivPaid: 0,
          netDivUnpaid: 0,
          reinvestedDivNet: 0,
          trailingAnnualDps: 0,
          wac: 0,
          marketValue: 0,
          unrealizedPnL: 0,
          unrealizedPct: 0,
          totalReturn: 0,
          totalReturnPct: 0,
          yoc: 0,
          weight: 0,
          lots: [],
          divRecords: [],
        };
      }
    }
  );

  const sortedTxs = [...(state.transactions || [])].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.id || 0) - (b.id || 0);
  });

  const monthlyMap: Record<string, MonthlyRecord> = {};
  function ensureMonth(ym: string): MonthlyRecord | null {
    if (!ym) return null;
    if (!monthlyMap[ym]) {
      monthlyMap[ym] = {
        ym,
        buyOutflow: 0,
        sellInflow: 0,
        sellInflowExLegacy: 0,
        grossDiv: 0,
        wht: 0,
        zakat: 0,
        netDiv: 0,
        reinvValue: 0,
      };
    }
    return monthlyMap[ym];
  }

  [
    "2025-11",
    "2025-12",
    "2026-01",
    "2026-02",
    "2026-03",
    "2026-04",
    "2026-05",
    "2026-06",
    "2026-07",
    "2026-08",
    "2026-09",
    "2026-10",
    "2026-11",
  ].forEach(ensureMonth);

  const enrichedTxs: EnrichedTransaction[] = [];
  sortedTxs.forEach((t) => {
    const sym = (t.ticker || "").trim().toUpperCase();
    const p = compMap[sym];
    if (!p) return;
    const sh = Math.abs(Number(t.shares) || 0);
    const pr = Number(t.price) || 0;
    const gross = sh * pr;
    const brk = Number(t.brkFees) || 0;
    const sst = Number(t.sst) || 0;
    const fees = brk + sst;
    const ym = (t.date || "").slice(0, 7);
    const mObj = ensureMonth(ym);
    let netCashFlow = 0;

    if (t.action === "Buy") {
      const totalCost = gross + fees;
      netCashFlow = -totalCost;
      p.activeShares += sh;
      p.activeCostBasis += totalCost;
      p.totalBuyShares += sh;
      p.totalBuyCost += totalCost;
      if (mObj) mObj.buyOutflow += totalCost;
    } else if (t.action === "Sell") {
      const netProceeds = gross - fees;
      netCashFlow = netProceeds;
      p.totalSellShares += sh;
      p.totalSellNet += netProceeds;
      if (mObj) mObj.sellInflow += netProceeds;

      if (p.totalBuyShares === 0 && p.legacyShares >= sh) {
        p.isLegacyLiquidation = true;
        p.activeShares = Math.max(0, p.activeShares - sh);
      } else {
        if (mObj) mObj.sellInflowExLegacy += netProceeds;
        const currentWac =
          p.activeShares > 0 ? p.activeCostBasis / p.activeShares : 0;
        const costRemoved = currentWac * sh;
        p.realizedPnL += netProceeds - costRemoved;
        p.activeShares = Math.max(0, p.activeShares - sh);
        p.activeCostBasis = Math.max(0, p.activeCostBasis - costRemoved);
      }
    }

    const runningWac =
      p.activeShares > 0 ? p.activeCostBasis / p.activeShares : 0;
    const rec: EnrichedTransaction = {
      ...t,
      ticker: sym,
      company: p.name,
      shares: sh,
      price: pr,
      grossAmount: gross,
      brkFees: brk,
      sst,
      netCashFlow,
      ym,
      runningWac,
      runningShares: p.activeShares,
    };
    p.lots.push(rec);
    enrichedTxs.push(rec);
  });

  const sortedDivs = [...(state.dividends || [])].sort((a, b) => {
    if (a.paymentDate !== b.paymentDate)
      return a.paymentDate.localeCompare(b.paymentDate);
    return (a.id || 0) - (b.id || 0);
  });

  const enrichedDivs: EnrichedDividend[] = [];
  sortedDivs.forEach((d) => {
    const sym = (d.ticker || "").trim().toUpperCase();
    const p = compMap[sym];
    if (!p) return;
    const sh = Number(d.sharesEligible) || 0;
    const dps = Number(d.dps) || 0;
    const gross = sh * dps;
    const wht = Number(d.wht) || 0;
    const zakat = Number(d.zakat) || 0;
    const net = gross - wht - zakat;
    const ym = (d.paymentDate || "").slice(0, 7);
    const status = d.status || "Paid";
    const reinvest = d.reinvest || "No";

    let matchedDripTx: EnrichedTransaction | null = null;
    if (reinvest === "Yes") {
      const payTime = new Date(d.paymentDate).getTime();
      matchedDripTx =
        enrichedTxs.find((tx) => {
          if (tx.ticker !== sym || tx.action !== "Buy") return false;
          const diffDays =
            (new Date(tx.date).getTime() - payTime) / (1000 * 3600 * 24);
          return (
            diffDays >= -2 &&
            diffDays <= 35 &&
            Math.abs(tx.grossAmount - net) <= Math.max(net * 0.65, 500)
          );
        }) || null;
    }

    if (status === "Paid") {
      p.grossDivPaid += gross;
      p.whtPaid += wht;
      p.zakatPaid += zakat;
      p.netDivPaid += net;
      p.trailingAnnualDps += dps;
      if (reinvest === "Yes") p.reinvestedDivNet += net;
      const mObj = ensureMonth(ym);
      if (mObj) {
        mObj.grossDiv += gross;
        mObj.wht += wht;
        mObj.zakat += zakat;
        mObj.netDiv += net;
        if (reinvest === "Yes") mObj.reinvValue += net;
      }
    } else {
      p.netDivUnpaid += net;
    }

    const rec: EnrichedDividend = {
      ...d,
      ticker: sym,
      company: p.name,
      sharesEligible: sh,
      dps,
      grossDividend: gross,
      wht,
      zakat,
      netDividend: net,
      ym,
      status,
      reinvest,
      matchedDripTx,
    };
    p.divRecords.push(rec);
    enrichedDivs.push(rec);
  });

  let totalMarketValue = 0;
  let totalActiveCostBasis = 0;
  let totalActiveShares = 0;
  let totalBuyOutflow = 0;
  let totalSellInflowAll = 0;
  let totalSellInflowExLegacy = 0;
  let totalGrossDivPaid = 0;
  let totalWhtPaid = 0;
  let totalZakatPaid = 0;
  let totalNetDivPaid = 0;
  let totalNetDivUnpaid = 0;
  let totalReinvestedDivNet = 0;
  let totalRealizedPnL = 0;

  const holdingsList = Object.values(compMap).map((p) => {
    const wac = p.activeShares > 0 ? p.activeCostBasis / p.activeShares : 0;
    const marketValue = p.activeShares * p.price;
    const unrealizedPnL = marketValue - p.activeCostBasis;
    const unrealizedPct =
      p.activeCostBasis > 0 ? (unrealizedPnL / p.activeCostBasis) * 100 : 0;
    const totalReturn = unrealizedPnL + p.realizedPnL + p.netDivPaid;
    const totalReturnPct =
      p.activeCostBasis > 0 ? (totalReturn / p.activeCostBasis) * 100 : 0;
    const yoc =
      p.activeCostBasis > 0 ? (p.netDivPaid / p.activeCostBasis) * 100 : 0;

    totalMarketValue += marketValue;
    totalActiveCostBasis += p.activeCostBasis;
    totalActiveShares += p.activeShares;
    totalBuyOutflow += p.totalBuyCost;
    totalSellInflowAll += p.totalSellNet;
    if (!p.isLegacyLiquidation) totalSellInflowExLegacy += p.totalSellNet;
    totalGrossDivPaid += p.grossDivPaid;
    totalWhtPaid += p.whtPaid;
    totalZakatPaid += p.zakatPaid;
    totalNetDivPaid += p.netDivPaid;
    totalNetDivUnpaid += p.netDivUnpaid;
    totalReinvestedDivNet += p.reinvestedDivNet;
    totalRealizedPnL += p.realizedPnL;

    p.wac = wac;
    p.marketValue = marketValue;
    p.unrealizedPnL = unrealizedPnL;
    p.unrealizedPct = unrealizedPct;
    p.totalReturn = totalReturn;
    p.totalReturnPct = totalReturnPct;
    p.yoc = yoc;
    p.weight = 0;
    return p;
  });

  holdingsList.forEach((h) => {
    h.weight =
      totalMarketValue > 0 ? (h.marketValue / totalMarketValue) * 100 : 0;
  });

  const includeLegacy = state.settings?.includeLegacyMcbInCashflow !== false;
  const effectiveSellInflow = includeLegacy
    ? totalSellInflowAll
    : totalSellInflowExLegacy;
  const netCashInvested = totalBuyOutflow - effectiveSellInflow;
  const totalUnrealizedPnL = totalMarketValue - totalActiveCostBasis;
  const totalUnrealizedPct =
    totalActiveCostBasis > 0
      ? (totalUnrealizedPnL / totalActiveCostBasis) * 100
      : 0;
  const allInNetProfit =
    totalUnrealizedPnL + totalRealizedPnL + totalNetDivPaid;
  const allInRoiPct =
    totalActiveCostBasis > 0
      ? (allInNetProfit / totalActiveCostBasis) * 100
      : 0;

  return {
    holdings: holdingsList,
    compMap,
    transactions: enrichedTxs,
    dividends: enrichedDivs,
    monthly: Object.values(monthlyMap).sort((a, b) =>
      a.ym.localeCompare(b.ym)
    ),
    totals: {
      totalActiveShares,
      totalMarketValue,
      totalActiveCostBasis,
      totalUnrealizedPnL,
      totalUnrealizedPct,
      totalRealizedPnL,
      totalBuyOutflow,
      effectiveSellInflow,
      netCashInvested,
      totalGrossDivPaid,
      totalWhtPaid,
      totalZakatPaid,
      totalTaxWithheld: totalWhtPaid + totalZakatPaid,
      totalNetDivPaid,
      totalNetDivUnpaid,
      totalReinvestedDivNet,
      allInNetProfit,
      allInRoiPct,
      activeHoldingsCount: holdingsList.filter((h) => h.activeShares > 0)
        .length,
    },
  };
}

// Legacy wrapper for any existing callers
export function computePortfolioAnalytics(state: PortfolioState) {
  const res = runAccountingEngine(state);
  const positions: PositionSummary[] = res.holdings.map((h) => ({
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
    currentYieldPct: h.marketValue > 0 ? (h.netDivPaid / h.marketValue) * 100 : 0,
    weightPct: h.weight,
    high52: h.high52,
    dayRange: h.dayRange,
    volume: h.volume,
    pe: h.pe,
    asOf: h.asOf,
    lots: h.lots.map((l) => ({
      id: l.id,
      date: l.date,
      action: l.action,
      shares: l.shares,
      price: l.price,
      fees: l.brkFees + l.sst,
      totalAmount: Math.abs(l.netCashFlow),
      runningShares: l.runningShares,
      runningWac: l.runningWac,
      realizedPnl: 0,
    })),
  }));
  return {
    positions,
    activePositions: positions.filter((p) => p.shares > 0),
    exitedPositions: positions.filter((p) => p.shares === 0),
    sectors: [],
    monthlyDividends: [],
    summary: {
      totalCostBasis: res.totals.totalActiveCostBasis,
      totalMarketValue: res.totals.totalMarketValue,
      totalUnrealizedPnl: res.totals.totalUnrealizedPnL,
      totalUnrealizedPnlPct: res.totals.totalUnrealizedPct,
      totalRealizedPnl: res.totals.totalRealizedPnL,
      totalDayChangeValue: 0,
      totalDayChangePct: 0,
      totalGrossDividendsPaid: res.totals.totalGrossDivPaid,
      totalWhtPaid: res.totals.totalWhtPaid,
      totalZakatPaid: res.totals.totalZakatPaid,
      totalNetDividendsPaid: res.totals.totalNetDivPaid,
      totalNetDividendsUnpaid: res.totals.totalNetDivUnpaid,
      portfolioYieldOnCostPct: 0,
      portfolioCurrentYieldPct: 0,
      totalBuyCashOutflow: res.totals.totalBuyOutflow,
      totalSellCashInflow: res.totals.effectiveSellInflow,
      legacyMcbProceeds: 78315.33,
      netOutOfPocketCapital: res.totals.netCashInvested,
      totalBrokeragePaid: 0,
      totalSstPaid: 0,
      totalAllInclusiveReturn: res.totals.allInNetProfit,
      totalAllInclusiveReturnPct: res.totals.allInRoiPct,
      activeCount: res.totals.activeHoldingsCount,
      totalCompanies: res.holdings.length,
    },
  };
}
