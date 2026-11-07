import {
  PortfolioState,
  PositionSummary,
} from "@/types/portfolio";

export const LEGACY_MCB_SALE = {
  date: "2025-11-25",
  ticker: "MCB",
  shares: 219,
  price: 357.6,
  netProceeds: 78315.33,
};

export function computeBrokerageAndSst(
  shares: number,
  price: number,
  rate = 0.0015,
  minPerShare = 0.05,
  sstRate = 0.15
) {
  const gross = shares * price;
  const brkFees = Number(Math.max(gross * rate, shares * minPerShare).toFixed(2));
  const sst = Number((brkFees * sstRate).toFixed(2));
  return { brkFees, sst };
}

export function computePortfolioAnalytics(state: PortfolioState) {
  const companyMap = new Map(state.companies.map((c) => [c.ticker, c]));

  // Sort transactions chronologically by date, then id
  const sortedTxns = [...state.transactions].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.id - b.id;
  });

  const posMap = new Map<string, PositionSummary>();

  for (const c of state.companies) {
    posMap.set(c.ticker, {
      ticker: c.ticker,
      name: c.name,
      sector: c.sector || "OTHER",
      frequency: c.frequency || "None",
      shares: 0,
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

  let totalBuyCashOutflow = 0;
  let totalSellCashInflow = 0;
  let totalBrokeragePaid = 0;
  let totalSstPaid = 0;

  for (const tx of sortedTxns) {
    let pos = posMap.get(tx.ticker);
    if (!pos) {
      const fallbackComp = companyMap.get(tx.ticker);
      pos = {
        ticker: tx.ticker,
        name: tx.company || fallbackComp?.name || tx.ticker,
        sector: fallbackComp?.sector || "OTHER",
        frequency: fallbackComp?.frequency || "None",
        shares: 0,
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
      posMap.set(tx.ticker, pos);
    }

    const shares = Number(tx.shares) || 0;
    const price = Number(tx.price) || 0;
    const brk = Number(tx.brkFees) || 0;
    const sst = Number(tx.sst) || 0;
    const fees = brk + sst;

    totalBrokeragePaid += brk;
    totalSstPaid += sst;

    if (tx.action === "Buy") {
      const lotCost = shares * price + fees;
      pos.shares += shares;
      pos.totalSharesBought += shares;
      pos.costBasis += lotCost;
      pos.wac = pos.shares > 0 ? pos.costBasis / pos.shares : 0;
      totalBuyCashOutflow += lotCost;

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
      // Sell reduces cost basis proportionally by sharesSold * currentWAC
      const netProceeds = shares * price - fees;
      const costRemoved = shares * pos.wac;
      const lotRealizedPnl = netProceeds - costRemoved;

      pos.shares = Math.max(0, pos.shares - shares);
      pos.totalSharesSold += shares;
      pos.costBasis = Math.max(0, pos.costBasis - costRemoved);
      if (pos.shares === 0) {
        pos.costBasis = 0;
        pos.wac = 0;
      }
      pos.realizedPnl += lotRealizedPnl;
      totalSellCashInflow += netProceeds;

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
        realizedPnl: lotRealizedPnl,
      });
    }
  }

  // Process dividends
  let totalGrossDividendsPaid = 0;
  let totalWhtPaid = 0;
  let totalZakatPaid = 0;
  let totalNetDividendsPaid = 0;
  let totalNetDividendsUnpaid = 0;

  for (const div of state.dividends) {
    const pos = posMap.get(div.ticker);
    const gross = (Number(div.sharesEligible) || 0) * (Number(div.dps) || 0);
    const wht = Number(div.wht) || 0;
    const zakat = Number(div.zakat) || 0;
    const net = Math.max(0, gross - wht - zakat);

    if (div.status === "Paid") {
      totalGrossDividendsPaid += gross;
      totalWhtPaid += wht;
      totalZakatPaid += zakat;
      totalNetDividendsPaid += net;
      if (pos) {
        pos.grossDividends += gross;
        pos.whtTotal += wht;
        pos.zakatTotal += zakat;
        pos.netDividendsPaid += net;
      }
    } else {
      totalNetDividendsUnpaid += net;
      if (pos) {
        pos.netDividendsUnpaid += net;
      }
    }
  }

  let totalCostBasis = 0;
  let totalMarketValue = 0;
  let totalUnrealizedPnl = 0;
  let totalRealizedPnl = 0;
  let totalDayChangeValue = 0;

  const positions: PositionSummary[] = [];

  for (const pos of posMap.values()) {
    pos.marketValue = pos.shares * pos.livePrice;
    pos.unrealizedPnl = pos.shares > 0 ? pos.marketValue - pos.costBasis : 0;
    pos.unrealizedPnlPct =
      pos.costBasis > 0 ? (pos.unrealizedPnl / pos.costBasis) * 100 : 0;
    pos.totalReturn =
      pos.unrealizedPnl + pos.realizedPnl + pos.netDividendsPaid;
    pos.totalReturnPct =
      pos.costBasis > 0 ? (pos.totalReturn / pos.costBasis) * 100 : 0;
    pos.yieldOnCostPct =
      pos.costBasis > 0 ? (pos.netDividendsPaid / pos.costBasis) * 100 : 0;
    pos.currentYieldPct =
      pos.marketValue > 0 ? (pos.netDividendsPaid / pos.marketValue) * 100 : 0;

    totalCostBasis += pos.costBasis;
    totalMarketValue += pos.marketValue;
    totalUnrealizedPnl += pos.unrealizedPnl;
    totalRealizedPnl += pos.realizedPnl;
    totalDayChangeValue += pos.shares * pos.dayChange;

    positions.push(pos);
  }

  for (const pos of positions) {
    pos.weightPct =
      totalMarketValue > 0 ? (pos.marketValue / totalMarketValue) * 100 : 0;
  }

  const activePositions = positions
    .filter((p) => p.shares > 0)
    .sort((a, b) => b.marketValue - a.marketValue);

  const exitedPositions = positions.filter(
    (p) => p.shares === 0 && p.totalSharesBought > 0
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

  // Monthly dividend breakdown
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

  const paidDivs = [...state.dividends]
    .filter((d) => d.status === "Paid" && d.paymentDate)
    .sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));

  for (const d of paidDivs) {
    const monthKey = d.paymentDate.slice(0, 7); // YYYY-MM
    const [yr, mo] = monthKey.split("-");
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
    const label = `${monthNames[Math.max(0, parseInt(mo, 10) - 1)]} '${yr.slice(2)}`;
    const gross = d.sharesEligible * d.dps;
    const net = Math.max(0, gross - d.wht - d.zakat);
    const cur = monthlyDivMap.get(monthKey) || {
      monthKey,
      label,
      gross: 0,
      net: 0,
      wht: 0,
      zakat: 0,
      count: 0,
    };
    cur.gross += gross;
    cur.net += net;
    cur.wht += d.wht;
    cur.zakat += d.zakat;
    cur.count += 1;
    monthlyDivMap.set(monthKey, cur);
  }

  let runningCumNet = 0;
  const monthlyDividends = Array.from(monthlyDivMap.values()).map((m) => {
    runningCumNet += m.net;
    return {
      ...m,
      cumulativeNet: runningCumNet,
    };
  });

  const legacyMcbProceeds = state.settings.includeLegacyMcbInCashflow
    ? LEGACY_MCB_SALE.netProceeds
    : 0;

  const netOutOfPocketCapital =
    totalBuyCashOutflow -
    totalSellCashInflow -
    legacyMcbProceeds -
    totalNetDividendsPaid;

  const totalAllInclusiveReturn =
    totalUnrealizedPnl + totalRealizedPnl + totalNetDividendsPaid;
  const totalAllInclusiveReturnPct =
    totalCostBasis > 0 ? (totalAllInclusiveReturn / totalCostBasis) * 100 : 0;

  return {
    positions,
    activePositions,
    exitedPositions,
    sectors,
    monthlyDividends,
    summary: {
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
      portfolioYieldOnCostPct:
        totalCostBasis > 0
          ? (totalNetDividendsPaid / totalCostBasis) * 100
          : 0,
      portfolioCurrentYieldPct:
        totalMarketValue > 0
          ? (totalNetDividendsPaid / totalMarketValue) * 100
          : 0,
      totalBuyCashOutflow,
      totalSellCashInflow,
      legacyMcbProceeds,
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
