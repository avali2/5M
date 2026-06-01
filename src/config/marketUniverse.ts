export const CORE_UNIVERSE = [
  "SPY", "QQQ", "IWM", "DIA",
  "AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "TSLA",
  "AMD", "AVGO", "NFLX", "COST", "MCD", "JPM", "BAC", "XOM", "CVX", "LLY", "UNH", "SOFI",
  "SMH", "XLK", "XLF", "XLE", "TLT"
] as const;

export const INDEX_CONTEXT = [
  "SPX", "XSP", "NDX", "RUT", "VIX", "VIX9D", "VXN", "RVX", "VXST"
] as const;

export const WATCHLIST_UNIVERSE = [
  "MMM","ABT","ABBV","ACN","ADBE","AMD","ALL","GOOGL","GOOG","MO",
  "AMZN","AXP","AIG","AMGN","AAPL","T","BAC","BK","BRK.B","BIIB",
  "BLK","BA","BKNG","BMY","AVGO","COF","CAT","SCHW","CHTR","CVX",
  "CSCO","C","KO","CL","CMCSA","COP","COST","CVS","DHR","DOW",
  "DD","DUK","LLY","EMR","EXC","XOM","FDX","F","GE","GD",
  "GM","GILD","GS","HD","HON","IBM","INTC","JNJ","JPM","KMI",
  "KHC","LOW","MA","MCD","MDT","MRK","META","MET","MSFT","MDLZ",
  "MS","NFLX","NEE","NKE","NVDA","OXY","ORCL","PYPL","PEP","PFE",
  "PM","PG","QCOM","RTX","CRM","SLB","SO","SBUX","TMUS","TGT",
  "TSLA","TXN","TMO","UNP","UPS","UNH","USB","VZ","V","WMT",
  "WBA","DIS","WFC"
] as const;

export const SECTOR_ETFS = [
  "XLK","XLF","XLE","XLV","XLY","XLP","XLI","XLC","XLU","XLB","XLRE",
  "SMH","TLT","GLD","SLV","USO"
] as const;

export type MarketUniverseMode = "CORE" | "WATCHLIST" | "SECTOR" | "INDEX_CONTEXT" | "ALL";

export function getUniverse(mode: MarketUniverseMode = "CORE"): string[] {
  if (mode === "CORE") return [...CORE_UNIVERSE];
  if (mode === "WATCHLIST") return [...WATCHLIST_UNIVERSE];
  if (mode === "SECTOR") return [...SECTOR_ETFS];
  if (mode === "INDEX_CONTEXT") return [...INDEX_CONTEXT];
  return Array.from(new Set([...CORE_UNIVERSE, ...WATCHLIST_UNIVERSE, ...SECTOR_ETFS, ...INDEX_CONTEXT]));
}