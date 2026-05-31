import type { ClassifiedNewsEvent } from "../types/guardian";

const CRITICAL_KEYWORDS = [
  "fomc",
  "fed",
  "powell",
  "cpi",
  "pce",
  "nonfarm",
  "nfp",
  "jobs report",
  "inflation",
  "rate decision",
  "rate hike",
  "rate cut",
  "treasury yield",
  "war",
  "missile",
  "attack",
  "invasion",
  "oil spike",
  "bank failure",
  "liquidity crisis"
];

const HIGH_KEYWORDS = [
  "earnings",
  "guidance",
  "revenue miss",
  "eps miss",
  "downgrade",
  "upgrade",
  "antitrust",
  "sec investigation",
  "ftc",
  "doj",
  "china restrictions",
  "export ban",
  "ai chips",
  "semiconductor"
];

const MEDIUM_KEYWORDS = [
  "analyst",
  "price target",
  "partnership",
  "product launch",
  "buyback",
  "dividend",
  "insider",
  "layoffs"
];

export function classifyNewsEvent(input: {
  id?: string;
  symbol?: string;
  title: string;
  source?: string;
  url?: string;
  publishedAt?: string;
  eventDate?: string;
  isEarnings?: boolean;
  isMacro?: boolean;
  isToday?: boolean;
  isTomorrow?: boolean;
}): ClassifiedNewsEvent {
  const titleLower = input.title.toLowerCase();

  let category: ClassifiedNewsEvent["category"] = "OTHER";
  let stars: ClassifiedNewsEvent["stars"] = 1;
  let action: ClassifiedNewsEvent["action"] = "IGNORE";
  let whyItMatters = "Impacto bajo para nuevas operaciones.";

  if (input.isEarnings || titleLower.includes("earnings")) {
    category = "EARNINGS";
    stars = input.isToday ? 5 : input.isTomorrow ? 4 : 3;
    action = input.isToday ? "BLOCK_SYMBOL" : "REDUCE_SIZE";
    whyItMatters = input.isToday
      ? "Earnings hoy: riesgo de gap, IV crush y slippage. Bloquear nuevas ventas de prima en ese simbolo."
      : "Earnings cercano: reducir tamano y evitar vender prima sin edge especial.";
  } else if (CRITICAL_KEYWORDS.some(k => titleLower.includes(k))) {
    category = detectCriticalCategory(titleLower);
    stars = 5;
    action = "BLOCK_NEW_TRADES";
    whyItMatters = "Evento macro/geopolitico de alto impacto. Puede cambiar correlaciones, IV y direccion del mercado.";
  } else if (HIGH_KEYWORDS.some(k => titleLower.includes(k))) {
    category = detectHighCategory(titleLower);
    stars = 4;
    action = "WATCH";
    whyItMatters = "Noticia relevante. Requiere confirmacion antes de abrir senales nuevas.";
  } else if (MEDIUM_KEYWORDS.some(k => titleLower.includes(k))) {
    category = "COMPANY_NEWS";
    stars = 2;
    action = "WATCH";
    whyItMatters = "Noticia moderada. Puede afectar momentum intradia.";
  }

  const color: ClassifiedNewsEvent["color"] = stars >= 5 ? "RED" : stars === 4 ? "ORANGE" : stars === 3 ? "YELLOW" : "GREEN";

  return {
    id: input.id ?? `${input.symbol ?? "MKT"}-${Date.now()}`,
    symbol: input.symbol,
    title: input.title,
    source: input.source,
    url: input.url,
    publishedAt: input.publishedAt,
    eventDate: input.eventDate,
    category,
    stars,
    color,
    action,
    whyItMatters
  };
}

function detectCriticalCategory(text: string): ClassifiedNewsEvent["category"] {
  if (text.includes("fed") || text.includes("fomc") || text.includes("powell")) return "FED";
  if (text.includes("cpi")) return "CPI";
  if (text.includes("pce")) return "PCE";
  if (text.includes("nfp") || text.includes("nonfarm") || text.includes("jobs")) return "NFP";
  if (text.includes("war") || text.includes("missile") || text.includes("attack")) return "WAR";
  if (text.includes("oil")) return "OIL";
  if (text.includes("bank")) return "BANKING";
  if (text.includes("yield") || text.includes("treasury")) return "RATES";
  return "GEOPOLITICAL";
}

function detectHighCategory(text: string): ClassifiedNewsEvent["category"] {
  if (text.includes("antitrust") || text.includes("doj") || text.includes("ftc")) return "ANTITRUST";
  if (text.includes("chip") || text.includes("semiconductor") || text.includes("ai")) return "AI_SEMICONDUCTORS";
  return "COMPANY_NEWS";
}

export function getNewsStars(stars: number) {
  return "⭐".repeat(Math.max(1, Math.min(5, stars)));
}

export function shouldBlockSignalForNews(events: ClassifiedNewsEvent[], symbol: string) {
  const marketBlock = events.some(e => e.action === "BLOCK_MARKET" || e.action === "BLOCK_NEW_TRADES");
  const symbolBlock = events.some(e => e.symbol === symbol && e.action === "BLOCK_SYMBOL");

  if (marketBlock) return { blocked: true, reason: "Evento macro/geopolitico critico activo." };
  if (symbolBlock) return { blocked: true, reason: `Evento critico activo en ${symbol}.` };

  return { blocked: false, reason: null };
}