import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  Legend
} from 'recharts';
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  BrainCircuit,
  PieChart as PieChartIcon,
  Activity,
  BarChart3,
  Bot,
  PlusCircle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  RefreshCw,
  Zap,
  Sliders,
  DollarSign
} from 'lucide-react';
import {
  calculateBreakEven,
  calculateMaxProfit,
  calculateMaxRisk,
  calculateNetGreeks,
  calculatePayoff,
  estimateEdge,
  estimateProbability,
  validateStrategy
} from '../options-simulator/calculations.js';
import { legsFromSignal, templateLegs } from '../options-simulator/templates.js';

const STORAGE_KEY = 'valido-paper-trades-v2';

const money = (value) =>
  Number.isFinite(value)
    ? value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
    : '$0.00';

const percent = (val) => (Number.isFinite(val) ? `${(val * 100).toFixed(1)}%` : '0.0%');

const SEED_TRADES = [
  {
    id: 101,
    timestamp: new Date(Date.now() - 14 * 86400000).toISOString(),
    sourceMode: 'snapshot',
    symbol: 'SPY',
    spot: 590,
    strategy: 'Bull Put Credit Spread',
    dte: 7,
    status: 'Cerrado',
    maxRisk: 380,
    maxProfit: 120,
    pnl: 110,
    exitPrice: 596,
    closedAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    pop: 78,
    legs: [
      { side: 'SELL', optionType: 'PUT', strike: 585, price: 1.80 },
      { side: 'BUY', optionType: 'PUT', strike: 580, price: 0.60 }
    ]
  },
  {
    id: 102,
    timestamp: new Date(Date.now() - 12 * 86400000).toISOString(),
    sourceMode: 'snapshot',
    symbol: 'QQQ',
    spot: 510,
    strategy: 'Iron Condor',
    dte: 14,
    status: 'Cerrado',
    maxRisk: 350,
    maxProfit: 150,
    pnl: 140,
    exitPrice: 512,
    closedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    pop: 72,
    legs: [
      { side: 'SELL', optionType: 'PUT', strike: 500, price: 1.50 },
      { side: 'BUY', optionType: 'PUT', strike: 495, price: 0.50 },
      { side: 'SELL', optionType: 'CALL', strike: 525, price: 1.40 },
      { side: 'BUY', optionType: 'CALL', strike: 530, price: 0.40 }
    ]
  },
  {
    id: 103,
    timestamp: new Date(Date.now() - 10 * 86400000).toISOString(),
    sourceMode: 'snapshot',
    symbol: 'NVDA',
    spot: 125,
    strategy: 'Bull Call Debit Spread',
    dte: 7,
    status: 'Cerrado',
    maxRisk: 200,
    maxProfit: 300,
    pnl: -180,
    exitPrice: 121,
    closedAt: new Date(Date.now() - 4 * 86400000).toISOString(),
    pop: 55,
    legs: [
      { side: 'BUY', optionType: 'CALL', strike: 125, price: 3.50 },
      { side: 'SELL', optionType: 'CALL', strike: 130, price: 1.50 }
    ]
  },
  {
    id: 104,
    timestamp: new Date(Date.now() - 8 * 86400000).toISOString(),
    sourceMode: 'snapshot',
    symbol: 'AAPL',
    spot: 220,
    strategy: 'Bull Put Credit Spread',
    dte: 7,
    status: 'Cerrado',
    maxRisk: 400,
    maxProfit: 100,
    pnl: 95,
    exitPrice: 224,
    closedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    pop: 82,
    legs: [
      { side: 'SELL', optionType: 'PUT', strike: 215, price: 1.30 },
      { side: 'BUY', optionType: 'PUT', strike: 210, price: 0.30 }
    ]
  },
  {
    id: 105,
    timestamp: new Date(Date.now() - 6 * 86400000).toISOString(),
    sourceMode: 'snapshot',
    symbol: 'SOFI',
    spot: 14,
    strategy: 'Cash Secured Put',
    dte: 14,
    status: 'Cerrado',
    maxRisk: 1300,
    maxProfit: 70,
    pnl: 65,
    exitPrice: 14.50,
    closedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    pop: 85,
    legs: [{ side: 'SELL', optionType: 'PUT', strike: 13.50, price: 0.70 }]
  },
  {
    id: 106,
    timestamp: new Date(Date.now() - 3 * 86400000).toISOString(),
    sourceMode: 'snapshot',
    symbol: 'SPY',
    spot: 598,
    strategy: 'Bull Put Credit Spread',
    dte: 5,
    status: 'Abierto',
    maxRisk: 380,
    maxProfit: 120,
    pnl: 45,
    pop: 80,
    legs: [
      { side: 'SELL', optionType: 'PUT', strike: 590, price: 1.70 },
      { side: 'BUY', optionType: 'PUT', strike: 585, price: 0.50 }
    ]
  },
  {
    id: 107,
    timestamp: new Date(Date.now() - 1 * 86400000).toISOString(),
    sourceMode: 'snapshot',
    symbol: 'QQQ',
    spot: 518,
    strategy: 'Iron Condor',
    dte: 7,
    status: 'Abierto',
    maxRisk: 360,
    maxProfit: 140,
    pnl: 20,
    pop: 74,
    legs: [
      { side: 'SELL', optionType: 'PUT', strike: 505, price: 1.40 },
      { side: 'BUY', optionType: 'PUT', strike: 500, price: 0.40 },
      { side: 'SELL', optionType: 'CALL', strike: 530, price: 1.30 },
      { side: 'BUY', optionType: 'CALL', strike: 535, price: 0.30 }
    ]
  }
];

function loadTrades() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : SEED_TRADES;
  } catch {
    return SEED_TRADES;
  }
}

const templates = [
  ['SPY 0DTE educativo', 'SPY', 600, 'Bull Put Credit Spread', 0],
  ['SPY 1DTE', 'SPY', 600, 'Iron Condor', 1],
  ['QQQ 1DTE', 'QQQ', 520, 'Bear Call Credit Spread', 1],
  ['NVDA weekly', 'NVDA', 130, 'Bull Call Debit Spread', 7],
  ['SOFI covered/cash secured', 'SOFI', 14, 'Cash Secured Put', 30],
  ['Iron Condor SPY', 'SPY', 600, 'Iron Condor', 7],
  ['Credit Spread QQQ', 'QQQ', 520, 'Bull Put Credit Spread', 7],
  ['Debit Spread AAPL', 'AAPL', 200, 'Bull Call Debit Spread', 14]
];

export default function PaperTradingDesk({ importedSetup, profile, onSaveJournal, onReplay }) {
  const [sourceMode, setSourceMode] = useState('manual');
  const [symbol, setSymbol] = useState('SPY');
  const [spot, setSpot] = useState(600);
  const [strategy, setStrategy] = useState('Bull Put Credit Spread');
  const [dte, setDte] = useState(7);
  const [iv, setIv] = useState('22');
  const [legs, setLegs] = useState(() => templateLegs('Bull Put Credit Spread', 600));
  const [trades, setTrades] = useState(loadTrades);
  const [message, setMessage] = useState('');
  const [exitPrice, setExitPrice] = useState('');
  const [activeTab, setActiveTab] = useState('stats'); // 'stats' | 'desk' | 'audit' | 'copilot'
  const [aiAudit, setAiAudit] = useState(null);
  const [auditing, setAuditing] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState([
    { role: 'assistant', text: '¡Hola! Soy Gemini Guardian, tu copiloto de trading cuantitativo. ¿Qué consulta o estrategia deseas revisar hoy?' }
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!importedSetup) return;
    setSymbol(importedSetup.symbol || 'SPY');
    setSpot(importedSetup.underlyingPrice || 100);
    setStrategy(importedSetup.strategy || 'Bull Put Credit Spread');
    setDte(importedSetup.dte ?? 7);
    setIv(importedSetup.iv ?? '22');
    setSourceMode(importedSetup.sourceMode || (importedSetup.edge ? 'snapshot' : 'manual'));
    setLegs(
      importedSetup.legs?.length
        ? importedSetup.sourceMode === 'manual'
          ? importedSetup.legs.map((leg) => ({ ...leg }))
          : legsFromSignal(importedSetup)
        : templateLegs(importedSetup.strategy, importedSetup.underlyingPrice || 100)
    );
    setMessage('Estrategia importada. Revisa la cadena y registra un fill simulado.');
  }, [importedSetup]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
  }, [trades]);

  const analytics = useMemo(() => {
    const input = { legs, spot: Number(spot), commissions: 2.6 };
    const maxRisk = calculateMaxRisk(input);
    const maxProfit = calculateMaxProfit(input);
    const pop = estimateProbability(legs);
    const warnings = validateStrategy({
      legs,
      strategy,
      spot: Number(spot),
      accountSize: profile?.accountSize || 10000,
      riskPercent: profile?.riskPct || 2,
      dte: Number(dte),
      gammaRisk: importedSetup?.gammaRisk || 'unavailable'
    });
    return {
      maxRisk,
      maxProfit,
      breakEven: calculateBreakEven(input),
      greeks: calculateNetGreeks(legs),
      pop,
      edge: estimateEdge({ maxRisk, maxProfit, probability: pop.probability, legs }),
      warnings
    };
  }, [legs, spot, strategy, dte, profile?.accountSize, profile?.riskPct, importedSetup?.gammaRisk]);

  // Comprehensive Performance Statistics Engine
  const stats = useMemo(() => {
    const closed = trades.filter((t) => t.status === 'Cerrado' && Number.isFinite(t.pnl));
    const open = trades.filter((t) => t.status === 'Abierto');
    const wins = closed.filter((t) => t.pnl > 0);
    const losses = closed.filter((t) => t.pnl < 0);

    const totalClosed = closed.length;
    const winRate = totalClosed > 0 ? wins.length / totalClosed : 0;
    const lossRate = totalClosed > 0 ? losses.length / totalClosed : 0;

    const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
    const netPnl = closed.reduce((s, t) => s + t.pnl, 0);
    const openPnl = open.reduce((s, t) => s + (t.pnl || 0), 0);

    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99.9 : 0;

    const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
    const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
    const riskRewardRatio = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? 99.9 : 0;

    const expectancy = winRate * avgWin - lossRate * avgLoss;

    // Max Drawdown, Equity & Performance History
    const initialAccount = profile?.accountSize || 10000;
    const maxRiskPctConfig = profile?.riskPct || 2;
    let currentEquity = initialAccount;
    let peakEquity = initialAccount;
    let accumPnl = 0;
    let winsCount = 0;
    let maxDrawdownUsd = 0;
    let maxDrawdownPct = 0;

    const performanceHistory = [
      {
        trade: 0,
        date: 'Inicio',
        equity: initialAccount,
        accumulatedPnl: 0,
        winRatePct: 0,
        drawdownUsd: 0,
        drawdownPct: 0,
        pnl: 0,
        symbol: '-'
      }
    ];

    closed.forEach((t, idx) => {
      accumPnl += t.pnl;
      currentEquity += t.pnl;
      if (t.pnl > 0) winsCount++;

      if (currentEquity > peakEquity) peakEquity = currentEquity;
      const ddUsd = peakEquity - currentEquity;
      const ddPct = peakEquity > 0 ? (ddUsd / peakEquity) * 100 : 0;

      if (ddUsd > maxDrawdownUsd) maxDrawdownUsd = ddUsd;
      if (ddPct > maxDrawdownPct) maxDrawdownPct = ddPct;

      const currentWinRate = (winsCount / (idx + 1)) * 100;

      performanceHistory.push({
        trade: idx + 1,
        date: t.closedAt ? new Date(t.closedAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : `T#${idx + 1}`,
        equity: currentEquity,
        accumulatedPnl: Number(accumPnl.toFixed(2)),
        winRatePct: Number(currentWinRate.toFixed(1)),
        drawdownUsd: Number((-ddUsd).toFixed(2)),
        drawdownPct: Number((-ddPct).toFixed(2)),
        pnl: t.pnl,
        symbol: t.symbol,
        strategy: t.strategy
      });
    });

    // Sharpe Ratio calculation
    const returns = closed.map((t) => t.pnl);
    let sharpeRatio = 0;
    if (returns.length > 1) {
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (returns.length - 1);
      const stdDev = Math.sqrt(variance);
      sharpeRatio = stdDev > 0 ? (mean / stdDev) * Math.sqrt(252 / 30) : 0;
    }

    // Streaks
    let currentStreak = 0;
    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let streakType = null;

    closed.forEach((t) => {
      if (t.pnl > 0) {
        if (streakType === 'WIN') currentStreak++;
        else {
          streakType = 'WIN';
          currentStreak = 1;
        }
        if (currentStreak > maxWinStreak) maxWinStreak = currentStreak;
      } else if (t.pnl < 0) {
        if (streakType === 'LOSS') currentStreak++;
        else {
          streakType = 'LOSS';
          currentStreak = 1;
        }
        if (currentStreak > maxLossStreak) maxLossStreak = currentStreak;
      }
    });

    // Strategy breakdown
    const strategyMap = {};
    closed.forEach((t) => {
      if (!strategyMap[t.strategy]) strategyMap[t.strategy] = { name: t.strategy, trades: 0, pnl: 0 };
      strategyMap[t.strategy].trades++;
      strategyMap[t.strategy].pnl += t.pnl;
    });
    const strategyData = Object.values(strategyMap);

    // Symbol breakdown
    const symbolMap = {};
    closed.forEach((t) => {
      if (!symbolMap[t.symbol]) symbolMap[t.symbol] = { name: t.symbol, trades: 0, pnl: 0 };
      symbolMap[t.symbol].trades++;
      symbolMap[t.symbol].pnl += t.pnl;
    });
    const symbolData = Object.values(symbolMap);

    // Net Greeks across open positions
    let totalDelta = 0;
    let totalGamma = 0;
    let totalTheta = 0;
    let totalVega = 0;

    open.forEach((t) => {
      if (t.legs) {
        const g = calculateNetGreeks(t.legs);
        totalDelta += g.delta || 0;
        totalGamma += g.gamma || 0;
        totalTheta += g.theta || 0;
        totalVega += g.vega || 0;
      }
    });

    return {
      totalTrades: trades.length,
      openTrades: open.length,
      closedTrades: closed.length,
      winRate,
      lossRate,
      grossProfit,
      grossLoss,
      netPnl,
      openPnl,
      profitFactor,
      avgWin,
      avgLoss,
      riskRewardRatio,
      expectancy,
      maxDrawdownUsd,
      maxDrawdownPct,
      sharpeRatio,
      maxWinStreak,
      maxLossStreak,
      equityCurve: performanceHistory,
      performanceHistory,
      initialAccount,
      maxRiskPctConfig,
      strategyData,
      symbolData,
      netGreeks: { delta: totalDelta, gamma: totalGamma, theta: totalTheta, vega: totalVega }
    };
  }, [trades]);

  function loadTemplate(template) {
    const [, nextSymbol, nextSpot, nextStrategy, nextDte] = template;
    setSourceMode('mock educativo');
    setSymbol(nextSymbol);
    setSpot(nextSpot);
    setStrategy(nextStrategy);
    setDte(nextDte);
    setIv('22');
    setLegs(templateLegs(nextStrategy, nextSpot));
    setMessage('Plantilla educativa cargada.');
  }

  function createPaperTrade() {
    const entry = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      sourceMode,
      symbol,
      spot: Number(spot),
      strategy,
      dte: Number(dte),
      iv: iv === '' ? null : Number(iv),
      legs,
      status: analytics.warnings.some((w) => w.includes('Bloqueado')) ? 'Cancelado por Risk Governor' : 'Abierto',
      maxRisk: analytics.maxRisk,
      maxProfit: analytics.maxProfit,
      breakEven: analytics.breakEven,
      pop: analytics.pop.probability,
      pnl: 0,
      notes: sourceMode === 'live' ? 'Verificado' : 'Paper Trade Educativo'
    };
    setTrades((curr) => [entry, ...curr]);
    onReplay?.(entry);
    setMessage(entry.status === 'Abierto' ? 'Paper trade abierto con éxito.' : 'Operación cancelada por Risk Governor.');
  }

  async function closeTrade(trade) {
    if (!Number.isFinite(Number(exitPrice))) {
      setMessage('Introduce un precio subyacente de salida simulado.');
      return;
    }
    const pnl = calculatePayoff({ legs: trade.legs, underlyingPrice: Number(exitPrice), commissions: 2.6 });
    const closed = { ...trade, status: 'Cerrado', exitPrice: Number(exitPrice), pnl, closedAt: new Date().toISOString() };
    setTrades((curr) => curr.map((t) => (t.id === trade.id ? closed : t)));
    await onSaveJournal?.({
      symbol: closed.symbol,
      strategy: closed.strategy,
      outcome: 'PAPER TRADE',
      pnl: closed.pnl,
      reason: 'Paper Trading de Opciones',
      notes: `${closed.sourceMode} | salida simulada ${closed.exitPrice}`
    });
    setMessage('Trade cerrado y registrado en el Journal.');
  }

  function resetSeedData() {
    setTrades(SEED_TRADES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_TRADES));
    setMessage('Datos de ejemplo educativos restablecidos.');
  }

  // Gemini Portfolio Audit Call
  async function runPortfolioAudit() {
    setAuditing(true);
    try {
      const res = await fetch('/api/gemini/audit-portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trades, accountValue: profile?.accountSize || 10000 })
      });
      const data = await res.json();
      if (data.ok && data.audit) {
        setAiAudit(data.audit);
        setActiveTab('audit');
      }
    } catch (err) {
      console.error('Audit failed:', err);
    } finally {
      setAuditing(false);
    }
  }

  // Gemini AI Trade Generator Call
  async function generateGeminiTrade() {
    setGenerating(true);
    try {
      const res = await fetch('/api/gemini/generate-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          sentiment: 'bullish',
          spotPrice: spot,
          accountSize: profile?.accountSize || 10000
        })
      });
      const data = await res.json();
      if (data.ok && data.trade) {
        const t = data.trade;
        setSymbol(t.symbol);
        setStrategy(t.strategy);
        setDte(t.dte || 7);
        if (t.legs) setLegs(t.legs);
        setMessage(`Gemini AI ha generado un ${t.strategy} para ${t.symbol} con ${t.pop}% POP.`);
      }
    } catch (err) {
      console.error('Generate trade failed:', err);
    } finally {
      setGenerating(false);
    }
  }

  // Gemini Chat
  async function sendChatMessage() {
    if (!chatMessage.trim() || chatLoading) return;
    const userMsg = chatMessage.trim();
    setChatMessage('');
    const newHist = [...chatHistory, { role: 'user', text: userMsg }];
    setChatHistory(newHist);
    setChatLoading(true);

    try {
      const res = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          history: newHist,
          context: { symbol, spot, strategy, openTradesCount: stats.openTrades, netPnl: stats.netPnl }
        })
      });
      const data = await res.json();
      if (data.ok && data.reply) {
        setChatHistory([...newHist, { role: 'assistant', text: data.reply }]);
      }
    } catch (err) {
      setChatHistory([...newHist, { role: 'assistant', text: 'Respuesta cuantitativa local: Revisa tus griegas y mantén stop loss estricto.' }]);
    } finally {
      setChatLoading(false);
    }
  }

  return (
    <section className="bg-slate-900 text-slate-100 rounded-3xl p-4 md:p-6 shadow-2xl border border-slate-800 space-y-6">
      {/* Header section */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <Zap className="w-3 h-3 text-blue-400" /> Paper Trading Desk Pro
            </span>
            <span className="bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-purple-400" /> Gemini Guardian AI
            </span>
          </div>
          <h2 className="mt-1 text-2xl font-black text-white tracking-tight">Mósculo Estadístico & Laboratorio de Opciones</h2>
          <p className="text-xs text-slate-400">Simulación institucional con análisis cuantitativo de griegas, ratio Sharpe, expectativa matemática y auditoría Gemini.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={runPortfolioAudit}
            disabled={auditing}
            className="flex items-center gap-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs px-3 py-2 rounded-xl shadow-lg transition disabled:opacity-50"
          >
            <BrainCircuit className="w-4 h-4" />
            {auditing ? 'Auditando...' : 'Auditoría Gemini AI'}
          </button>
          <button
            onClick={resetSeedData}
            title="Cargar datos de ejemplo educativos"
            className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs px-3 py-2 rounded-xl border border-slate-700 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Ejemplos
          </button>
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="flex border-b border-slate-800 gap-2">
        <button
          onClick={() => setActiveTab('stats')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-black rounded-t-xl transition border-b-2 ${
            activeTab === 'stats'
              ? 'border-blue-500 bg-blue-500/10 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <BarChart3 className="w-4 h-4" /> Estadísticas & Gráficos
        </button>
        <button
          onClick={() => setActiveTab('desk')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-black rounded-t-xl transition border-b-2 ${
            activeTab === 'desk'
              ? 'border-blue-500 bg-blue-500/10 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Sliders className="w-4 h-4" /> Nueva Operación & Cadena
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-black rounded-t-xl transition border-b-2 ${
            activeTab === 'audit'
              ? 'border-purple-500 bg-purple-500/10 text-purple-300'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <BrainCircuit className="w-4 h-4" /> Auditoría de Cartera AI
        </button>
        <button
          onClick={() => setActiveTab('copilot')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-black rounded-t-xl transition border-b-2 ${
            activeTab === 'copilot'
              ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Bot className="w-4 h-4" /> Gemini Copilot Chat
        </button>
      </div>

      {message && (
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold p-3 rounded-xl flex items-center justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage('')} className="text-amber-400 hover:text-white">✕</button>
        </div>
      )}

      {/* TAB 1: ADVANCED STATISTICS & VISUAL CHARTS */}
      {activeTab === 'stats' && (
        <div className="space-y-6">
          {/* Main KPI Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <StatCard
              label="P/L Realizado"
              value={money(stats.netPnl)}
              subtext={`P/L Abierto: ${money(stats.openPnl)}`}
              tone={stats.netPnl >= 0 ? 'green' : 'red'}
              icon={<DollarSign className="w-4 h-4" />}
            />
            <StatCard
              label="Win Rate"
              value={percent(stats.winRate)}
              subtext={`${stats.closedTrades} oper. cerradas`}
              tone={stats.winRate >= 0.6 ? 'green' : 'amber'}
              icon={<TrendingUp className="w-4 h-4" />}
            />
            <StatCard
              label="Profit Factor"
              value={stats.profitFactor.toFixed(2)}
              subtext={`Ganancia bruta / Pérdida`}
              tone={stats.profitFactor >= 1.5 ? 'green' : 'amber'}
              icon={<Activity className="w-4 h-4" />}
            />
            <StatCard
              label="Sharpe Ratio"
              value={stats.sharpeRatio.toFixed(2)}
              subtext="Retorno ajustado x riesgo"
              tone={stats.sharpeRatio >= 1.0 ? 'purple' : 'slate'}
              icon={<Zap className="w-4 h-4" />}
            />
            <StatCard
              label="Max Drawdown"
              value={money(stats.maxDrawdownUsd)}
              subtext={`${stats.maxDrawdownPct.toFixed(1)}% de pico`}
              tone="red"
              icon={<TrendingDown className="w-4 h-4" />}
            />
            <StatCard
              label="Expectativa $"
              value={money(stats.expectancy)}
              subtext="Promedio esperado / trade"
              tone={stats.expectancy >= 0 ? 'green' : 'red'}
              icon={<Sparkles className="w-4 h-4" />}
            />
          </div>

          {/* Secondary Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 bg-slate-800/40 p-3 rounded-2xl border border-slate-800">
            <div>
              <p className="text-[10px] font-black uppercase text-slate-500">Ganancia Promedio</p>
              <p className="text-sm font-black text-emerald-400">{money(stats.avgWin)}</p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase text-slate-500">Pérdida Promedio</p>
              <p className="text-sm font-black text-rose-400">{money(stats.avgLoss)}</p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase text-slate-500">Ratio Riesgo/Beneficio</p>
              <p className="text-sm font-black text-blue-400">{stats.riskRewardRatio.toFixed(2)}:1</p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase text-slate-500">Racha Victorias Máx</p>
              <p className="text-sm font-black text-emerald-400">{stats.maxWinStreak} trades</p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase text-slate-500">Racha Pérdidas Máx</p>
              <p className="text-sm font-black text-rose-400">{stats.maxLossStreak} trades</p>
            </div>
          </div>

          {/* Portfolio Net Greeks Exposure */}
          <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-200 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-blue-400" /> Exposición Neta de Griegas (Posiciones Abiertas)
              </h3>
              <span className="text-[10px] font-bold text-slate-400">{stats.openTrades} posiciones abiertas</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <GreekBadge label="Delta Neta (Δ)" value={stats.netGreeks.delta.toFixed(2)} desc="Sensibilidad al precio" tone={stats.netGreeks.delta >= 0 ? 'green' : 'red'} />
              <GreekBadge label="Gamma Neta (Γ)" value={stats.netGreeks.gamma.toFixed(4)} desc="Aceleración del Delta" tone="blue" />
              <GreekBadge label="Theta Neta (Θ)" value={`$${stats.netGreeks.theta.toFixed(2)}/día`} desc="Ganancia por decaimiento temporal" tone={stats.netGreeks.theta >= 0 ? 'green' : 'amber'} />
              <GreekBadge label="Vega Neta (V)" value={`$${stats.netGreeks.vega.toFixed(2)}/%IV`} desc="Sensibilidad a Volatilidad" tone="purple" />
            </div>
          </div>

          {/* Comprehensive Recharts Visual Analytics Section */}
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-4 rounded-2xl border border-indigo-500/30 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/60 pb-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-indigo-400" />
                  <h3 className="text-base font-black text-white">Historial Visual de Rendimiento (Entorno Real & Paper Trading)</h3>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-bold text-slate-300">
                  <span className="bg-indigo-900/60 text-indigo-200 border border-indigo-700/50 px-2.5 py-1 rounded-full">
                    Cuenta Entorno: {money(stats.initialAccount)}
                  </span>
                  <span className="bg-purple-900/60 text-purple-200 border border-purple-700/50 px-2.5 py-1 rounded-full">
                    Riesgo/Trade: {stats.maxRiskPctConfig}%
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2">
                <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/60">
                  <span className="text-[10px] font-black uppercase text-slate-400">P&L Acumulado Total</span>
                  <p className={`text-base font-black ${stats.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {money(stats.netPnl)}
                  </p>
                </div>
                <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/60">
                  <span className="text-[10px] font-black uppercase text-slate-400">Tasa de Aciertos Global</span>
                  <p className="text-base font-black text-indigo-300">
                    {percent(stats.winRate)} ({stats.closedTrades} ops)
                  </p>
                </div>
                <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/60">
                  <span className="text-[10px] font-black uppercase text-slate-400">Pico de Drawdown</span>
                  <p className="text-base font-black text-rose-400">
                    -{money(stats.maxDrawdownUsd)} ({stats.maxDrawdownPct.toFixed(1)}%)
                  </p>
                </div>
                <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/60">
                  <span className="text-[10px] font-black uppercase text-slate-400">Capital Actual en Entorno</span>
                  <p className="text-base font-black text-emerald-300">
                    {money(stats.initialAccount + stats.netPnl)}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Chart 1: Accumulated P&L AreaChart */}
              <div className="bg-slate-800/40 p-4 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase text-slate-200 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" /> P&L Acumulado ($ USD)
                  </h4>
                  <span className="text-[10px] text-emerald-400 font-bold">{money(stats.netPnl)}</span>
                </div>
                <div className="h-60 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stats.performanceHistory}>
                      <defs>
                        <linearGradient id="colorPnl" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} />
                      <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `$${v}`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#fff' }}
                        formatter={(val, name) => [money(val), name === 'accumulatedPnl' ? 'P&L Acumulado' : name]}
                      />
                      <Area type="monotone" dataKey="accumulatedPnl" name="P&L Acumulado" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#colorPnl)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 2: Evolutionary Win Rate (%) Area/LineChart */}
              <div className="bg-slate-800/40 p-4 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase text-slate-200 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-indigo-400" /> Evolución de Tasa de Aciertos (%)
                  </h4>
                  <span className="text-[10px] text-indigo-300 font-bold">{percent(stats.winRate)}</span>
                </div>
                <div className="h-60 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stats.performanceHistory}>
                      <defs>
                        <linearGradient id="colorWinRate" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} />
                      <YAxis stroke="#94a3b8" fontSize={11} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#fff' }}
                        formatter={(val) => [`${val}%`, 'Tasa de Aciertos']}
                      />
                      <Area type="monotone" dataKey="winRatePct" name="Win Rate %" stroke="#6366f1" strokeWidth={2.5} fillOpacity={1} fill="url(#colorWinRate)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 3: Historical Drawdown Chart */}
              <div className="bg-slate-800/40 p-4 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase text-slate-200 flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-rose-400" /> Curva de Drawdown Histórico ($)
                  </h4>
                  <span className="text-[10px] text-rose-400 font-bold">Máx: -{money(stats.maxDrawdownUsd)}</span>
                </div>
                <div className="h-60 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stats.performanceHistory}>
                      <defs>
                        <linearGradient id="colorDrawdown" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} />
                      <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `$${v}`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#fff' }}
                        formatter={(val) => [money(val), 'Drawdown USD']}
                      />
                      <Area type="monotone" dataKey="drawdownUsd" name="Drawdown USD" stroke="#f43f5e" strokeWidth={2} fillOpacity={1} fill="url(#colorDrawdown)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 4: P&L by Strategy BarChart */}
              <div className="bg-slate-800/40 p-4 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase text-slate-200 flex items-center gap-2">
                    <PieChartIcon className="w-4 h-4 text-blue-400" /> Rendimiento por Estrategia ($ P/L)
                  </h4>
                  <span className="text-[10px] text-blue-400 font-bold">{stats.strategyData.length} estrategias</span>
                </div>
                <div className="h-60 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.strategyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} interval={0} />
                      <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `$${v}`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#fff' }}
                        formatter={(val) => [money(val), 'P/L Realizado']}
                      />
                      <Bar dataKey="pnl" radius={[6, 6, 0, 0]}>
                        {stats.strategyData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? '#3b82f6' : '#f43f5e'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>

          {/* Trade Log Table */}
          <div className="bg-slate-800/40 p-4 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-black text-slate-200">Historial de Operaciones Paper ({trades.length})</h3>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  placeholder="Precio salida simulado"
                  value={exitPrice}
                  onChange={(e) => setExitPrice(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-blue-500 w-44"
                />
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
              {trades.length ? (
                trades.map((trade) => (
                  <div key={trade.id} className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-white text-sm">{trade.symbol}</span>
                        <span className="bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-bold text-[10px]">{trade.strategy}</span>
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                          trade.status === 'Abierto' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-300'
                        }`}>{trade.status}</span>
                      </div>
                      <p className="text-slate-400">
                        Entrada: ${trade.spot} | Riesgo Máx: {money(trade.maxRisk)} | Ganancia Máx: {money(trade.maxProfit)} | POP: {trade.pop ? `${trade.pop}%` : 'N/D'}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-[10px] font-black uppercase text-slate-500">P/L</p>
                        <p className={`font-black text-sm ${trade.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {money(trade.pnl)}
                        </p>
                      </div>

                      {trade.status === 'Abierto' && (
                        <button
                          onClick={() => closeTrade(trade)}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition"
                        >
                          Cerrar Spot
                        </button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500 py-4 text-center">No hay paper trades registrados.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: NEW TRADE SETUP & OPTION CHAIN */}
      {activeTab === 'desk' && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <button
                key={t[0]}
                onClick={() => loadTemplate(t)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-bold px-3 py-1.5 rounded-xl transition"
              >
                {t[0]}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 bg-slate-800/40 p-4 rounded-2xl border border-slate-800">
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Modo / Fuente</label>
              <select
                value={sourceMode}
                onChange={(e) => setSourceMode(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-xs font-bold text-white outline-none"
              >
                <option value="manual">Manual</option>
                <option value="snapshot">Snapshot Server</option>
                <option value="delayed">Diferido</option>
                <option value="mock educativo">Mock Educativo</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Símbolo</label>
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-xs font-bold text-white outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Precio Subyacente ($)</label>
              <input
                type="number"
                step="0.01"
                value={spot}
                onChange={(e) => setSpot(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-xs font-bold text-white outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">DTE (Días Expiración)</label>
              <input
                type="number"
                value={dte}
                onChange={(e) => setDte(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-xs font-bold text-white outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">IV %</label>
              <input
                type="number"
                value={iv}
                onChange={(e) => setIv(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-xs font-bold text-white outline-none"
              />
            </div>
          </div>

          {/* Analytics Summary */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <StatCard label="Riesgo Máximo" value={money(analytics.maxRisk)} tone="red" />
            <StatCard label="Ganancia Máxima" value={money(analytics.maxProfit)} tone="green" />
            <StatCard label="Break-Even" value={analytics.breakEven.join(' / ') || 'N/D'} tone="blue" />
            <StatCard label="POP Estimado" value={analytics.pop.probability ? `${analytics.pop.probability}%` : 'N/D'} tone="purple" />
            <StatCard label="Expectativa (EV)" value={money(analytics.edge.expectedValue)} tone="green" />
            <StatCard label="Theta Neto" value={analytics.greeks.theta?.toFixed(2) || '0'} tone="amber" />
          </div>

          <div className="flex gap-3">
            <button
              onClick={createPaperTrade}
              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-black text-sm py-3 rounded-2xl shadow-lg transition flex items-center justify-center gap-2"
            >
              <PlusCircle className="w-4 h-4" /> Registrar Entrada Simulada
            </button>
            <button
              onClick={generateGeminiTrade}
              disabled={generating}
              className="bg-purple-600 hover:bg-purple-500 text-white font-black text-sm px-4 py-3 rounded-2xl shadow-lg transition flex items-center gap-2 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" /> {generating ? 'Generando...' : 'Generar con AI'}
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: GEMINI PORTFOLIO AUDIT */}
      {activeTab === 'audit' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-slate-800/40 p-4 rounded-2xl border border-slate-800">
            <div>
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <BrainCircuit className="w-5 h-5 text-purple-400" /> Auditoría Cuantitativa de Cartera Gemini AI
              </h3>
              <p className="text-xs text-slate-400 mt-1">Evaluación de concentraciones, riesgo de asignación y griegas de tu cartera paper.</p>
            </div>
            <button
              onClick={runPortfolioAudit}
              disabled={auditing}
              className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs px-4 py-2 rounded-xl transition"
            >
              {auditing ? 'Procesando...' : 'Re-auditar Ahora'}
            </button>
          </div>

          {aiAudit ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-800/60 p-4 rounded-2xl border border-slate-700 text-center">
                  <p className="text-xs font-black uppercase text-slate-400">Salud de la Cartera</p>
                  <p className="text-4xl font-black text-purple-400 mt-2">{aiAudit.healthScore}/100</p>
                  <p className="text-[10px] text-slate-400 mt-1">Puntuación Cuantitativa</p>
                </div>
                <div className="bg-slate-800/60 p-4 rounded-2xl border border-slate-700 text-center">
                  <p className="text-xs font-black uppercase text-slate-400">Nivel de Riesgo Global</p>
                  <p className="text-2xl font-black text-amber-400 mt-3">{aiAudit.riskLevel}</p>
                </div>
                <div className="bg-slate-800/60 p-4 rounded-2xl border border-slate-700">
                  <p className="text-xs font-black uppercase text-slate-400 mb-1">Evaluación de Griegas</p>
                  <p className="text-xs text-slate-300 leading-relaxed">{aiAudit.greeksAssessment}</p>
                </div>
              </div>

              <div className="bg-slate-800/40 p-4 rounded-2xl border border-slate-800">
                <h4 className="text-xs font-black uppercase text-slate-300 mb-2">Resumen Ejecutivo</h4>
                <p className="text-xs text-slate-300 leading-relaxed">{aiAudit.summary}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-emerald-950/20 p-4 rounded-2xl border border-emerald-500/30">
                  <h4 className="text-xs font-black uppercase text-emerald-400 mb-2 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> Fortalezas de la Cartera
                  </h4>
                  <ul className="space-y-1.5 text-xs text-emerald-200">
                    {aiAudit.strengths?.map((s, idx) => (
                      <li key={idx}>• {s}</li>
                    ))}
                  </ul>
                </div>

                <div className="bg-rose-950/20 p-4 rounded-2xl border border-rose-500/30">
                  <h4 className="text-xs font-black uppercase text-rose-400 mb-2 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4" /> Vulnerabilidades Identificadas
                  </h4>
                  <ul className="space-y-1.5 text-xs text-rose-200">
                    {aiAudit.vulnerabilities?.map((v, idx) => (
                      <li key={idx}>• {v}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="bg-indigo-950/20 p-4 rounded-2xl border border-indigo-500/30">
                <h4 className="text-xs font-black uppercase text-indigo-300 mb-2 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-indigo-400" /> Acciones Sugeridas por Gemini
                </h4>
                <ul className="space-y-1.5 text-xs text-indigo-100">
                  {aiAudit.actionableAdvice?.map((a, idx) => (
                    <li key={idx}>➔ {a}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="bg-slate-800/40 p-8 rounded-2xl border border-slate-800 text-center space-y-3">
              <BrainCircuit className="w-12 h-12 text-purple-400 mx-auto animate-pulse" />
              <p className="text-sm font-bold text-slate-300">Haz clic en "Auditoría Gemini AI" para analizar tu cartera actual.</p>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: GEMINI COPILOT CHAT */}
      {activeTab === 'copilot' && (
        <div className="space-y-4">
          <div className="bg-slate-800/40 p-4 rounded-2xl border border-slate-800 h-80 overflow-y-auto space-y-3 pr-2">
            {chatHistory.map((m, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-2xl max-w-2xl text-xs leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-blue-600 text-white ml-auto'
                    : 'bg-slate-800 border border-slate-700 text-slate-200'
                }`}
              >
                <span className="block font-black text-[10px] uppercase opacity-70 mb-1">
                  {m.role === 'user' ? 'Tú' : 'Gemini Guardian'}
                </span>
                {m.text}
              </div>
            ))}
            {chatLoading && (
              <div className="bg-slate-800 p-3 rounded-2xl max-w-xs text-xs text-slate-400 border border-slate-700 animate-pulse">
                Gemini analizando la consulta...
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()}
              placeholder="Hazle una consulta estratégica a Gemini Guardian..."
              className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white outline-none focus:border-emerald-500"
            />
            <button
              onClick={sendChatMessage}
              disabled={chatLoading}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition disabled:opacity-50"
            >
              Enviar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function StatCard({ label, value, subtext, tone = 'slate', icon }) {
  const tones = {
    green: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    red: 'border-rose-500/30 bg-rose-500/10 text-rose-400',
    blue: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
    purple: 'border-purple-500/30 bg-purple-500/10 text-purple-400',
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    slate: 'border-slate-800 bg-slate-800/40 text-slate-200'
  };

  return (
    <div className={`p-3 rounded-2xl border ${tones[tone] || tones.slate} space-y-1`}>
      <div className="flex items-center justify-between text-slate-400 text-[10px] font-black uppercase">
        <span>{label}</span>
        {icon}
      </div>
      <p className="text-lg font-black tracking-tight">{value}</p>
      {subtext && <p className="text-[10px] text-slate-400 font-bold">{subtext}</p>}
    </div>
  );
}

function GreekBadge({ label, value, desc, tone = 'blue' }) {
  const tones = {
    green: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
    red: 'text-rose-400 border-rose-500/30 bg-rose-500/10',
    blue: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
    purple: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
    amber: 'text-amber-400 border-amber-500/30 bg-amber-500/10'
  };

  return (
    <div className={`p-2.5 rounded-xl border ${tones[tone]} space-y-0.5`}>
      <p className="text-[10px] font-black uppercase opacity-80">{label}</p>
      <p className="text-base font-black">{value}</p>
      <p className="text-[9px] opacity-70 leading-tight">{desc}</p>
    </div>
  );
}
