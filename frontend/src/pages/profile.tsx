import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, BadgeCheck, Briefcase, DollarSign, Eye, Sparkles, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuthStore } from '../store/authStore';

interface HoldingDisplay {
  symbol: string;
  name: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  totalValue: number;
  profitLoss: number;
  profitPercent: number;
  change: number;
  changePercent: number;
}

interface WatchlistDisplay {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
}

const getStringValue = (source: Record<string, unknown> | null, keys: string[]) => {
  if (!source) return '';

  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number') return String(value);
  }

  return '';
};

const getNumberValue = (source: Record<string, unknown> | null, keys: string[]) => {
  if (!source) return 0;

  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }

  return 0;
};

const ProfilePage = () => {
  const { user } = useAuthStore();
  const [holdings, setHoldings] = useState<HoldingDisplay[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentUser = user || JSON.parse(localStorage.getItem('user') || 'null');
  const normalizedUser = useMemo(() => {
    if (!currentUser) return null;

    const userRecord = currentUser as Record<string, unknown>;
    return {
      ...userRecord,
      Balance: getNumberValue(userRecord, ['Balance', 'balance', 'cashBalance', 'accountBalance', 'availableBalance']),
      HoldingId: getStringValue(userRecord, ['HoldingId', 'holdingId']),
      WatchlistId: getStringValue(userRecord, ['WatchlistId', 'watchlistId']),
    };
  }, [currentUser]);

  const displayName = getStringValue(normalizedUser as Record<string, unknown> | null, ['name', 'Name', 'username']);
  const displayEmail = getStringValue(normalizedUser as Record<string, unknown> | null, ['email', 'Email']) || 'No email available';
  const token = localStorage.getItem('token');
  const backendBase = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
  const flaskBase = import.meta.env.VITE_FLASK_BACKEND_URL || 'http://localhost:5003';

  useEffect(() => {
    const fetchProfileData = async () => {
      const holdingId = getStringValue(normalizedUser as Record<string, unknown> | null, ['HoldingId', 'holdingId']);
      const watchlistId = getStringValue(normalizedUser as Record<string, unknown> | null, ['WatchlistId', 'watchlistId']);

      if (!holdingId && !watchlistId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        if (holdingId) {
          const holdingsResponse = await axios.get(`${backendBase}/holding/getholding/${holdingId}`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          const holdingsData = holdingsResponse.data.holdings || [];
          const holdingsWithPrices = await Promise.all(
            holdingsData.map(async (holding: Record<string, unknown>) => {
              const symbol = getStringValue(holding, ['symbol', 'Symbol', 'Ticker']).toUpperCase();
              const name = getStringValue(holding, ['name', 'Name']) || symbol;
              const quantity = getNumberValue(holding, ['quantity', 'Quantity']);
              const avgPrice = getNumberValue(holding, ['price', 'Price']);

              try {
                const quoteResponse = await axios.get(`${flaskBase}/api/stock-quote/${encodeURIComponent(symbol)}`, {
                  headers: {
                    Authorization: `Bearer ${token}`,
                  },
                });
                const quote = quoteResponse.data;
                const currentPrice = Number(quote?.intraDayHighLow?.value ?? quote?.lastPrice ?? avgPrice ?? 0);
                const change = Number(quote?.change ?? 0);
                const changePercent = Number(quote?.changePercent ?? quote?.pChange ?? 0);
                const totalValue = currentPrice * quantity;
                const profitLoss = (currentPrice - avgPrice) * quantity;
                const profitPercent = avgPrice > 0 ? (profitLoss / (avgPrice * quantity)) * 100 : 0;

                return {
                  symbol,
                  name,
                  quantity,
                  avgPrice,
                  currentPrice,
                  totalValue,
                  profitLoss,
                  profitPercent,
                  change,
                  changePercent,
                };
              } catch {
                return {
                  symbol,
                  name,
                  quantity,
                  avgPrice,
                  currentPrice: avgPrice,
                  totalValue: avgPrice * quantity,
                  profitLoss: 0,
                  profitPercent: 0,
                  change: 0,
                  changePercent: 0,
                };
              }
            })
          );

          setHoldings(holdingsWithPrices.filter(Boolean));
        }

        if (watchlistId) {
          const watchlistResponse = await axios.get(`${backendBase}/stocks/getwatchlist/${watchlistId}`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          const symbols = watchlistResponse.data.watchlist?.Names || [];
          const watchlistWithPrices = await Promise.all(
            symbols.slice(0, 5).map(async (symbol: string) => {
              const stockSymbol = String(symbol || '').toUpperCase();
              try {
                const quoteResponse = await axios.get(`${flaskBase}/api/stock-quote/${encodeURIComponent(stockSymbol)}`, {
                  headers: {
                    Authorization: `Bearer ${token}`,
                  },
                });
                const quote = quoteResponse.data;
                return {
                  symbol: stockSymbol,
                  name: stockSymbol,
                  price: Number(quote?.intraDayHighLow?.value ?? quote?.lastPrice ?? 0),
                  change: Number(quote?.change ?? 0),
                  changePercent: Number(quote?.changePercent ?? quote?.pChange ?? 0),
                };
              } catch {
                return null;
              }
            })
          );

          setWatchlist(watchlistWithPrices.filter(Boolean) as WatchlistDisplay[]);
        }
      } catch (err) {
        console.error(err);
        setError('Unable to load your portfolio details right now.');
      } finally {
        setLoading(false);
      }
    };

    fetchProfileData();
  }, [backendBase, flaskBase, normalizedUser, token]);

  const summary = useMemo(() => {
    const totalHoldingsValue = holdings.reduce((sum, holding) => sum + holding.totalValue, 0);
    const totalProfitLoss = holdings.reduce((sum, holding) => sum + holding.profitLoss, 0);
    const totalCost = holdings.reduce((sum, holding) => sum + holding.avgPrice * holding.quantity, 0);
    const balance = getNumberValue(normalizedUser as Record<string, unknown> | null, ['Balance', 'balance', 'cashBalance', 'accountBalance', 'availableBalance']);
    const netWorth = balance + totalHoldingsValue;
    const profitPercent = totalCost > 0 ? (totalProfitLoss / totalCost) * 100 : 0;

    return {
      balance,
      totalHoldingsValue,
      totalProfitLoss,
      netWorth,
      profitPercent,
    };
  }, [holdings, normalizedUser]);

  if (!normalizedUser) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-10 text-slate-700">
        <div className="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold">Your profile</h1>
          <p className="mt-3 text-slate-600">Sign in to view your portfolio profile and account details.</p>
          <Link to="/login" className="mt-6 inline-flex items-center rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Go to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 text-slate-700 md:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-[28px] bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-500 p-8 text-white shadow-xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center rounded-full bg-white/20 px-3 py-1 text-sm font-medium backdrop-blur">
                <Sparkles size={16} className="mr-2" /> Portfolio profile
              </div>
              <h1 className="text-3xl font-semibold">Welcome back, {displayName}.</h1>
              <p className="mt-3 max-w-2xl text-sm text-blue-50">
                Track your account details, holdings, watchlist, and live performance in one place.
              </p>
            </div>
            <div className="rounded-2xl border border-white/20 bg-white/10 px-5 py-4 backdrop-blur">
              <div className="flex items-center gap-2 text-sm text-blue-50">
                <BadgeCheck size={16} /> Verified account
              </div>
              <p className="mt-2 text-xl font-semibold">{displayEmail}</p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">Available balance</p>
              <Wallet size={18} className="text-blue-500" />
            </div>
            <p className="mt-4 text-2xl font-semibold text-slate-900">${summary.balance.toFixed(2)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">Current P/L</p>
              <DollarSign size={18} className={summary.totalProfitLoss >= 0 ? 'text-emerald-500' : 'text-rose-500'} />
            </div>
            <p className={`mt-4 text-2xl font-semibold ${summary.totalProfitLoss >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {summary.totalProfitLoss >= 0 ? '+' : ''}${summary.totalProfitLoss.toFixed(2)}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">Net worth</p>
              <Briefcase size={18} className="text-violet-500" />
            </div>
            <p className="mt-4 text-2xl font-semibold text-slate-900">${summary.netWorth.toFixed(2)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">Portfolio return</p>
              <Eye size={18} className="text-amber-500" />
            </div>
            <p className={`mt-4 text-2xl font-semibold ${summary.profitPercent >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {summary.profitPercent >= 0 ? '+' : ''}{summary.profitPercent.toFixed(1)}%
            </p>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-900">Account details</h2>
              <div className="rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700">Registered profile</div>
            </div>
            <div className="mt-6 space-y-4">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Full name</p>
                <p className="mt-1 text-lg font-medium text-slate-900">{displayName || 'Not provided'}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Email address</p>
                <p className="mt-1 text-lg font-medium text-slate-900">{displayEmail || 'Not provided'}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Account balance</p>
                <p className="mt-1 text-lg font-medium text-slate-900">${summary.balance.toFixed(2)}</p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-900">Portfolio snapshot</h2>
              <div className="rounded-full bg-emerald-50 px-3 py-1 text-sm text-emerald-700">Live view</div>
            </div>
            <div className="mt-6 space-y-4">
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-500">Holdings value</p>
                  <p className="text-lg font-semibold text-slate-900">${summary.totalHoldingsValue.toFixed(2)}</p>
                </div>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-500">Open positions</p>
                  <p className="text-lg font-semibold text-slate-900">{holdings.length}</p>
                </div>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-500">Watchlist items</p>
                  <p className="text-lg font-semibold text-slate-900">{watchlist.length}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-900">Holdings</h2>
              <Link to="/holding" className="text-sm font-medium text-blue-600 hover:text-blue-700">View all</Link>
            </div>

            {loading ? (
              <div className="mt-6 rounded-2xl bg-slate-50 p-6 text-sm text-slate-500">Loading your holdings…</div>
            ) : error ? (
              <div className="mt-6 rounded-2xl bg-rose-50 p-6 text-sm text-rose-700">{error}</div>
            ) : holdings.length === 0 ? (
              <div className="mt-6 rounded-2xl bg-slate-50 p-6 text-sm text-slate-500">No holdings yet. Start building your portfolio.</div>
            ) : (
              <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-slate-600">Symbol</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600">Qty</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600">Value</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600">P/L</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {holdings.map((holding) => (
                      <tr key={holding.symbol} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{holding.symbol}</div>
                          <div className="text-xs text-slate-500">{holding.name}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{holding.quantity}</td>
                        <td className="px-4 py-3 text-slate-700">${holding.totalValue.toFixed(2)}</td>
                        <td className={`px-4 py-3 font-medium ${holding.profitLoss >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {holding.profitLoss >= 0 ? '+' : ''}${holding.profitLoss.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-900">Watchlist</h2>
              <Link to="/watchlist" className="text-sm font-medium text-blue-600 hover:text-blue-700">View all</Link>
            </div>

            {loading ? (
              <div className="mt-6 rounded-2xl bg-slate-50 p-6 text-sm text-slate-500">Loading watchlist…</div>
            ) : watchlist.length === 0 ? (
              <div className="mt-6 rounded-2xl bg-slate-50 p-6 text-sm text-slate-500">Your watchlist is empty.</div>
            ) : (
              <div className="mt-6 space-y-3">
                {watchlist.map((item) => (
                  <div key={item.symbol} className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
                    <div>
                      <p className="font-medium text-slate-900">{item.symbol}</p>
                      <p className="text-xs text-slate-500">{item.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-slate-900">${item.price.toFixed(2)}</p>
                      <p className={`text-sm ${item.changePercent >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {item.changePercent >= 0 ? <ArrowUpRight size={14} className="mr-1 inline" /> : <ArrowDownRight size={14} className="mr-1 inline" />}
                        {Math.abs(item.changePercent).toFixed(1)}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default ProfilePage;
