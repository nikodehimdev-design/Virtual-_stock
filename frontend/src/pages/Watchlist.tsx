import React, { useState, useEffect } from 'react';
import { Search, Star, Trash2, TrendingUp } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

interface Stock {
  symbol: string;
  name: string;
  basePrice: number;
  change: number;
  intraDayHigh: number;
  intraDayLow: number;
}

// Fix 7: Module-level cache — persists across renders, cleared only on full page refresh
const stockCache = new Map<string, Stock>();

function Watchlist() {
  const [watchlist, setWatchlist] = useState<Stock[]>([]);
  const [searchResults, setSearchResults] = useState<Stock[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [symbolList, setSymbolList] = useState<string[]>([]);
  const navigate = useNavigate();

  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const WatchlistId = user.WatchlistId || null;
  const token = localStorage.getItem('token');

  // Use the same backend URL everywhere
  const API_BASE = import.meta.env.VITE_FLASK_BACKEND_URL || 'http://localhost:5003';

  // ==================== FIXED: Properly unwrap priceInfo from backend ====================
  const transformSingleStock = (data: any, symbol: string): Stock => {
    // Backend returns { priceInfo: {...}, securityInfo: {...}, metadata: {...} }
    // Extract priceInfo first, fallback to flat structure for compatibility
    const priceInfo = data?.priceInfo || data || {};
    const securityInfo = data?.securityInfo || {};

    return {
      symbol: symbol || '',
      name: securityInfo.companyName || priceInfo.companyName || data?.companyName || symbol,
      basePrice: Number(priceInfo.lastPrice || priceInfo.intraDayHighLow?.value || priceInfo.currentPrice || 0),
      change: Number(priceInfo.pChange || priceInfo.change || 0),
      intraDayHigh: Number(priceInfo.intraDayHighLow?.max || 0),
      intraDayLow: Number(priceInfo.intraDayHighLow?.min || 0),
    };
  };

  // Fetch watchlist symbols from your user DB
  const fetchWatchlistSymbols = async (): Promise<string[]> => {
    if (!WatchlistId) {
      setError("No watchlist ID found");
      toast.error("Please login to view your watchlist");
      return [];
    }

    try {
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/stocks/getwatchlist/${WatchlistId}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
        }
      );
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const names = data.watchlist?.Names || [];
      return names;
    } catch (error) {
      console.error("Error fetching watchlist symbols:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to fetch watchlist symbols";
      setError(errorMessage);
      toast.error(errorMessage);
      return [];
    }
  };

  // Fetch stock data for a single symbol — checks module-level cache first (Fix 7)
  const fetchSingleStockData = async (symbol: string): Promise<Stock | null> => {
    if (stockCache.has(symbol)) {
      return stockCache.get(symbol)!;
    }

    try {
      const response = await fetch(
        `${API_BASE}/api/stock-quote/${encodeURIComponent(symbol)}`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (!response.ok) {
        if (response.status === 404) throw new Error(`Stock "${symbol}" not found`);
        throw new Error(`Failed to fetch data for ${symbol}: ${response.status}`);
      }

      const data = await response.json();
      const transformed = transformSingleStock(data, symbol);
      stockCache.set(symbol, transformed); // Store in module-level cache
      return transformed;
    } catch (error) {
      console.error(`Error fetching data for ${symbol}:`, error);
      return null;
    }
  };

  // Fix 7: Fetch all watchlist stocks via single batch request
  const fetchStockData = async (symbols: string[]) => {
    if (symbols.length === 0) {
      setWatchlist([]);
      toast.info('Your watchlist is empty. Add some stocks to get started!');
      return;
    }

    setLoading(true);
    setError(null);

    // Check which symbols are already cached
    const cached: Stock[] = [];
    const missing: string[] = [];
    for (const sym of symbols) {
      if (stockCache.has(sym)) {
        cached.push(stockCache.get(sym)!);
      } else {
        missing.push(sym);
      }
    }

    try {
      let freshStocks: Stock[] = [];

      if (missing.length > 0) {
        // Batch fetch only the uncached symbols
        const response = await fetch(`${API_BASE}/api/stock-quotes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbols: missing }),
        });

        if (!response.ok) throw new Error(`Batch fetch failed: ${response.status}`);

        const batchData = await response.json();
        freshStocks = (batchData.results as any[]).reduce((acc: Stock[], item: any) => {
          if (item.success) {
            const transformed = transformSingleStock(item.data, item.symbol);
            stockCache.set(item.symbol, transformed); // Cache for future renders
            acc.push(transformed);
          } else {
            console.warn(`Batch failed for ${item.symbol}: ${item.error}`);
          }
          return acc;
        }, []);
      }

      const allStocks = [...cached, ...freshStocks];
      setWatchlist(allStocks);

      if (allStocks.length < symbols.length) {
        const failedSymbols = symbols.filter(s => !allStocks.some(st => st.symbol === s));
        const msg = `Failed to load data for: ${failedSymbols.join(', ')}`;
        setError(msg);
        toast.error(msg);
      }
    } catch (error) {
      console.error('Error fetching stock data:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch stock data';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Combined fetch
  const fetchWatchlist = async () => {
    const symbols = await fetchWatchlistSymbols();
    setSymbolList(symbols);
    await fetchStockData(symbols);
  };

  useEffect(() => {
    fetchWatchlist();
    // Optional: Auto-refresh every 30 seconds for live prices
    const interval = setInterval(() => {
      if (symbolList.length > 0) {
        fetchStockData(symbolList);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [WatchlistId]);

  // ==================== FIXED: Search uses same FastAPI backend ====================
  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE}/api/stock-quote/${encodeURIComponent(query)}`,
        {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data = await response.json();
      setSearchResults([transformSingleStock(data, query)]);
    } catch (error) {
      console.error('Error searching stocks:', error);
      setSearchResults([]);
      toast.error("Failed to search stocks. Please try again.");
    }
  };

  const removeFromWatchlist = async (symbol: string) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/stocks/remove`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ id: WatchlistId, stockName: symbol }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to remove from watchlist');
      }

      setSymbolList(prev => prev.filter(s => s !== symbol));
      setWatchlist(prev => prev.filter(stock => stock.symbol !== symbol));
      toast.success(`${symbol} removed from watchlist successfully!`);
    } catch (error) {
      console.error('Error removing stock:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to remove stock';
      setError(errorMessage);
      toast.error(errorMessage);
    }
  };

  const openStockDetails = (symbol: string) => {
    navigate(`/stocks/${symbol}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 text-gray-800 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4">
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2 text-indigo-900">
            <Star className="text-yellow-500" />
            Stock Watchlist
          </h1>

          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search stocks..."
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-gray-800 shadow-sm"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
            />
            {searchResults.length > 0 && (
              <div className="absolute w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
                {searchResults.map((stock) => (
                  <div
                    key={stock.symbol}
                    className="p-3 hover:bg-gray-50 cursor-pointer flex items-center justify-between border-b last:border-b-0 border-gray-100"
                    onClick={() => {
                      openStockDetails(stock.symbol);
                      setSearchResults([]);
                      setSearchQuery('');
                    }}
                  >
                    <div>
                      <div className="font-semibold text-gray-800">{stock.symbol}</div>
                      <div className="text-sm text-gray-500">{stock.name}</div>
                    </div>
                    <div className="text-right">
                      {/* FIXED: ₹ instead of $ for Indian stocks */}
                      <div className="text-gray-800">₹{stock.basePrice.toFixed(2)}</div>
                      <div className={stock.change >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        {symbolList.length > 0 && watchlist.length === 0 && !loading && (
          <div className="mb-4 p-3 bg-blue-100 text-blue-700 rounded-lg">
            Found {symbolList.length} stocks in your watchlist: {symbolList.join(', ')}.
            {error ? ' Error loading details.' : ' Loading stock details...'}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-200">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 md:px-6 py-3 text-left text-gray-600 font-semibold">Company</th>
                  <th className="px-4 md:px-6 py-3 text-right text-gray-600 font-semibold">Price</th>
                  <th className="px-4 md:px-6 py-3 text-right text-gray-600 font-semibold">24h Change</th>
                  <th className="px-4 md:px-6 py-3 text-right text-gray-600 font-semibold">Today's High</th>
                  <th className="px-4 md:px-6 py-3 text-right text-gray-600 font-semibold">Today's Low</th>
                  <th className="px-4 md:px-6 py-3 text-center text-gray-600 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8">
                      <div className="flex justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
                      </div>
                    </td>
                  </tr>
                ) : watchlist.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-gray-500">
                      {error ? 'Failed to load watchlist' : 'Your watchlist is empty. Search for stocks to add them.'}
                    </td>
                  </tr>
                ) : (
                  watchlist.map((stock) => (
                    <tr
                      key={stock.symbol}
                      className="hover:bg-gray-50 transition-colors duration-200"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Link
                          to={`/stocks/${stock.symbol}`}
                          className="text-blue-600 hover:text-blue-900 font-medium"
                        >
                          {stock.symbol}
                        </Link>
                        <div className="text-xs text-gray-500">{stock.name}</div>
                      </td>
                      <td className="px-4 md:px-6 py-3 text-right font-mono text-gray-800 font-semibold">
                        ₹{stock.basePrice.toFixed(2)}
                      </td>
                      <td className={`px-4 md:px-6 py-3 text-right font-semibold ${stock.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}%
                      </td>
                      <td className="px-4 md:px-6 py-3 text-right text-gray-600">₹{stock.intraDayHigh.toFixed(2)}</td>
                      <td className="px-4 md:px-6 py-3 text-right text-gray-600">₹{stock.intraDayLow.toFixed(2)}</td>
                      <td className="px-4 md:px-6 py-3">
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => openStockDetails(stock.symbol)}
                            className="p-1 md:p-2 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="View Details"
                          >
                            <TrendingUp size={18} className="text-indigo-500" />
                          </button>
                          <button
                            onClick={() => removeFromWatchlist(stock.symbol)}
                            className="p-1 md:p-2 hover:bg-red-50 rounded-lg transition-colors"
                            title="Remove from Watchlist"
                          >
                            <Trash2 size={18} className="text-red-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Watchlist;