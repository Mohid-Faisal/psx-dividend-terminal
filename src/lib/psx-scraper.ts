import { PsxAnnouncement } from "@/types/portfolio";

export interface ScrapedCompanyData {
  ticker: string;
  name?: string;
  price: number;
  ldcp: number;
  change: number;
  changePct: number;
  sector: string;
  pe: string;
  high52: string;
  dayRange: string;
  volume: string;
  asOf: string;
  announcements: PsxAnnouncement[];
}

function cleanRangeText(raw: string): string {
  if (!raw) return "N/A";
  const nums = raw.match(/\d+(?:\.\d+)?/g);
  if (nums && nums.length >= 2) {
    return `${nums[0]} — ${nums[1]}`;
  }
  return raw.replace(/\s+/g, " ").trim() || "N/A";
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function isRecentAnnouncementDate(dateStr: string, maxDaysOld = 30): boolean {
  const parsed = Date.parse(dateStr);
  if (isNaN(parsed)) return false;
  const diffDays = (Date.now() - parsed) / (1000 * 3600 * 24);
  return diffDays >= -5 && diffDays <= maxDaysOld;
}

export function parseDividendFromAnnouncement(
  ticker: string,
  dateStr: string,
  title: string,
  pdfUrl: string
): PsxAnnouncement {
  const lower = title.toLowerCase();

  // Exclude administrative/newspaper/unclaimed/IBAN noise notices
  const isNoise =
    lower.includes("clipping") ||
    lower.includes("newspaper") ||
    lower.includes("prior to publication") ||
    lower.includes("non-availability") ||
    lower.includes("withholding of cash dividend") ||
    lower.includes("unclaimed") ||
    lower.includes("mandatory requirement") ||
    lower.includes("electronic mode") ||
    !isRecentAnnouncementDate(dateStr, 30);

  const hasDividendKeyword =
    lower.includes("interim cash dividend") ||
    lower.includes("final cash dividend") ||
    lower.includes("declaration of interim dividend") ||
    lower.includes("cash distribution") ||
    (lower.includes("notice of") && lower.includes("dividend"));

  let parsedDps: number | null = null;
  const rsMatch = title.match(/Rs\.?\s*(\d+(?:\.\d+)?)/i);
  if (rsMatch) {
    parsedDps = parseFloat(rsMatch[1]);
  }

  // Only mark as actionable dividend if it is NOT noise, has a real dividend keyword, AND has a parsed DPS > 0
  const isDividend =
    !isNoise && hasDividendKeyword && parsedDps !== null && parsedDps > 0;

  let parsedTerm = "Q1";
  if (
    lower.includes("final") ||
    lower.includes("annual") ||
    lower.includes("year ended")
  ) {
    parsedTerm = "YR";
  } else if (
    lower.includes("half year") ||
    lower.includes("second quarter") ||
    lower.includes("2nd quarter") ||
    lower.includes("2nd interim") ||
    lower.includes("second interim")
  ) {
    parsedTerm = "HYR";
  } else if (
    lower.includes("third quarter") ||
    lower.includes("3rd quarter") ||
    lower.includes("3rd interim") ||
    lower.includes("third interim") ||
    lower.includes("nine months")
  ) {
    parsedTerm = "3Q";
  } else if (
    lower.includes("first quarter") ||
    lower.includes("1st quarter") ||
    lower.includes("1st interim") ||
    lower.includes("first interim")
  ) {
    parsedTerm = "1Q";
  }

  const yrMatch = title.match(/202[5-9]/);
  const parsedYear = yrMatch ? yrMatch[0] : new Date().getFullYear().toString();

  const docMatch = pdfUrl.match(/(\d+)\.pdf/);
  const slug = docMatch
    ? docMatch[1]
    : `${dateStr}-${title.slice(0, 40)}`.replace(/[^a-zA-Z0-9_-]/g, "_");
  const id = `${ticker}-${slug}`;

  return {
    id,
    ticker,
    announcementDate: dateStr,
    title,
    pdfUrl: pdfUrl.startsWith("http")
      ? pdfUrl
      : pdfUrl
      ? `https://dps.psx.com.pk${pdfUrl}`
      : "",
    isDividend,
    parsedDps,
    parsedTerm,
    parsedYear,
    notified: false,
    addedToDividends: false,
  };
}

export async function scrapePsxCompany(
  ticker: string
): Promise<ScrapedCompanyData | null> {
  const sym = ticker.trim().toUpperCase();
  const url = `https://dps.psx.com.pk/company/${encodeURIComponent(sym)}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(4500),
      cache: "no-store",
    });

    if (!res.ok) return null;
    const html = await res.text();

    // Close price
    const closeMatch = html.match(
      /class="quote__close"[^>]*>\s*Rs\.?\s*([\d,]+(?:\.\d+)?)/i
    );
    if (!closeMatch) return null;
    const price = parseFloat(closeMatch[1].replace(/,/g, ""));

    // Company name
    const nameMatch = html.match(/class="quote__name"[^>]*>([\s\S]*?)<\/div>/i);
    const rawName = nameMatch
      ? stripTags(nameMatch[1]).replace(/\([A-Z0-9]+\).*$/, "").trim()
      : undefined;

    // Sector
    const sectorMatch = html.match(
      /class="quote__sector"[^>]*>([\s\S]*?)<\/div>/i
    );
    const sector = sectorMatch ? stripTags(sectorMatch[1]) : "OTHER";

    // As of timestamp
    const dateMatch = html.match(/class="quote__date"[^>]*>([\s\S]*?)<\/div>/i);
    const asOf = dateMatch
      ? stripTags(dateMatch[1]).replace(/^\^\s*/, "")
      : `Synced ${new Date().toLocaleTimeString()}`;

    // Parse stats_item blocks
    const statsRegex =
      /<div class="stats_item">\s*<div class="stats_label">([\s\S]*?)<\/div>\s*<div class="stats_value"[^>]*>([\s\S]*?)<\/div>/gi;
    const statsMap: Record<string, string> = {};
    let m: RegExpExecArray | null;
    while ((m = statsRegex.exec(html)) !== null) {
      const label = stripTags(m[1]).toUpperCase();
      const val = stripTags(m[2]);
      statsMap[label] = val;
    }

    const ldcpRaw = statsMap["LDCP"] || "";
    const ldcp = parseFloat(ldcpRaw.replace(/,/g, "")) || price;
    const change = Number((price - ldcp).toFixed(2));
    const changePct = ldcp > 0 ? Number(((change / ldcp) * 100).toFixed(2)) : 0;

    const high52Key = Object.keys(statsMap).find((k) => k.includes("52-WEEK"));
    const dayRangeKey = Object.keys(statsMap).find((k) =>
      k.includes("DAY RANGE")
    );
    const peKey = Object.keys(statsMap).find((k) => k.includes("P/E"));
    const volKey = Object.keys(statsMap).find((k) => k.includes("VOLUME"));

    const high52 = high52Key ? cleanRangeText(statsMap[high52Key]) : "N/A";
    const dayRange = dayRangeKey
      ? cleanRangeText(statsMap[dayRangeKey])
      : "N/A";
    const pe = peKey ? statsMap[peKey] : "N/A";
    const volume = volKey ? statsMap[volKey] : "0";

    // Parse announcements section (only keep actionable dividend announcements)
    const announcements: PsxAnnouncement[] = [];
    const annIdx = html.indexOf('id="announcements"');
    if (annIdx !== -1) {
      const slice = html.slice(annIdx, annIdx + 25000);
      const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let rm: RegExpExecArray | null;
      while ((rm = rowRegex.exec(slice)) !== null) {
        const rowHtml = rm[1];
        const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        const cells: string[] = [];
        let tm: RegExpExecArray | null;
        while ((tm = tdRegex.exec(rowHtml)) !== null) {
          cells.push(tm[1]);
        }
        if (cells.length >= 2) {
          const dateText = stripTags(cells[0]);
          const titleText = stripTags(cells[1]);
          const pdfMatch = rowHtml.match(
            /href="(\/download\/document\/[^"]+\.pdf)"/i
          );
          const pdfUrl = pdfMatch ? pdfMatch[1] : "";
          if (
            dateText &&
            titleText &&
            !dateText.toLowerCase().includes("date")
          ) {
            const parsed = parseDividendFromAnnouncement(
              sym,
              dateText,
              titleText,
              pdfUrl
            );
            if (parsed.isDividend) {
              announcements.push(parsed);
            }
          }
        }
      }
    }

    return {
      ticker: sym,
      name: rawName,
      price,
      ldcp,
      change,
      changePct,
      sector,
      pe,
      high52,
      dayRange,
      volume,
      asOf,
      announcements: announcements.slice(0, 5),
    };
  } catch {
    return null;
  }
}
