import { config } from '../config.js';

function uniqueSymbols(values = []) {
  return [...new Set(values.map((value) => String(value || '').trim().toUpperCase()).filter(Boolean))];
}

export function universeCatalog(watchlist = config.watchlist) {
  return {
    priority: uniqueSymbols(watchlist.priority),
    indexProxies: uniqueSymbols(watchlist.indexProxies),
    contextIndices: uniqueSymbols(watchlist.contextIndices),
    magnificentSeven: uniqueSymbols(watchlist.magnificentSeven),
    optionsLeaders: uniqueSymbols(watchlist.optionsLeaders),
    sectorAndMacroEtfs: uniqueSymbols(watchlist.sectorAndMacroEtfs),
    wheelSymbols: uniqueSymbols(watchlist.wheelSymbols),
    allSignalSymbols: uniqueSymbols(watchlist.core)
  };
}

export function selectRotatingUniverse({
  watchlist = config.watchlist,
  maxSymbols = watchlist.maxSymbolsPerScan,
  intervalMinutes = config.scanner.intervalMinutes,
  now = new Date()
} = {}) {
  const catalog = universeCatalog(watchlist);
  const limit = Math.max(1, Number(maxSymbols) || 12);
  const pinned = uniqueSymbols([...catalog.priority, ...catalog.indexProxies, ...catalog.wheelSymbols]).slice(0, limit);
  const rotation = catalog.allSignalSymbols.filter((symbol) => !pinned.includes(symbol));
  const slots = Math.max(0, limit - pinned.length);
  if (!slots || !rotation.length) return pinned;
  if (watchlist.rotationEnabled === false) return [...pinned, ...rotation.slice(0, slots)];
  const intervalMs = Math.max(1, Number(intervalMinutes) || 5) * 60000;
  const offset = Math.floor(new Date(now).getTime() / intervalMs) % rotation.length;
  const rotated = [...rotation.slice(offset), ...rotation.slice(0, offset)];
  return [...pinned, ...rotated.slice(0, slots)];
}
