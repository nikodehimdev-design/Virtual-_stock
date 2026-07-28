/**
 * Simple sessionStorage-backed cache with a 5-minute TTL.
 * Prevents redundant API calls when the user reloads the page.
 */

const CACHE_KEY = 'stock_cache';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  data: T;
  ts: number;
}

export const getCached = <T = unknown>(key: string): T | null => {
  try {
    const all = JSON.parse(sessionStorage.getItem(CACHE_KEY) || '{}');
    const entry: CacheEntry<T> | undefined = all[key];
    if (entry && Date.now() - entry.ts < CACHE_TTL_MS) {
      return entry.data;
    }
    return null;
  } catch {
    return null;
  }
};

export const setCached = <T = unknown>(key: string, data: T): void => {
  try {
    const all = JSON.parse(sessionStorage.getItem(CACHE_KEY) || '{}');
    all[key] = { data, ts: Date.now() } satisfies CacheEntry<T>;
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch {
    // Silently ignore storage errors (e.g. private browsing quota exceeded)
  }
};

export const clearCache = (): void => {
  sessionStorage.removeItem(CACHE_KEY);
};
