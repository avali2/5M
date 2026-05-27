const DOCUMENTATION = {
  tradier: 'https://docs.tradier.com/reference/brokerage-api-markets-get-options-chains',
  polygon: 'https://polygon.io/docs/options',
  finnhub: 'https://finnhub.io/docs/api',
  fmp: 'https://site.financialmodelingprep.com/developer/docs',
  benzinga: 'https://docs.benzinga.com/',
  postgres: 'https://www.postgresql.org/docs/'
};

const ENDPOINTS = {
  tradier: 'quotes / history / options expirations / options chains?greeks=true',
  polygon: 'snapshots / aggregates / options snapshots',
  finnhub: 'calendar / news / company-news / insider-transactions',
  fmp: 'economic-calendar / earnings-calendar',
  benzinga: 'licensed unusual activity / block trades',
  postgres: 'iv_history / options_snapshots / trade_journal'
};

export function buildDataHealth({ providerStates = [], market = null, macro = null, results = [] } = {}) {
  const now = new Date().toISOString();
  const validSymbols = (market?.quotes || []).filter((quote) => Number.isFinite(quote.price)).map((quote) => quote.symbol);
  const endpointErrors = [
    ...(market?.errors || []),
    ...results.filter((result) => result.error).map((result) => `${result.symbol}: ${result.error}`)
  ];
  return {
    timestamp: now,
    providers: providerStates.filter((provider) => provider.id !== 'openai').map((provider) => ({
      source: provider.name,
      id: provider.id,
      endpoint: ENDPOINTS[provider.id] || provider.coverage.join(' / '),
      timestamp: now,
      configured: provider.configured,
      isLive: null,
      isDelayed: null,
      missingConfig: !provider.configured,
      data: provider.configured ? 'Consulta server-side habilitada.' : null,
      error: null,
      urlToReadMore: DOCUMENTATION[provider.id] || null,
      note: provider.configured
        ? 'Conectado; estado live/delayed depende del plan contratado con el proveedor.'
        : 'No disponible: agrega la variable de entorno del proveedor en el servidor.'
    })),
    validSymbols,
    endpointErrors,
    metrics: [
      { name: 'Quotes / precio', available: validSymbols.length > 0, source: market?.quotes?.[0]?.source || 'No disponible' },
      { name: 'Option chain / Greeks / IV / OI', available: results.some((result) => result.collectedChains?.length), source: providerStates.find((provider) => ['tradier', 'polygon'].includes(provider.id) && provider.configured)?.name || 'No disponible' },
      { name: 'VIX', available: Number.isFinite(market?.vix), source: market?.quotes?.find((quote) => quote.symbol === 'VIX')?.source || 'No disponible' },
      { name: 'Earnings', available: Array.isArray(macro?.earnings), source: macro?.earnings?.[0]?.source || 'Proveedor calendario configurado' },
      { name: 'Noticias con link', available: Boolean(macro?.news?.length || macro?.companyNews?.length), source: providerStates.find((provider) => provider.id === 'finnhub' && provider.configured)?.name || 'No disponible' },
      { name: 'VIX9D', available: false, source: 'No disponible - requiere proveedor compatible' },
      { name: 'Put/Call ratio', available: false, source: 'No disponible - requiere feed agregado' },
      { name: 'Skew / term structure', available: false, source: 'No disponible - pendiente de serie historica de superficies' },
      { name: 'Dealer positioning confirmado', available: false, source: 'No disponible - GEX actual es proxy OI/Greeks' }
    ]
  };
}
