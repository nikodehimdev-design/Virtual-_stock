import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, Search, Plus, Check } from 'lucide-react';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { getCached, setCached } from '../utils/apiCache';
interface Stock {
  symbol: string;
  name: string;
  basePrice: number;
  change: number;
  lastPrice: number;
}

const StockList = () => {
  const defaultStockSymbols = [
    "IRFC", "IRCTC", "ADANIENT", "TATATECH", "SBIN","AVL",
    "IEX", "VPRPL", "AUBANK", "INFY", "ICICIBANK", "KOTAKBANK", "BAJAJFINSV", "BHARTIARTL",
    "ITC", "WIPRO", "MARUTI", "LT"
  ];

  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Stock[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [addingToWatchlist, setAddingToWatchlist] = useState<string | null>(null);

  // Ref for debouncing search input
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  
  // ==================== FIXED: Extract data from backend's priceInfo wrapper ====================
  const transformStockData = (data: any, symbol: string): Stock => {
    // Backend returns { priceInfo: {...}, securityInfo: {...}, metadata: {...} }
    const priceInfo = data?.priceInfo || data || {};
    const securityInfo = data?.securityInfo || {};

    return {
      symbol: symbol,
      name: securityInfo.companyName || priceInfo.companyName || symbol,
      basePrice: Number(priceInfo.lastPrice || 0),
      change: Number(priceInfo.change || 0),
      lastPrice: Number(priceInfo.lastPrice || 0),
    };
  };
  

  // Fetch all stock data and watchlist
  useEffect(() => {
    const controller = new AbortController();

    const fetchStockData = async () => {
      // Fix 2: Return cached data immediately if still fresh
      const cacheKey = `stocks_${defaultStockSymbols.join('_')}`;
      const cached = getCached<Stock[]>(cacheKey);
      if (cached) {
        setStocks(cached);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        // Fix 1: Single batch request instead of 18 individual fetches
        const response = await fetch(
          `${import.meta.env.VITE_FLASK_BACKEND_URL}/api/stock-quotes`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbols: defaultStockSymbols }),
            signal: controller.signal, // Fix 4: AbortController
          }
        );

        const batchData = await response.json();

        const stockData: Stock[] = batchData.results.map((item: any) => {
          if (item.success) {
            return transformStockData(item.data, item.symbol);
          }
          return { symbol: item.symbol, name: item.symbol, basePrice: 0, change: 0, lastPrice: 0 };
        });

        setStocks(stockData);
        setCached(cacheKey, stockData); // Fix 2: Store in sessionStorage cache

        // Fetch user's watchlist
        const user = JSON.parse(localStorage.getItem('user') || '{}');

        if (user.WatchlistId) {
          const watchlistResponse = await fetch(
            `${import.meta.env.VITE_BACKEND_URL}/stocks/getwatchlist/${user.WatchlistId}`,
            {
              headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
              signal: controller.signal,
            }
          );

          if (watchlistResponse.ok) {
            const watchlistData = await watchlistResponse.json();

            if (watchlistData && typeof watchlistData === 'object') {
              if (Array.isArray(watchlistData)) {
                setWatchlist(watchlistData.map((item: any) => item.symbol || item.stockName));
              } else if (watchlistData.watchlist && Array.isArray(watchlistData.watchlist)) {
                setWatchlist(watchlistData.watchlist.map((item: any) => item.symbol || item.stockName));
              } else if (watchlistData.stocks && Array.isArray(watchlistData.stocks)) {
                setWatchlist(watchlistData.stocks.map((item: any) => item.symbol || item.stockName));
              } else if (watchlistData.symbols && Array.isArray(watchlistData.symbols)) {
                setWatchlist(watchlistData.symbols);
              } else if (watchlistData.Names && Array.isArray(watchlistData.Names)) {
                setWatchlist(watchlistData.Names);
              } else {
                setWatchlist([]);
              }
            } else {
              setWatchlist([]);
            }
          } else {
            setWatchlist([]);
          }
        }
      } catch (error: any) {
        if (error?.name === 'AbortError') return; // Fix 4: Ignore cancelled requests
        console.error('Error fetching data:', error);
        toast.error('Error loading stock data');
      } finally {
        setLoading(false);
      }
    };

    fetchStockData();

    // Fix 4: Cancel in-flight requests when component unmounts
    return () => controller.abort();
  }, []);

  // Handle search (called after debounce)
  const handleSearch = async (term?: string) => {
    const query = (term ?? searchTerm).trim();
    if (!query) {
      setIsSearching(false);
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_FLASK_BACKEND_URL}/api/stock-quote/${query}`
      );
      const data = await response.json();

      if (response.ok) {
        setSearchResults([transformStockData(data, query.toUpperCase())]);
      } else {
        setSearchResults([]);
        toast.error('Stock not found');
      }
    } catch (error) {
      console.error('Error searching stock:', error);
      toast.error('Error searching stock');
    }
    setIsSearching(false);
  };

  // Fix 6: Debounce search — only fires 500ms after the user stops typing
  const handleSearchInput = (value: string) => {
    setSearchTerm(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!value.trim()) {
      setIsSearching(false);
      setSearchResults([]);
      return;
    }
    searchTimeoutRef.current = setTimeout(() => {
      if (value.trim().length >= 2) handleSearch(value.trim());
    }, 500);
  };

  // Add to watchlist
  const addToWatchlist = async (symbol: string) => {
    if (watchlist.includes(symbol)) {
      toast.info(`${symbol} is already in your watchlist`);
      return;
    }

    setAddingToWatchlist(symbol);
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      const watchlistId = user.WatchlistId;
  
      if (!watchlistId) {
        toast.error("Please login to add stocks to your watchlist");
        setAddingToWatchlist(null);
        return;
      }
  
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/stocks/addwatchlist`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem("token")}`
          },
          body: JSON.stringify({ 
            WatchlistId: watchlistId,
            stockName: symbol
          }),
        }
      );

      let data;
      try {
        data = await response.json();
      } catch (e) {
        data = { message: "Error processing response" };
      }
  
      if (response.ok) {
        setWatchlist(prev => [...prev, symbol]);
        toast.success(`${symbol} added to watchlist successfully!`);
      } else if (response.status === 409 || data.msg?.includes("Stock already in watchlist")) {
        toast.info(`${symbol} is already in your watchlist`);
      } else {
        toast.error(data.message || "Failed to add to watchlist");
      }
    } catch (error) {
      console.error("Error adding to watchlist:", error);
      toast.error("Error adding to watchlist. Please try again.");
    } finally {
      setAddingToWatchlist(null);
    }
  };

  const displayStocks = isSearching || searchTerm ? searchResults : stocks;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Stock Market</h1>
        <p className="text-gray-600 mt-2">Live prices and market data</p>
        
        <div className="mt-6 relative max-w-md">
          <div className="flex">
            <input
              type="text"
              placeholder="Search stocks (e.g., IRFC, SBIN)"
              className="w-full px-4 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={searchTerm}
              onChange={(e) => handleSearchInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button
              onClick={() => handleSearch()}
              className="bg-blue-600 text-white px-4 py-2 rounded-r-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center"
            >
              <Search className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-500">Loading stock data...</div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Symbol
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Price
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Change
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {displayStocks.length > 0 ? (
                  displayStocks.map((stock) => (
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
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-900">
                        {stock.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right font-mono font-semibold text-gray-900">
                        ₹{stock.basePrice.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end">
                          {stock.change >= 0 ? (
                            <TrendingUp className="h-4 w-4 text-green-600 mr-1" />
                          ) : (
                            <TrendingDown className="h-4 w-4 text-red-600 mr-1" />
                          )}
                          <span
                            className={
                              stock.change >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'
                            }
                          >
                            {stock.change >= 0 ? '+' : ''}₹{stock.change.toFixed(2)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            addToWatchlist(stock.symbol);
                          }}
                          disabled={watchlist.includes(stock.symbol) || addingToWatchlist === stock.symbol}
                          className={`p-2 rounded-full ${
                            watchlist.includes(stock.symbol)
                              ? 'bg-green-100 text-green-600 cursor-not-allowed'
                              : addingToWatchlist === stock.symbol
                              ? 'bg-gray-100 text-gray-600 cursor-not-allowed'
                              : 'bg-blue-100 text-blue-600 hover:bg-blue-200 cursor-pointer'
                          }`}
                          title={
                            watchlist.includes(stock.symbol)
                              ? "Already in watchlist"
                              : addingToWatchlist === stock.symbol
                              ? "Adding to watchlist..."
                              : "Add to watchlist"
                          }
                        >
                          {watchlist.includes(stock.symbol) ? (
                            <Check className="h-4 w-4" />
                          ) : addingToWatchlist === stock.symbol ? (
                            <div className="h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                      No stocks found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockList;