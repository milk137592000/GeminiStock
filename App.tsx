
import React, { useState, useEffect, useCallback } from 'react';

// --- TYPE DEFINITIONS ---
enum BotStatusEnum {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  ERROR = "ERROR",
}

interface StockData {
  price: number;
  change: number;
  changePercent: number;
}

interface MarketData {
  [key: string]: StockData;
}

interface BotStatus {
  status: BotStatusEnum;
  lastChecked: string;
  marketOpen: boolean;
  cumulativeDrop: number;
}

interface Signal {
  id: string;
  indicator: string;
  value: string;
  title: string;
  description: string;
  applicableTo: string[];
}

// --- MOCK/API LOGIC ---
const initialStockData: StockData = { price: 0, change: 0, changePercent: 0 };
let marketDataStore: MarketData = {
  "^TWII": { ...initialStockData },
  "0050.TW": { ...initialStockData },
  "00646.TW": { ...initialStockData },
  "00878.TW": { ...initialStockData },
  "00933B.TW": { ...initialStockData },
};
let cumulativeTwaiaDrop = 0;

const twseExchanges: Record<string, string> = {
  "^TWII": "tse_t00.tw",
  "0050.TW": "tse_0050.tw",
  "00646.TW": "tse_00646.tw",
  "00878.TW": "tse_00878.tw",
  "00933B.TW": "otc_00933B.tw",
};
const twseSymbolMap: Record<string, string> = {
  t00: "^TWII",
  "0050": "0050.TW",
  "00646": "00646.TW",
  "00878": "00878.TW",
  "00933B": "00933B.TW",
};

const fetchTwseMarketData = async (): Promise<void> => {
    const query = Object.values(twseExchanges).join("|");
    const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${query}&_=${Date.now()}`;
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
  
    try {
        const response = await fetch(proxyUrl);
        if (!response.ok) {
            throw new Error(`CORS proxy or TWSE API request failed with status ${response.status}`);
        }
        const data = await response.json();

        if (!data.msgArray || data.msgArray.length === 0) {
            console.warn("TWSE API returned no data in msgArray");
            return;
        }

        const newMarketData = { ...marketDataStore };

        for (const stock of data.msgArray) {
            const symbol = twseSymbolMap[stock.c];
            if (symbol) {
                const price = parseFloat(stock.z);
                const prevClose = parseFloat(stock.y);
                if (!isNaN(price) && !isNaN(prevClose) && prevClose > 0) {
                    const change = price - prevClose;
                    const changePercent = (change / prevClose) * 100;
                    newMarketData[symbol] = { price, change, changePercent };
                    if (symbol === "^TWII") {
                        cumulativeTwaiaDrop = change;
                    }
                }
            }
        }
        marketDataStore = newMarketData;
    } catch (error) {
        console.error("Failed to fetch real-time market data:", error);
        throw error;
    }
};

const isTwMarketOpen = (): boolean => {
    const now = new Date();
    const taipeiTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
    const day = taipeiTime.getDay();
    const hours = taipeiTime.getHours();
    const minutes = taipeiTime.getMinutes();

    if (day < 1 || day > 5) return false; // Not a weekday

    const totalMinutes = hours * 60 + minutes;
    const marketOpenMinutes = 9 * 60;
    const marketCloseMinutes = 13 * 60 + 30;

    return totalMinutes >= marketOpenMinutes && totalMinutes <= marketCloseMinutes;
};

// FIX: Added a trailing comma inside <T,> to resolve TSX parsing ambiguity with generics in arrow functions.
const mockApiLatency = <T,>(data: T, min = 200, max = 500): Promise<T> =>
    new Promise(resolve => setTimeout(() => resolve(data), min + Math.random() * (max - min)));


const fetchBotStatus = async (): Promise<BotStatus> => {
    const isOpen = isTwMarketOpen();
    const status: BotStatus = {
        status: isOpen ? BotStatusEnum.ACTIVE : BotStatusEnum.INACTIVE,
        lastChecked: new Date().toISOString(),
        marketOpen: isOpen,
        cumulativeDrop: cumulativeTwaiaDrop,
    };
    if (Math.random() > 0.98) {
        status.status = BotStatusEnum.ERROR;
    }
    return mockApiLatency(status);
};

const fetchMarketData = async (): Promise<MarketData> => {
  await fetchTwseMarketData();
  return Promise.resolve(JSON.parse(JSON.stringify(marketDataStore)));
};

const fetchSignals = async (): Promise<Signal[]> => {
    try {
        const response = await fetch('/api/signals');
        if (response.ok) {
            return (await response.json()) || [];
        }
        console.warn(`Failed to fetch signals with status: ${response.status}`);
        return [];
    } catch (error) {
        console.error("Failed to fetch opportunity signals:", error);
        return [];
    }
};

// --- UI COMPONENTS ---

const InfoIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-cyan-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const ExternalLinkIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
);

// FIX: Defined prop types in an interface and used React.FC for component clarity and type safety.
interface PriceDisplayProps {
    data: StockData;
}

const PriceDisplay: React.FC<PriceDisplayProps> = ({ data }) => {
    const isPositive = data.change >= 0;
    const colorClass = isPositive ? 'text-red-400' : 'text-green-400';
    const sign = isPositive && data.change > 0 ? '+' : '';

    return (
        <div className="text-right">
            <p className={`text-2xl lg:text-3xl font-bold font-mono ${colorClass}`}>{data.price.toFixed(2)}</p>
            <p className={`text-sm font-mono ${colorClass}`}>
                {sign}{data.change.toFixed(2)} ({sign}{data.changePercent.toFixed(2)}%)
            </p>
        </div>
    );
};

// FIX: Defined prop types in an interface and used React.FC for component clarity and type safety.
interface MarketCardProps {
    name: string;
    symbol: string;
    data?: StockData;
    isLoading: boolean;
    className?: string;
    linkUrl?: string;
}

const MarketCard: React.FC<MarketCardProps> = ({ name, symbol, data, isLoading, className = "", linkUrl }) => {
    const cardClasses = `bg-gray-900 border border-gray-800 rounded-lg p-4 flex flex-col transition-all duration-300 ${className}`;
    return (
        <div className={cardClasses}>
            <div className="flex justify-between items-baseline mb-2">
                <div className="flex items-center space-x-2">
                    <h4 className="font-bold text-gray-200">{name}</h4>
                    {linkUrl && (
                        <a href={linkUrl} target="_blank" rel="noopener noreferrer" aria-label={`追蹤 ${name} 於 Yahoo Finance`} className="text-gray-500 hover:text-cyan-400 transition-colors">
                            <ExternalLinkIcon />
                        </a>
                    )}
                </div>
                <span className="font-mono text-xs text-gray-400">{symbol}</span>
            </div>
            <div className="flex-grow flex items-center justify-center">
                {isLoading ? (
                    <p className="text-gray-400 text-sm animate-pulse">正在載入即時資料...</p>
                ) : data && data.price > 0 ? (
                    <div className="w-full">
                        <PriceDisplay data={data} />
                    </div>
                ) : (
                    <p className="text-amber-400 text-sm">無法載入資料</p>
                )}
            </div>
        </div>
    );
};

// FIX: Defined prop types in an interface and used React.FC for component clarity and type safety.
interface CumulativeDropCardProps {
    cumulativeDrop?: number;
    isLoading: boolean;
}

const CumulativeDropCard: React.FC<CumulativeDropCardProps> = ({ cumulativeDrop, isLoading }) => {
    const drop = cumulativeDrop ?? 0;
    const colorClass = drop >= 0 ? 'text-red-400' : 'text-green-400';
    return (
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-3 flex items-center space-x-3">
            <InfoIcon />
            <div>
                <h4 className="font-semibold text-gray-300">慢性失血計數器</h4>
                <div className="text-sm text-gray-400 h-5">
                    {isLoading ?
                        <div className="h-4 bg-gray-700 rounded-md animate-pulse w-48 mt-1" /> :
                        <span>目前累積: <span className={`font-mono font-bold ${colorClass}`}>{drop.toFixed(2)} 點</span></span>
                    }
                </div>
            </div>
        </div>
    );
};

// FIX: Defined prop types in an interface and used React.FC for component clarity and type safety.
interface MarketStatusSectionProps {
    statusData: BotStatus | null;
    marketData: MarketData | null;
    isLoading: boolean;
}

const MarketStatusSection: React.FC<MarketStatusSectionProps> = ({ statusData, marketData, isLoading }) => {
    const etfs = [
        { name: "元大台灣50", symbol: "0050.TW", linkUrl: "https://tw.stock.yahoo.com/quote/0050.TW" },
        { name: "元大S&P500", symbol: "00646.TW", linkUrl: "https://tw.stock.yahoo.com/quote/00646.TW" },
        { name: "國泰永續高股息", symbol: "00878.TW", linkUrl: "https://tw.stock.yahoo.com/quote/00878.TW" },
        { name: "國泰10Y+金融債", symbol: "00933B.TW", linkUrl: "https://tw.stock.yahoo.com/quote/00933B.TW" },
    ];

    return (
        <div className="space-y-6">
            <section aria-labelledby="market-status-heading">
                <h2 id="market-status-heading" className="text-xl font-bold text-gray-200 mb-3">市場狀態</h2>
                <div className="space-y-4">
                    <div>
                        <h3 className="text-base font-semibold text-gray-300 mb-2 sr-only">大盤指數</h3>
                        <MarketCard name="台灣加權指數" symbol="^TWII" data={marketData?.["^TWII"]} isLoading={isLoading} className="h-40" linkUrl="https://tw.stock.yahoo.com/quote/^TWII" />
                    </div>
                    <CumulativeDropCard cumulativeDrop={statusData?.cumulativeDrop} isLoading={isLoading || !statusData} />
                </div>
            </section>
            <section aria-labelledby="etf-monitoring-heading">
                <h2 id="etf-monitoring-heading" className="text-xl font-bold text-gray-200 mb-3">監控中的 ETF</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {etfs.map(etf => (
                        <MarketCard key={etf.symbol} name={etf.name} symbol={etf.symbol} data={marketData?.[etf.symbol]} isLoading={isLoading} className="h-32" linkUrl={etf.linkUrl} />
                    ))}
                </div>
            </section>
        </div>
    );
};

const Header: React.FC = () => (
    <header className="text-center mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-100 mb-2 tracking-tight">台灣股市監控儀表板</h1>
        <p className="text-lg text-gray-400">高效率、低延遲的市場異常偵測。</p>
    </header>
);

const Footer: React.FC = () => (
    <footer className="text-center mt-8 py-4">
        <p className="text-sm text-gray-700">即時市場狀態儀表板。進場機會分析與 Line 通知由雲端服務自動執行。</p>
    </footer>
);

// FIX: Defined prop types in an interface and used React.FC for component clarity and type safety.
interface SignalIconProps {
    indicator: string;
}

const SignalIcon: React.FC<SignalIconProps> = ({ indicator }) => {
    if (indicator.includes("景氣")) return <span aria-label="Economy light icon">💡</span>;
    if (indicator.includes("VIX")) return <span aria-label="Fear gauge icon">😨</span>;
    if (indicator.includes("淨值比")) return <span aria-label="Value scale icon">⚖️</span>;
    if (indicator.includes("利率")) return <span aria-label="Interest rate cycle icon">🔄</span>;
    return <span aria-label="Signal icon">🔔</span>;
};

// FIX: Defined prop types in an interface and used React.FC for component clarity and type safety.
interface SignalCardProps {
    signal: Signal;
}

const SignalCard: React.FC<SignalCardProps> = ({ signal }) => (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 space-y-2">
        <div className="flex items-center space-x-3">
            <div className="text-xl"><SignalIcon indicator={signal.indicator} /></div>
            <div>
                <h4 className="font-bold text-cyan-400">{signal.indicator}</h4>
                <p className="text-sm font-mono text-gray-300">{signal.value}</p>
            </div>
        </div>
        <div>
            <h5 className="font-semibold text-gray-200">{signal.title}</h5>
            <p className="text-sm text-gray-400">{signal.description}</p>
        </div>
        <div className="pt-2">
            <p className="text-xs text-gray-500">適用標的: <span className="font-mono">{signal.applicableTo.join(', ')}</span></p>
        </div>
    </div>
);

// FIX: Defined prop types in an interface and used React.FC for component clarity and type safety.
interface OpportunitiesSectionProps {
    signals: Signal[];
    isLoading: boolean;
}

const OpportunitiesSection: React.FC<OpportunitiesSectionProps> = ({ signals, isLoading }) => {
    if (isLoading) {
        return (
            <section aria-labelledby="opportunities-heading">
                <h2 id="opportunities-heading" className="text-xl font-bold text-gray-200 mb-3">進場機會分析</h2>
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center animate-pulse">
                    <p className="text-gray-500">正在分析市場訊號...</p>
                </div>
            </section>
        );
    }

    if (signals.length === 0) {
        return (
            <section aria-labelledby="opportunities-heading">
                <h2 id="opportunities-heading" className="text-xl font-bold text-gray-200 mb-3">進場機會分析</h2>
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center">
                    <p className="text-gray-400">✅ 目前市場穩定，無明確的長線進場訊號。</p>
                </div>
            </section>
        );
    }
    
    return (
        <section aria-labelledby="opportunities-heading">
            <h2 id="opportunities-heading" className="text-xl font-bold text-gray-200 mb-3">進場機會分析</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {signals.map(signal => <SignalCard key={signal.id} signal={signal} />)}
            </div>
        </section>
    );
};

const WarningIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
);

const Disclaimer: React.FC = () => (
    <div className="bg-amber-900/30 border border-amber-400/50 text-amber-200 p-4 rounded-lg flex items-start space-x-3" role="alert" aria-live="polite">
        <div className="text-amber-400"><WarningIcon /></div>
        <div>
            <h3 className="font-bold">免責聲明</h3>
            <p className="text-sm">本儀表板顯示的資訊僅供參考，不構成任何投資建議。所有數據僅用於模擬和展示目的，不保證即時性與準確性。市場有風險，投資需謹慎。</p>
        </div>
    </div>
);


// --- MAIN APP COMPONENT ---
// FIX: Changed to a named export to resolve the module import error.
export function App() {
    const [statusData, setStatusData] = useState<BotStatus | null>(null);
    const [marketData, setMarketData] = useState<MarketData | null>(null);
    const [signals, setSignals] = useState<Signal[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        try {
            setError(null);
            // Set loading to true only for the first fetch, subsequent fetches will be in the background
            // setIsLoading(true) -> this would show loading skeleton on every poll
            const [status, market, signals] = await Promise.all([
                fetchBotStatus(),
                fetchMarketData(),
                fetchSignals(),
            ]);
            setStatusData(status);
            setMarketData(market);
            setSignals(signals);
        } catch (err) {
            setError("無法從監控服務獲取資料。請稍後再試。");
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5000); // Poll every 5 seconds
        return () => clearInterval(interval);
    }, [fetchData]);

    return (
        <div className="min-h-screen bg-gray-950 font-sans flex flex-col items-center p-4 sm:p-6 lg:p-8">
            <div className="w-full max-w-4xl mx-auto">
                <Header />
                <main className="grid grid-cols-1 gap-8">
                    <Disclaimer />
                    {error && (
                      <div className="bg-red-900/50 border border-red-400 text-red-300 p-4 rounded-lg text-center" role="alert">
                        {error}
                      </div>
                    )}
                    <OpportunitiesSection signals={signals} isLoading={isLoading} />
                    <MarketStatusSection statusData={statusData} marketData={marketData} isLoading={isLoading} />
                </main>
                <Footer />
            </div>
        </div>
    );
}
