export interface Company {
  ticker: string;
  name: string;
  frequency: string;
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
}

export type CompanyRecord = Company;

export interface Transaction {
  id: number;
  date: string;
  ticker: string;
  company: string;
  action: "Buy" | "Sell";
  shares: number;
  price: number;
  brkFees: number;
  sst: number;
  notes: string;
}

export type TransactionRecord = Transaction;

export interface Dividend {
  id: number;
  paymentDate: string;
  ticker: string;
  year: string;
  term: string;
  sharesEligible: number;
  status: "Paid" | "Unpaid";
  announcementDate?: string;
  expectedPaymentDate?: string;
  dps: number;
  wht: number;
  zakat: number;
  reinvest: "Yes" | "No";
  reinvestPrice: number;
  announcementId?: string;
}

export type DividendRecord = Dividend;

export interface PsxAnnouncement {
  id: string;
  ticker: string;
  announcementDate: string;
  title: string;
  pdfUrl: string;
  isDividend: boolean;
  parsedDps: number | null;
  parsedTerm: string;
  parsedYear: string;
  notified: boolean;
  addedToDividends: boolean;
  createdAt?: string;
}

export interface PortfolioSettings {
  defaultBrokerageRate?: number;
  minBrokeragePerShare?: number;
  defaultMinBrkPerShare?: number;
  sstRate?: number;
  defaultSstRate?: number;
  defaultFilerWhtRate?: number;
  includeLegacyMcbInCashflow: boolean;
}

export interface PortfolioState {
  version?: string;
  lastUpdated: string;
  currency?: string;
  settings: PortfolioSettings;
  companies: Company[];
  transactions: Transaction[];
  dividends: Dividend[];
  announcements?: PsxAnnouncement[];
}

export interface PositionSummary {
  ticker: string;
  name: string;
  sector: string;
  frequency: string;
  shares: number;
  totalSharesBought: number;
  totalSharesSold: number;
  wac: number;
  costBasis: number;
  livePrice: number;
  ldcp: number;
  dayChange: number;
  dayChangePct: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  realizedPnl: number;
  grossDividends: number;
  whtTotal: number;
  zakatTotal: number;
  netDividendsPaid: number;
  netDividendsUnpaid: number;
  totalReturn: number;
  totalReturnPct: number;
  yieldOnCostPct: number;
  currentYieldPct: number;
  weightPct: number;
  high52: string;
  dayRange: string;
  volume: string;
  pe: string;
  asOf: string;
  lots: {
    id: number;
    date: string;
    action: "Buy" | "Sell";
    shares: number;
    price: number;
    fees: number;
    totalAmount: number;
    runningShares: number;
    runningWac: number;
    realizedPnl: number;
  }[];
}
