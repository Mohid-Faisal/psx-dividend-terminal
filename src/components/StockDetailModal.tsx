"use client";

import React, { useState } from "react";
import { Dividend, PositionSummary, PsxAnnouncement } from "@/types/portfolio";
import { ExternalLink, X, TrendingUp, Award, Layers, Bell } from "lucide-react";

interface Props {
  position: PositionSummary | null;
  dividends: Dividend[];
  announcements: PsxAnnouncement[];
  onClose: () => void;
}

export default function StockDetailModal({
  position,
  dividends,
  announcements,
  onClose,
}: Props) {
  const [viewMode, setViewMode] = useState<"wac" | "psx">("wac");

  if (!position) return null;

  const stockDivs = dividends.filter((d) => d.ticker === position.ticker);
  const stockAnns = announcements.filter((a) => a.ticker === position.ticker);

  const allPrices = [
    ...position.lots.map((l) => l.price),
    ...position.lots.map((l) => l.runningWac),
    position.livePrice,
  ].filter((v) => v > 0);

  const minP = allPrices.length > 0 ? Math.min(...allPrices) * 0.94 : 0;
  const maxP = allPrices.length > 0 ? Math.max(...allPrices) * 1.06 : 100;
  const span = Math.max(maxP - minP, 1);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="rune-card w-full max-w-4xl p-6 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-white/10">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="px-2.5 py-1 rounded-lg bg-indigo-500/20 border border-indigo-500/40 font-mono-num font-bold text-indigo-300 text-base">
                {position.ticker}
              </span>
              <h2 className="text-xl font-bold">{position.name}</h2>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-300">
                {position.sector}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1.5">
              Live PSX Feed ({position.asOf || "Latest Market Close"}) •
              Dividend Cadence: <strong>{position.frequency}</strong> • 52W
              Range:{" "}
              <span className="font-mono-num text-slate-200">
                {position.high52}
              </span>{" "}
              • Day Range:{" "}
              <span className="font-mono-num text-slate-200">
                {position.dayRange}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={`https://dps.psx.com.pk/company/${position.ticker}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-medium text-slate-200"
            >
              PSX Portal <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-white/5 hover:bg-rose-500/20 border border-white/10 text-slate-300 hover:text-rose-300 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 my-4">
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10">
            <div className="text-[11px] text-slate-400">
              Live Price (Read-Only)
            </div>
            <div className="font-mono-num text-lg font-bold mt-0.5">
              Rs. {position.livePrice.toFixed(2)}
            </div>
            <div
              className={`text-[11px] font-mono-num ${
                position.dayChange >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {position.dayChange >= 0 ? "+" : ""}
              {position.dayChange.toFixed(2)} ({position.dayChangePct.toFixed(2)}
              %)
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10">
            <div className="text-[11px] text-slate-400">
              Active Shares &amp; WAC
            </div>
            <div className="font-mono-num text-lg font-bold mt-0.5">
              {position.shares.toLocaleString()} sh
            </div>
            <div className="text-[11px] font-mono-num text-indigo-300">
              WAC: Rs. {position.wac.toFixed(2)}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10">
            <div className="text-[11px] text-slate-400">
              Market Value vs Cost
            </div>
            <div className="font-mono-num text-lg font-bold mt-0.5">
              Rs. {Math.round(position.marketValue).toLocaleString()}
            </div>
            <div className="text-[11px] font-mono-num text-slate-400">
              Cost: Rs. {Math.round(position.costBasis).toLocaleString()}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10">
            <div className="text-[11px] text-slate-400">Unrealized P&amp;L</div>
            <div
              className={`font-mono-num text-lg font-bold mt-0.5 ${
                position.unrealizedPnl >= 0
                  ? "text-emerald-400"
                  : "text-rose-400"
              }`}
            >
              {position.unrealizedPnl >= 0 ? "+" : ""}Rs.{" "}
              {Math.round(position.unrealizedPnl).toLocaleString()}
            </div>
            <div
              className={`text-[11px] font-mono-num ${
                position.unrealizedPnlPct >= 0
                  ? "text-emerald-400"
                  : "text-rose-400"
              }`}
            >
              {position.unrealizedPnlPct >= 0 ? "+" : ""}
              {position.unrealizedPnlPct.toFixed(2)}%
            </div>
          </div>

          <div className="p-3 rounded-xl bg-amber-500/[0.07] border border-amber-500/25">
            <div className="text-[11px] text-amber-300/90">
              Net Dividends Paid
            </div>
            <div className="font-mono-num text-lg font-bold text-amber-300 mt-0.5">
              Rs. {Math.round(position.netDividendsPaid).toLocaleString()}
            </div>
            <div className="text-[11px] font-mono-num text-amber-200/80">
              YoC: {position.yieldOnCostPct.toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Toggle between WAC Execution Chart and Live PSX Portal Embed */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode("wac")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer ${
                viewMode === "wac"
                  ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-200"
                  : "bg-white/5 border-white/10 text-slate-400"
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5 inline mr-1.5" />
              Position Price, Running WAC &amp; Lot Chart
            </button>
            <button
              onClick={() => setViewMode("psx")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer ${
                viewMode === "psx"
                  ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-200"
                  : "bg-white/5 border-white/10 text-slate-400"
              }`}
            >
              <Layers className="w-3.5 h-3.5 inline mr-1.5" />
              Official PSX Portal View ({position.ticker})
            </button>
          </div>

          {viewMode === "wac" && (
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 inline-block" />
                Lot Execution Price
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
                Running WAC Basis
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-4 h-0.5 border-t-2 border-dashed border-emerald-400 inline-block" />
                Live PSX Price (Rs. {position.livePrice.toFixed(2)})
              </span>
            </div>
          )}
        </div>

        {viewMode === "wac" ? (
          <div className="p-4 rounded-xl bg-black/35 border border-white/10 mb-5">
            <svg viewBox="0 0 700 200" className="w-full h-[195px]">
              {[0, 0.5, 1].map((t, i) => {
                const y = 20 + (1 - t) * 145;
                const val = minP + t * span;
                return (
                  <g key={i}>
                    <line
                      x1={52}
                      y1={y}
                      x2={670}
                      y2={y}
                      stroke="rgba(148,163,184,0.14)"
                      strokeDasharray="3 3"
                    />
                    <text
                      x={46}
                      y={y + 4}
                      textAnchor="end"
                      className="fill-slate-400 text-[10px] font-mono-num"
                    >
                      {val.toFixed(1)}
                    </text>
                  </g>
                );
              })}

              {/* Live Price Horizontal Reference Line */}
              {position.livePrice > 0 && (
                <g>
                  <line
                    x1={52}
                    y1={165 - ((position.livePrice - minP) / span) * 145}
                    x2={670}
                    y2={165 - ((position.livePrice - minP) / span) * 145}
                    stroke="#10b981"
                    strokeWidth={1.8}
                    strokeDasharray="5 4"
                  />
                  <text
                    x={666}
                    y={159 - ((position.livePrice - minP) / span) * 145}
                    textAnchor="end"
                    className="fill-emerald-400 text-[10px] font-mono-num font-semibold"
                  >
                    Live Rs. {position.livePrice.toFixed(2)}
                  </text>
                </g>
              )}

              {/* Running WAC Line */}
              {position.lots.length > 0 && (
                <>
                  <polyline
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth={2.2}
                    points={position.lots
                      .map((l, idx) => {
                        const x =
                          position.lots.length === 1
                            ? 360
                            : 70 +
                              (idx / (position.lots.length - 1)) * 580;
                        const y =
                          165 - ((l.runningWac - minP) / span) * 145;
                        return `${x},${y}`;
                      })
                      .join(" ")}
                  />
                  <polyline
                    fill="none"
                    stroke="#6366f1"
                    strokeWidth={2}
                    points={position.lots
                      .map((l, idx) => {
                        const x =
                          position.lots.length === 1
                            ? 360
                            : 70 +
                              (idx / (position.lots.length - 1)) * 580;
                        const y = 165 - ((l.price - minP) / span) * 145;
                        return `${x},${y}`;
                      })
                      .join(" ")}
                  />
                  {position.lots.map((l, idx) => {
                    const x =
                      position.lots.length === 1
                        ? 360
                        : 70 + (idx / (position.lots.length - 1)) * 580;
                    const yPrice = 165 - ((l.price - minP) / span) * 145;
                    const yWac = 165 - ((l.runningWac - minP) / span) * 145;
                    return (
                      <g key={l.id}>
                        <circle
                          cx={x}
                          cy={yWac}
                          r={3.5}
                          fill="#f59e0b"
                        />
                        <circle
                          cx={x}
                          cy={yPrice}
                          r={4.5}
                          fill={l.action === "Buy" ? "#6366f1" : "#f43f5e"}
                          stroke="#0f1117"
                          strokeWidth={1.5}
                        />
                        <text
                          x={x}
                          y={186}
                          textAnchor="middle"
                          className="fill-slate-400 text-[9px] font-mono-num"
                        >
                          {l.date.slice(5)}
                        </text>
                      </g>
                    );
                  })}
                </>
              )}
            </svg>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden border border-white/10 mb-5 bg-black/40">
            <iframe
              src={`https://dps.psx.com.pk/company/${position.ticker}`}
              title={`PSX ${position.ticker}`}
              className="w-full h-[360px]"
            />
          </div>
        )}

        {/* Two Columns: Transaction Lots & Dividends/Announcements */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2.5 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              Executed Trade Lots ({position.lots.length})
            </h4>
            <div className="space-y-2 max-h-[210px] overflow-y-auto pr-1 text-xs">
              {position.lots.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02] border border-white/5 font-mono-num"
                >
                  <div>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold mr-2 ${
                        l.action === "Buy"
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-rose-500/20 text-rose-300"
                      }`}
                    >
                      {l.action.toUpperCase()}
                    </span>
                    <span className="text-slate-300">{l.date}</span>
                  </div>
                  <div className="text-right">
                    <div>
                      {l.shares.toLocaleString()} @ Rs. {l.price.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      WAC after: Rs. {l.runningWac.toFixed(2)} • Total: Rs.{" "}
                      {Math.round(l.totalAmount).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2.5 flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-amber-400" />
              Dividend History ({stockDivs.length}) &amp; PSX Notices (
              {stockAnns.length})
            </h4>
            <div className="space-y-2 max-h-[210px] overflow-y-auto pr-1 text-xs">
              {stockDivs.map((d) => {
                const gross = d.sharesEligible * d.dps;
                const net = Math.max(0, gross - d.wht - d.zakat);
                return (
                  <div
                    key={d.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02] border border-white/5 font-mono-num"
                  >
                    <div>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold mr-2 ${
                          d.status === "Paid"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-amber-500/20 text-amber-300"
                        }`}
                      >
                        {d.status}
                      </span>
                      <span className="text-slate-300">
                        {d.paymentDate || d.announcementDate || "Announced"} (
                        {d.term} {d.year})
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-emerald-400 font-semibold">
                        +Rs. {Math.round(net).toLocaleString()} Net
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {d.sharesEligible} sh × Rs. {d.dps} (WHT: {d.wht})
                      </div>
                    </div>
                  </div>
                );
              })}
              {stockAnns.map((a) => (
                <div
                  key={a.id}
                  className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/25 text-xs"
                >
                  <div className="flex items-center justify-between text-[11px] text-indigo-300 font-semibold">
                    <span>
                      <Bell className="w-3 h-3 inline mr-1" />
                      {a.announcementDate}
                    </span>
                    {a.pdfUrl && (
                      <a
                        href={a.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-white"
                      >
                        Official PDF
                      </a>
                    )}
                  </div>
                  <div className="text-slate-300 mt-1 text-[11px]">
                    {a.title}
                  </div>
                </div>
              ))}
              {stockDivs.length === 0 && stockAnns.length === 0 && (
                <div className="text-slate-500 text-xs py-6 text-center">
                  No dividend records or recent notices for {position.ticker}.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
