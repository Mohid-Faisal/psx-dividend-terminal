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

export function computePortfolioAnalytics(state: PortfolioState) {
  const companyMap = new Map(state.companies.map((c) => [c.ticker, c]));

  const sortedTxns = [...(state.transactions || [])].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.id || 0) - (b.id || 0);
  });

  const posMap = new Map<
    string,
    PositionSummary & {
      legacyShares: number;
      isLegacyLiquidation: boolean;
      reinvestedDivNet: number;
    }
  >();

  for (const c of state.companies || []) {
    const sym = (c.ticker || "").trim().toUpperCase();
    if (!sym) continue;
    const legacySh = sym === "MCB" ? 225 : 0;
    posMap.set(sym, {
      ticker: sym,
      name: c.name || sym,
      sector: c.sector || "OTHER",
      frequency: c.frequency || "None",
      shares: legacySh,
      legacyShares: legacySh,
      isLegacyLiquidation: false,
      reinvestedDivNet: 0,
      totalSharesBought: 0,
      totalSharesSold: 0,
      wac: 0,
      costBasis: 0,
      livePrice: Number(c.price) || 0,
      ldcp: Number(c.ldcp) || Number(c.price) || 0,
      dayChange: Number(c.change) || 0,
      dayChangePct: Number(c.changePct) || 0,
      marketValue: 0,
      unrealizedPnl: 0,
      unrealizedPnlPct: 0,
      realizedPnl: 0,
      grossDividends: 0,
      whtTotal: 0,
      zakatTotal: 0,
      netDividendsPaid: 0,
      netDividendsUnpaid: 0,
      totalReturn: 0,
      totalReturnPct: 0,
      yieldOnCostPct: 0,
      currentYieldPct: 0,
      weightPct: 0,
      high52: c.high52 || "N/A",
      dayRange: c.dayRange || "N/A",
      volume: c.volume || "0",
      pe: c.pe || "N/A",
      asOf: c.asOf || "",
      lots: [],
    });
  }

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

  let totalBuyCashOutflow = 0;
  let totalSellCashInflowAll = 0;
  let totalSellCashInflowExLegacy = 0;
  let totalBrokeragePaid = 0;
  let totalSstPaid = 0;

  const enrichedTransactions: EnrichedTransaction[] = [];

  for (const tx of sortedTxns) {
    const sym = (tx.ticker || "").trim().toUpperCase();
    let pos = posMap.get(sym);
    if (!pos) {
      const fallbackComp = companyMap.get(sym);
      const legacySh = sym === "MCB" ? 225 : 0;
      pos = {
        ticker: sym,
        name: tx.company || fallbackComp?.name || sym,
        sector: fallbackComp?.sector || "OTHER",
        frequency: fallbackComp?.frequency || "None",
        shares: legacySh,
        legacyShares: legacySh,
        isLegacyLiquidation: false,
        reinvestedDivNet: 0,
        totalSharesBought: 0,
        totalSharesSold: 0,
        wac: 0,
        costBasis: 0,
        livePrice: fallbackComp?.price || tx.price,
        ldcp: fallbackComp?.ldcp || tx.price,
        dayChange: fallbackComp?.change || 0,
        dayChangePct: fallbackComp?.changePct || 0,
        marketValue: 0,
        unrealizedPnl: 0,
        unrealizedPnlPct: 0,
        realizedPnl: 0,
        grossDividends: 0,
        whtTotal: 0,
        zakatTotal: 0,
        netDividendsPaid: 0,
        netDividendsUnpaid: 0,
        totalReturn: 0,
        totalReturnPct: 0,
        yieldOnCostPct: 0,
        currentYieldPct: 0,
        weightPct: 0,
        high52: "N/A",
        dayRange: "N/A",
        volume: "0",
        pe: "N/A",
        asOf: "",
        lots: [],
      };
      posMap.set(sym, pos);
    }

    const shares = Math.abs(Number(tx.shares) || 0);
    const price = Number(tx.price) || 0;
    const gross = shares * price;
    const brk = Number(tx.brkFees) || 0;
    const sst = Number(tx.sst) || 0;
    const fees = brk + sst;
    const ym = (tx.date || "").slice(0, 7);
    const mObj = ensureMonth(ym);
    let netCashFlow = 0;

    totalBrokeragePaid += brk;
    totalSstPaid += sst;

    if (tx.action === "Buy") {
      const lotCost = Number((gross + fees).toFixed(2));
      netCashFlow = -lotCost;
      pos.shares += shares;
      pos.totalSharesBought += shares;
      pos.costBasis = Number((pos.costBasis + lotCost).toFixed(2));
      pos.wac = pos.shares > 0 ? Number((pos.costBasis / pos.shares).toFixed(4)) : 0;
      totalBuyCashOutflow += lotCost;
      if (mObj) mObj.buyOutflow += lotCost;

      pos.lots.push({
        id: tx.id,
        date: tx.date,
        action: "Buy",
        shares,
        price,
        fees,
        totalAmount: lotCost,
        runningShares: pos.shares,
        runningWac: pos.wac,
        realizedPnl: 0,
      });
    } else {
      const netProceeds = Number((gross - fees).toFixed(2));
      netCashFlow = netProceeds;
      pos.totalSharesSold += shares;
      totalSellCashInflowAll += netProceeds;
      if (mObj) mObj.sellInflow += netProceeds;

      if (pos.totalSharesBought === 0 && pos.legacyShares >= shares) {
        pos.isLegacyLiquidation = true;
        pos.shares = Math.max(0, pos.shares - shares);
        pos.wac = 0;
        pos.costBasis = 0;
      } else {
        totalSellCashInflowExLegacy += netProceeds;
        if (mObj) mObj.sellInflowExLegacy += netProceeds;
        const currentWac = pos.shares > 0 ? pos.costBasis / pos.shares : 0;
        const costRemoved = Number((shares * currentWac).toFixed(2));
        const lotRealizedPnl = Number((netProceeds - costRemoved).toFixed(2));
        pos.realizedPnl = Number((pos.realizedPnl + lotRealizedPnl).toFixed(2));
        pos.shares = Math.max(0, pos.shares - shares);
        pos.costBasis = Math.max(0, Number((pos.costBasis - costRemoved).toFixed(2)));
        pos.wac = pos.shares > 0 ? Number((pos.costBasis / pos.shares).toFixed(4)) : 0;
      }

      pos.lots.push({
        id: tx.id,
        date: tx.date,
        action: "Sell",
        shares,
        price,
        fees,
        totalAmount: netProceeds,
        runningShares: pos.shares,
        runningWac: pos.wac,
        realizedPnl: pos.realizedPnl,
      });
    }

    enrichedTransactions.push({
      ...tx,
      ticker: sym,
      company: pos.name,
      shares,
      price,
      grossAmount: gross,
      brkFees: brk,
      sst,
      netCashFlow,
      ym,
      runningWac: pos.wac,
      runningShares: pos.shares,
    });
  }

  let totalGrossDividendsPaid = 0;
  let totalWhtPaid = 0;
  let totalZakatPaid = 0;
  let totalNetDividendsPaid = 0;
  let totalNetDividendsUnpaid = 0;
  let totalReinvestedDividendsNet = 0;

  const sortedDivs = [...(state.dividends || [])].sort((a, b) => {
    if (a.paymentDate !== b.paymentDate)
      return (a.paymentDate || "").localeCompare(b.paymentDate || "");
    return (a.id || 0) - (b.id || 0);
  });

  const enrichedDividends: EnrichedDividend[] = [];

  for (const div of sortedDivs) {
    const sym = (div.ticker || "").trim().toUpperCase();
    const pos = posMap.get(sym);
    const sharesEligible = Number(div.sharesEligible) || 0;
    const dps = Number(div.dps) || 0;
    const gross = sharesEligible * dps;
    const wht = Number(div.wht) || 0;
    const zakat = Number(div.zakat) || 0;
    const net = Math.max(0, gross - wht - zakat);
    const ym = (div.paymentDate || "").slice(0, 7);
    const status = div.status || "Paid";
    const reinvest = div.reinvest || "No";

    let matchedDripTx: EnrichedTransaction | null = null;
    if (reinvest === "Yes" && div.paymentDate) {
      const payTime = new Date(div.paymentDate).getTime();
      matchedDripTx =
        enrichedTransactions.find((tx) => {
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
      totalGrossDividendsPaid += gross;
      totalWhtPaid += wht;
      totalZakatPaid += zakat;
      totalNetDividendsPaid += net;
      if (reinvest === "Yes") totalReinvestedDividendsNet += net;
      if (pos) {
        pos.grossDividends += gross;
        pos.whtTotal += wht;
        pos.zakatTotal += zakat;
        pos.netDividendsPaid += net;
        if (reinvest === "Yes") pos.reinvestedDivNet += net;
      }
      const mObj = ensureMonth(ym);
      if (mObj) {
        mObj.grossDiv += gross;
        mObj.wht += wht;
        mObj.zakat += zakat;
        mObj.netDiv += net;
        if (reinvest === "Yes") mObj.reinvValue += net;
      }
    } else {
      totalNetDividendsUnpaid += net;
      if (pos) {
        pos.netDividendsUnpaid += net;
      }
    }

    enrichedDividends.push({
      ...div,
      ticker: sym,
      company: pos?.name || sym,
      sharesEligible,
      dps,
      grossDividend: gross,
      wht,
      zakat,
      netDividend: net,
      ym,
      status,
      reinvest,
      matchedDripTx,
    });
  }

  // Helper to determine if an interim dividend belongs to the subsequent fiscal year
  // (e.g. HUBC / OGDC 2027 1Q, or DCR 2026-27 1Q when the company's 2025-26 / 2026 final 'YR' dividend is already recorded)
  function isNextYearInterim(d: DividendRecord, allDivs: DividendRecord[]): boolean {
    const sym = (d.ticker || "").toUpperCase().trim();
    const yr = (d.year || "").trim();
    const term = (d.term || "").trim().toUpperCase();

    if (term === "1Q" || term === "HYR") {
      if (yr.startsWith("2027") || yr === "2027") return true;
      if (yr === "2026-27" || yr.includes("-27")) {
        const hasPriorCompletedYR = allDivs.some((other) => {
          if ((other.ticker || "").toUpperCase().trim() !== sym) return false;
          const otherTerm = (other.term || "").toUpperCase().trim();
          const otherYr = (other.year || "").trim();
          return (
            otherTerm === "YR" &&
            (otherYr.includes("2025-26") || otherYr.includes("2026"))
          );
        });
        if (hasPriorCompletedYR) return true;
      }
    }
    return false;
  }

  // Calculate annual DPS per ticker for yearly dividend yield calculation
  const annualDpsMap = new Map<string, number>();
  let maxDivTimestamp = 0;
  for (const div of state.dividends) {
    const dps = Number(div.dps) || 0;
    if (dps <= 0) continue;
    const t = div.paymentDate ? new Date(div.paymentDate).getTime() : 0;
    if (t > maxDivTimestamp) maxDivTimestamp = t;
  }
  const refTime = Math.max(Date.now(), maxDivTimestamp);
  const oneYearMs = 365.25 * 24 * 60 * 60 * 1000;

  for (const div of state.dividends) {
    const sym = (div.ticker || "").toUpperCase().trim();
    const dps = Number(div.dps) || 0;
    if (dps <= 0) continue;
    // Exclude advance interims announced for the upcoming fiscal year
    if (isNextYearInterim(div, state.dividends)) {
      continue;
    }
    if (div.paymentDate) {
      const divTime = new Date(div.paymentDate).getTime();
      if (!isNaN(divTime) && refTime - divTime > oneYearMs) {
        continue;
      }
    }
    const cur = annualDpsMap.get(sym) || 0;
    annualDpsMap.set(sym, cur + dps);
  }

  let totalCostBasis = 0;
  let totalMarketValue = 0;
  let totalUnrealizedPnl = 0;
  let totalRealizedPnl = 0;
  let totalDayChangeValue = 0;
  let totalActiveShares = 0;

  const positions: PositionSummary[] = [];

  for (const pos of posMap.values()) {
    pos.costBasis = Number(pos.costBasis.toFixed(2));
    pos.marketValue = Number((pos.shares * pos.livePrice).toFixed(2));
    pos.wac = pos.shares > 0 ? Number((pos.costBasis / pos.shares).toFixed(2)) : 0;
    pos.unrealizedPnl = pos.shares > 0 ? Number((pos.marketValue - pos.costBasis).toFixed(2)) : 0;
    pos.unrealizedPnlPct =
      pos.costBasis > 0 ? (pos.unrealizedPnl / pos.costBasis) * 100 : 0;
    pos.totalReturn = Number(
      (pos.unrealizedPnl + pos.realizedPnl + pos.netDividendsPaid).toFixed(2)
    );
    pos.totalReturnPct =
      pos.costBasis > 0 ? (pos.totalReturn / pos.costBasis) * 100 : 0;
    pos.yieldOnCostPct =
      pos.costBasis > 0 ? (pos.netDividendsPaid / pos.costBasis) * 100 : 0;
    const annualDps = annualDpsMap.get(pos.ticker) || 0;
    pos.currentYieldPct =
      pos.livePrice > 0 ? (annualDps / pos.livePrice) * 100 : 0;

    totalCostBasis += pos.costBasis;
    totalMarketValue += pos.marketValue;
    totalUnrealizedPnl += pos.unrealizedPnl;
    totalRealizedPnl += pos.realizedPnl;
    totalDayChangeValue += pos.shares * pos.dayChange;
    totalActiveShares += pos.shares;

    positions.push(pos);
  }

  totalCostBasis = Number(totalCostBasis.toFixed(2));
  totalMarketValue = Number(totalMarketValue.toFixed(2));
  totalUnrealizedPnl = Number(totalUnrealizedPnl.toFixed(2));
  totalRealizedPnl = Number(totalRealizedPnl.toFixed(2));
  totalDayChangeValue = Number(totalDayChangeValue.toFixed(2));

  for (const pos of positions) {
    pos.weightPct =
      totalMarketValue > 0 ? (pos.marketValue / totalMarketValue) * 100 : 0;
  }

  const activePositions = positions
    .filter((p) => p.shares > 0)
    .sort((a, b) => b.marketValue - a.marketValue);

  const exitedPositions = positions.filter(
    (p) => p.shares === 0 && (p.totalSharesBought > 0 || p.totalSharesSold > 0)
  );

  // Sector breakdown
  const sectorMap = new Map<
    string,
    {
      sector: string;
      costBasis: number;
      marketValue: number;
      unrealizedPnl: number;
      netDividends: number;
      weightPct: number;
      count: number;
    }
  >();

  for (const pos of activePositions) {
    const sec = pos.sector || "OTHER";
    const cur = sectorMap.get(sec) || {
      sector: sec,
      costBasis: 0,
      marketValue: 0,
      unrealizedPnl: 0,
      netDividends: 0,
      weightPct: 0,
      count: 0,
    };
    cur.costBasis += pos.costBasis;
    cur.marketValue += pos.marketValue;
    cur.unrealizedPnl += pos.unrealizedPnl;
    cur.netDividends += pos.netDividendsPaid;
    cur.count += 1;
    sectorMap.set(sec, cur);
  }

  const sectors = Array.from(sectorMap.values())
    .map((s) => ({
      ...s,
      weightPct:
        totalMarketValue > 0 ? (s.marketValue / totalMarketValue) * 100 : 0,
    }))
    .sort((a, b) => b.marketValue - a.marketValue);

  // Monthly dividend breakdown for MonthlyDividendChart (Last 12 Rolling Months)
  const monthlyDivMap = new Map<
    string,
    {
      monthKey: string;
      label: string;
      gross: number;
      net: number;
      wht: number;
      zakat: number;
      count: number;
    }
  >();

  const paidDivs = [...enrichedDividends].filter(
    (d) => d.status === "Paid" && d.paymentDate
  );

  const monthNames = [
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

  // Determine latest year-month from paid dividends or current date
  let latestYm = "2026-11";
  for (const d of paidDivs) {
    const ym = d.paymentDate.slice(0, 7);
    if (ym > latestYm) latestYm = ym;
  }

  const [endYrStr, endMoStr] = latestYm.split("-");
  const endYr = parseInt(endYrStr, 10);
  const endMo = parseInt(endMoStr, 10);

  // Initialize exactly 12 consecutive months ending at latestYm (e.g. Dec '25 to Nov '26)
  const ltmKeys: string[] = [];
  for (let i = 11; i >= 0; i--) {
    let m = endMo - i;
    let y = endYr;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    const ymStr = `${y}-${String(m).padStart(2, "0")}`;
    ltmKeys.push(ymStr);
  }

  for (const ym of ltmKeys) {
    const [yr, mo] = ym.split("-");
    const mIdx = Math.max(0, Math.min(11, parseInt(mo, 10) - 1));
    const label = `${monthNames[mIdx]} '${yr.slice(2)}`;
    monthlyDivMap.set(ym, {
      monthKey: ym,
      label,
      gross: 0,
      net: 0,
      wht: 0,
      zakat: 0,
      count: 0,
    });
  }

  // Populate data into the 12-month map
  for (const d of paidDivs) {
    const ym = d.paymentDate.slice(0, 7);
    if (!monthlyDivMap.has(ym)) continue;
    const cur = monthlyDivMap.get(ym)!;
    cur.gross = Number((cur.gross + d.grossDividend).toFixed(2));
    cur.net = Number((cur.net + d.netDividend).toFixed(2));
    cur.wht = Number((cur.wht + d.wht).toFixed(2));
    cur.zakat = Number((cur.zakat + d.zakat).toFixed(2));
    cur.count += 1;
  }

  let runningCumNet = 0;
  const monthlyDividends = Array.from(monthlyDivMap.values()).map((m) => {
    runningCumNet = Number((runningCumNet + m.net).toFixed(2));
    return {
      ...m,
      cumulativeNet: runningCumNet,
    };
  });

  const includeLegacy = state.settings?.includeLegacyMcbInCashflow !== false;
  const effectiveSellInflow = includeLegacy
    ? totalSellCashInflowAll
    : totalSellCashInflowExLegacy;
  const netOutOfPocketCapital = totalBuyCashOutflow - effectiveSellInflow;

  const totalAllInclusiveReturn =
    totalUnrealizedPnl + totalRealizedPnl + totalNetDividendsPaid;
  const totalAllInclusiveReturnPct =
    totalCostBasis > 0 ? (totalAllInclusiveReturn / totalCostBasis) * 100 : 0;

  let totalProjectedAnnualDividends = 0;
  for (const pos of positions) {
    if (pos.shares > 0) {
      const annualDps = annualDpsMap.get(pos.ticker) || 0;
      totalProjectedAnnualDividends += pos.shares * annualDps;
    }
  }

  return {
    positions,
    activePositions,
    exitedPositions,
    sectors,
    monthlyDividends,
    enrichedTransactions,
    enrichedDividends,
    monthlySummary: Object.values(monthlyMap).sort((a, b) =>
      a.ym.localeCompare(b.ym)
    ),
    summary: {
      totalActiveShares,
      totalCostBasis,
      totalMarketValue,
      totalUnrealizedPnl,
      totalUnrealizedPnlPct:
        totalCostBasis > 0 ? (totalUnrealizedPnl / totalCostBasis) * 100 : 0,
      totalRealizedPnl,
      totalDayChangeValue,
      totalDayChangePct:
        totalMarketValue - totalDayChangeValue > 0
          ? (totalDayChangeValue / (totalMarketValue - totalDayChangeValue)) *
            100
          : 0,
      totalGrossDividendsPaid,
      totalWhtPaid,
      totalZakatPaid,
      totalNetDividendsPaid,
      totalNetDividendsUnpaid,
      totalReinvestedDividendsNet,
      portfolioYieldOnCostPct:
        totalCostBasis > 0
          ? (totalNetDividendsPaid / totalCostBasis) * 100
          : 0,
      portfolioCurrentYieldPct:
        totalMarketValue > 0
          ? (totalProjectedAnnualDividends / totalMarketValue) * 100
          : 0,
      totalBuyCashOutflow,
      totalSellCashInflow: effectiveSellInflow,
      legacyMcbProceeds: LEGACY_MCB_SALE.netProceeds,
      netOutOfPocketCapital,
      totalBrokeragePaid,
      totalSstPaid,
      totalAllInclusiveReturn,
      totalAllInclusiveReturnPct,
      activeCount: activePositions.length,
      totalCompanies: state.companies.length,
    },
  };
}
