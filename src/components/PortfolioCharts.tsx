"use client";

import React, { useState, useMemo } from "react";
import { PositionSummary } from "@/types/portfolio";

interface MonthlyDivItem {
  monthKey: string;
  label: string;
  gross: number;
  net: number;
  wht: number;
  zakat: number;
  count: number;
  cumulativeNet: number;
}

interface SectorItem {
  sector: string;
  costBasis: number;
  marketValue: number;
  unrealizedPnl: number;
  netDividends: number;
  weightPct: number;
  count: number;
}

const SECTOR_COLORS = [
  "#10b981",
  "#6366f1",
  "#f59e0b",
  "#06b6d4",
  "#ec4899",
  "#8b5cf6",
  "#14b8a6",
  "#f97316",
  "#3b82f6",
  "#84cc16",
];

export function MonthlyDividendChart({
  data,
  totalGross,
  totalNet,
  totalWht,
  totalZakat,
}: {
  data: MonthlyDivItem[];
  totalGross: number;
  totalNet: number;
  totalWht: number;
  totalZakat: number;
}) {
  const maxGross = Math.max(...data.map((d) => d.gross), 1);
  const maxCum = Math.max(...data.map((d) => d.cumulativeNet), 1);
  const avgMonthlyNet = data.length > 0 ? totalNet / data.length : 0;
  const bestMonth =
    data.length > 0
      ? [...data].sort((a, b) => b.net - a.net)[0]
      : { label: "N/A", net: 0 };

  return (
    <div className="rune-card p-5 flex flex-col justify-between h-full">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <span className="text-[11px] uppercase tracking-widest text-emerald-400 font-semibold">
              Income Velocity &amp; Tax Breakdown
            </span>
            <h3 className="text-base font-semibold mt-0.5">
              Monthly Net Dividends, Withholding Tax &amp; Cumulative Growth
            </h3>
          </div>
          {/* Explicit Legend */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
              Net Payout (PKR)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-rose-500/80 inline-block" />
              WHT + Zakat Deducted
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-amber-400 inline-block" />
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block -ml-2" />
              Net Realized Cash Curve (Right Scale)
            </span>
          </div>
        </div>

        {/* SVG Combo Bar + Cumulative Line Chart with Dual Scales (Left: Monthly, Right: Cumulative Net Cash) */}
        <div className="w-full overflow-x-auto pt-2 pb-1">
          <svg
            viewBox="0 0 710 220"
            className="w-full h-[215px] min-w-[540px]"
          >
            {/* Axis Titles */}
            <text
              x={44}
              y={12}
              textAnchor="end"
              className="fill-slate-400 text-[9px] font-semibold uppercase tracking-wider"
            >
              Monthly (PKR)
            </text>
            <text
              x={656}
              y={12}
              textAnchor="start"
              className="fill-amber-400 text-[9px] font-semibold uppercase tracking-wider"
            >
              Net Cash (PKR)
            </text>

            {/* Horizontal grid lines & Dual Ticks */}
            {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
              const y = 24 + (1 - t) * 150;
              const leftVal = Math.round(t * maxGross);
              const rightVal = Math.round(t * maxCum);
              return (
                <g key={i}>
                  <line
                    x1={48}
                    y1={y}
                    x2={650}
                    y2={y}
                    stroke="rgba(148,163,184,0.14)"
                    strokeDasharray="3 3"
                  />
                  {/* Left Scale: Monthly Bar Values */}
                  <text
                    x={44}
                    y={y + 3.5}
                    textAnchor="end"
                    className="fill-slate-400 text-[10px] font-mono-num"
                  >
                    {leftVal >= 1000 ? `${(leftVal / 1000).toFixed(1)}k` : leftVal}
                  </text>
                  {/* Right Scale: Cumulative Net Realized Cash Dividends */}
                  <text
                    x={656}
                    y={y + 3.5}
                    textAnchor="start"
                    className="fill-amber-400 text-[10px] font-mono-num font-medium"
                  >
                    {rightVal >= 1000 ? `${(rightVal / 1000).toFixed(1)}k` : rightVal}
                  </text>
                </g>
              );
            })}

            {/* Stacked Bars */}
            {data.map((d, idx) => {
              const slotW = 590 / Math.max(data.length, 1);
              const barW = Math.min(36, slotW * 0.54);
              const x = 54 + idx * slotW + (slotW - barW) / 2;
              const netH = (d.net / maxGross) * 150;
              const taxH = ((d.wht + d.zakat) / maxGross) * 150;
              const yNet = 174 - netH;
              const yTax = yNet - taxH;

              return (
                <g key={d.monthKey}>
                  {/* Net Bar */}
                  <rect
                    x={x}
                    y={yNet}
                    width={barW}
                    height={Math.max(2, netH)}
                    rx={4}
                    fill="#10b981"
                  />
                  {/* Stacked Tax Bar */}
                  {taxH > 0.5 && (
                    <rect
                      x={x}
                      y={yTax}
                      width={barW}
                      height={Math.max(2, taxH)}
                      rx={3}
                      fill="#f43f5e"
                      opacity={0.85}
                    />
                  )}
                  {/* Net Value Label */}
                  <text
                    x={x + barW / 2}
                    y={Math.max(14, yTax - 6)}
                    textAnchor="middle"
                    className="fill-emerald-300 text-[10px] font-mono-num font-semibold"
                  >
                    {Math.round(d.net).toLocaleString()}
                  </text>
                  {/* Month Label */}
                  <text
                    x={x + barW / 2}
                    y={194}
                    textAnchor="middle"
                    className="fill-slate-300 text-[10px] font-medium"
                  >
                    {d.label}
                  </text>
                  <text
                    x={x + barW / 2}
                    y={207}
                    textAnchor="middle"
                    className="fill-slate-500 text-[9px] font-mono-num"
                  >
                    ({d.count} div{d.count > 1 ? "s" : ""})
                  </text>
                </g>
              );
            })}

            {/* Cumulative Net Line connected to Right Scale */}
            {data.length > 1 && (
              <>
                <polyline
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth={2.5}
                  points={data
                    .map((d, idx) => {
                      const slotW = 590 / Math.max(data.length, 1);
                      const cx = 54 + idx * slotW + slotW / 2;
                      const cy = 174 - (d.cumulativeNet / maxCum) * 150;
                      return `${cx},${cy}`;
                    })
                    .join(" ")}
                />
                {data.map((d, idx) => {
                  const slotW = 590 / Math.max(data.length, 1);
                  const cx = 54 + idx * slotW + slotW / 2;
                  const cy = 174 - (d.cumulativeNet / maxCum) * 150;
                  return (
                    <circle
                      key={d.monthKey}
                      cx={cx}
                      cy={cy}
                      r={4}
                      fill="#f59e0b"
                      stroke="#0f1117"
                      strokeWidth={1.5}
                    />
                  );
                })}
              </>
            )}
          </svg>
        </div>
      </div>

      {/* Bottom Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3 mt-2 border-t border-white/10 text-xs">
        <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
          <div className="text-slate-400 text-[11px]">Gross Declared</div>
          <div className="font-mono-num font-semibold text-sm mt-0.5">
            Rs. {totalGross.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="p-2.5 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20">
          <div className="text-emerald-300/80 text-[11px]">
            Net Realized Cash
          </div>
          <div className="font-mono-num font-semibold text-emerald-400 text-sm mt-0.5">
            Rs. {totalNet.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="p-2.5 rounded-xl bg-rose-500/[0.06] border border-rose-500/20">
          <div className="text-rose-300/80 text-[11px]">
            WHT + Zakat Deducted
          </div>
          <div className="font-mono-num font-semibold text-rose-400 text-sm mt-0.5">
            Rs. {(totalWht + totalZakat).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="p-2.5 rounded-xl bg-amber-500/[0.06] border border-amber-500/20">
          <div className="text-amber-300/80 text-[11px]">
            Peak Month ({bestMonth.label})
          </div>
          <div className="font-mono-num font-semibold text-amber-300 text-sm mt-0.5">
            Rs. {bestMonth.net.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
            <span className="text-[10px] text-slate-400">
              (Avg {avgMonthlyNet.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SectorAllocationCard({
  sectors,
  selectedSector,
  onSelectSector,
}: {
  sectors: SectorItem[];
  selectedSector: string;
  onSelectSector: (sec: string) => void;
}) {
  const [metric, setMetric] = useState<"market_value" | "dividends" | "cost">(
    "market_value"
  );

  const totalMarketVal = sectors.reduce((sum, s) => sum + s.marketValue, 0);
  const totalNetDivs = sectors.reduce((sum, s) => sum + s.netDividends, 0);
  const totalCost = sectors.reduce((sum, s) => sum + s.costBasis, 0);

  const totalCurrentMetric =
    metric === "dividends"
      ? totalNetDivs
      : metric === "cost"
      ? totalCost
      : totalMarketVal;

  const sortedSectors = useMemo(() => {
    return [...sectors].sort((a, b) => {
      if (metric === "dividends") return b.netDividends - a.netDividends;
      if (metric === "cost") return b.costBasis - a.costBasis;
      return b.marketValue - a.marketValue;
    });
  }, [sectors, metric]);

  return (
    <div className="rune-card p-5 flex flex-col justify-between h-full">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <span className="text-[11px] uppercase tracking-widest text-cyan-400 font-semibold">
              PSX Sector Concentration
            </span>
            <h3 className="text-base font-semibold mt-0.5">
              Portfolio Allocation by Sector
            </h3>
          </div>
          {/* Dropdown Select by Dividend Received / Market Value / Cost Invested */}
          <div className="flex items-center gap-2">
            <select
              value={metric}
              onChange={(e) =>
                setMetric(
                  e.target.value as "market_value" | "dividends" | "cost"
                )
              }
              className="rune-input px-3 py-1.5 text-xs font-semibold cursor-pointer max-w-[195px]"
            >
              <option value="market_value">By Market Value</option>
              <option value="dividends">By Dividends Received</option>
              <option value="cost">By Cost Invested</option>
            </select>
            {selectedSector !== "ALL" && (
              <button
                onClick={() => onSelectSector("ALL")}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-500/30 cursor-pointer"
                title="Clear sector filter"
              >
                Reset ({selectedSector.split(" ")[0]})
              </button>
            )}
          </div>
        </div>

        {/* Stacked Horizontal Allocation Bar (Dynamically proportioned by selected metric) */}
        <div className="h-4 w-full rounded-full overflow-hidden flex bg-black/40 border border-white/10 mb-4">
          {sortedSectors.map((s, idx) => {
            const val =
              metric === "dividends"
                ? s.netDividends
                : metric === "cost"
                ? s.costBasis
                : s.marketValue;
            const pct =
              totalCurrentMetric > 0 ? (val / totalCurrentMetric) * 100 : 0;
            return (
              <div
                key={s.sector}
                style={{
                  width: `${Math.max(1.5, pct)}%`,
                  backgroundColor: SECTOR_COLORS[idx % SECTOR_COLORS.length],
                }}
                title={`${s.sector}: Rs. ${val.toLocaleString("en-PK", {
                  maximumFractionDigits: 0,
                })} (${pct.toFixed(1)}%)`}
                onClick={() =>
                  onSelectSector(selectedSector === s.sector ? "ALL" : s.sector)
                }
                className="h-full transition-all duration-300 cursor-pointer hover:opacity-80"
              />
            );
          })}
        </div>

        {/* Interactive Legend & Metrics List */}
        <div className="space-y-2 overflow-y-auto pr-1 flex-1 min-h-[190px] max-h-[225px]">
          {sortedSectors.map((s, idx) => {
            const color = SECTOR_COLORS[idx % SECTOR_COLORS.length];
            const isSelected = selectedSector === s.sector;
            const val =
              metric === "dividends"
                ? s.netDividends
                : metric === "cost"
                ? s.costBasis
                : s.marketValue;
            const pct =
              totalCurrentMetric > 0 ? (val / totalCurrentMetric) * 100 : 0;

            return (
              <button
                key={s.sector}
                onClick={() =>
                  onSelectSector(isSelected ? "ALL" : s.sector)
                }
                className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center justify-between gap-3 cursor-pointer ${
                  isSelected
                    ? "bg-indigo-500/15 border-indigo-400/50"
                    : "bg-white/[0.02] border-white/5 hover:bg-white/[0.05]"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="w-3 h-3 rounded-sm shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <div className="truncate">
                    <div className="text-xs font-semibold truncate">
                      {s.sector}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {s.count} stock{s.count > 1 ? "s" : ""} •{" "}
                      {metric === "dividends"
                        ? `Cost: Rs. ${s.costBasis.toLocaleString("en-PK", {
                            maximumFractionDigits: 0,
                          })}`
                        : `Divs: Rs. ${s.netDividends.toLocaleString("en-PK", {
                            maximumFractionDigits: 0,
                          })}`}
                    </div>
                  </div>
                </div>
                <div className="text-right font-mono-num shrink-0">
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    Rs.{" "}
                    {val.toLocaleString("en-PK", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    <span className="text-slate-500 dark:text-slate-400 font-normal">
                      ({pct.toFixed(1)}%)
                    </span>
                  </div>
                  <div
                    className={`text-[11px] ${
                      s.unrealizedPnl >= 0
                        ? "text-emerald-600 dark:text-emerald-400 font-medium"
                        : "text-rose-600 dark:text-rose-400 font-medium"
                    }`}
                  >
                    {s.unrealizedPnl >= 0 ? "+" : ""}
                    {s.unrealizedPnl.toLocaleString("en-PK", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    PKR
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom Summary Strip Matching Left Chart */}
      <div className="grid grid-cols-3 gap-2.5 pt-3 mt-3 border-t border-white/10 text-xs">
        <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
          <div className="text-slate-500 dark:text-slate-400 text-[11px]">Active Sectors</div>
          <div className="font-mono-num font-semibold text-sm mt-0.5 text-slate-900 dark:text-white">
            {sectors.length} Sectors
          </div>
        </div>
        <div className="p-2.5 rounded-xl bg-indigo-500/[0.06] border border-indigo-500/20">
          <div className="text-indigo-700 dark:text-indigo-300 text-[11px] truncate">
            Top: {sortedSectors[0]?.sector.split(" ")[0] || "N/A"}
          </div>
          <div className="font-mono-num font-semibold text-indigo-700 dark:text-indigo-400 text-sm mt-0.5 truncate">
            {(totalCurrentMetric > 0 && sortedSectors[0]
              ? ((metric === "dividends"
                  ? sortedSectors[0].netDividends
                  : metric === "cost"
                  ? sortedSectors[0].costBasis
                  : sortedSectors[0].marketValue) /
                  totalCurrentMetric) *
                100
              : 0
            ).toFixed(1)}% Share
          </div>
        </div>
        <div className="p-2.5 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20">
          <div className="text-emerald-700 dark:text-emerald-300 text-[11px] truncate">
            {metric === "dividends"
              ? "Total Net Divs"
              : metric === "cost"
              ? "Total Invested"
              : "Total Mkt Value"}
          </div>
          <div className="font-mono-num font-semibold text-emerald-700 dark:text-emerald-400 text-sm mt-0.5 truncate">
            Rs. {totalCurrentMetric.toLocaleString("en-PK", { maximumFractionDigits: 0 })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function StockLeaderboardChart({
  positions,
  onSelectTicker,
}: {
  positions: PositionSummary[];
  onSelectTicker: (ticker: string) => void;
}) {
  const sorted = [...positions].sort((a, b) => b.totalReturn - a.totalReturn);
  const maxAbs = Math.max(
    ...sorted.map(
      (p) => Math.abs(p.unrealizedPnl) + Math.abs(p.netDividendsPaid)
    ),
    1
  );

  return (
    <div className="rune-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <span className="text-[11px] uppercase tracking-widest text-amber-400 font-semibold">
            Total Return Attribution
          </span>
          <h3 className="text-base font-semibold mt-0.5">
            Stock Profit/Loss &amp; Net Dividend Leaderboard (Click Any Stock)
          </h3>
        </div>
        {/* Visual Legend */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
            Unrealized Capital Gain
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" />
            Unrealized Capital Loss
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" />
            Net Cash Dividends Received
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[340px] overflow-y-auto pr-1">
        {sorted.map((p) => {
          const capWidth = Math.min(
            75,
            (Math.abs(p.unrealizedPnl) / maxAbs) * 75
          );
          const divWidth = Math.min(
            75 - capWidth,
            (p.netDividendsPaid / maxAbs) * 75
          );
          return (
            <button
              key={p.ticker}
              onClick={() => onSelectTicker(p.ticker)}
              className="p-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 transition-all text-left cursor-pointer"
            >
              <div className="flex items-center justify-between text-xs mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono-num font-bold text-indigo-300">
                    {p.ticker}
                  </span>
                  <span className="text-slate-400 truncate max-w-[140px]">
                    {p.name}
                  </span>
                </div>
                <div className="font-mono-num text-xs">
                  <span
                    className={
                      p.totalReturn >= 0
                        ? "text-emerald-400 font-semibold"
                        : "text-rose-400 font-semibold"
                    }
                  >
                    {p.totalReturn >= 0 ? "+" : ""}
                    {Math.round(p.totalReturn).toLocaleString()} PKR
                  </span>{" "}
                  <span className="text-slate-500">
                    ({p.totalReturnPct >= 0 ? "+" : ""}
                    {p.totalReturnPct.toFixed(1)}%)
                  </span>
                </div>
              </div>
              <div className="w-full h-2.5 rounded-full bg-black/40 overflow-hidden flex items-center">
                <div
                  style={{ width: `${Math.max(2, capWidth)}%` }}
                  className={`h-full ${
                    p.unrealizedPnl >= 0 ? "bg-emerald-500" : "bg-rose-500"
                  }`}
                />
                {p.netDividendsPaid > 0 && (
                  <div
                    style={{ width: `${Math.max(2, divWidth)}%` }}
                    className="h-full bg-amber-400"
                  />
                )}
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1 font-mono-num">
                <span>
                  Cap P&amp;L: {p.unrealizedPnl >= 0 ? "+" : ""}
                  {Math.round(p.unrealizedPnl).toLocaleString()}
                </span>
                <span>
                  Net Div: +Rs. {Math.round(p.netDividendsPaid).toLocaleString()}
                </span>
                <span>Live: Rs. {p.livePrice.toFixed(2)}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
