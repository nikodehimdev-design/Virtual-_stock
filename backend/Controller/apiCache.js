const CACHE_KEY = 'stock_cache';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export const getCached = (key) => {
    try {
        const all = JSON.parse(sessionStorage.getItem(CACHE_KEY) || '{}');
        const entry = all[key];
        if (entry && Date.now() - entry.ts < CACHE_TTL_MS) {
            return entry.data;
        }
        return null;
    } catch {
        return null;
    }
};

export const setCached = (key, data) => {
    try {
        const all = JSON.parse(sessionStorage.getItem(CACHE_KEY) || '{}');
        all[key] = { data, ts: Date.now() };
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(all));
    } catch {}
};

export const clearCache = () => {
    sessionStorage.removeItem(CACHE_KEY);
};