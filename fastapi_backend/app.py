from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, field_validator
from pymongo import MongoClient
from bson import ObjectId
from cachetools import TTLCache
from typing import Optional, List, Dict, Any, Set, Tuple
import pandas as pd
import asyncio
import threading
import time
import json
import os
import logging
import uuid
from dotenv import load_dotenv
import csv
import requests
from datetime import datetime
import feedparser
from io import StringIO

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Initialize FastAPI app
app = FastAPI(title="Indian Stock API", description="API for Indian stock data and trading via IndianAPI.in")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== INDIAN API CLIENT ====================
import requests
from typing import Optional, Dict, Any

class IndianAPIClient:
    def __init__(self, api_key: str, base_url: str = "https://stock.indianapi.in"):
        self.api_key = api_key
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()
        self.session.headers.update({"x-api-key": api_key})
        self.session.timeout = 10

    def _get(self, path: str, params: dict = None) -> Any:
        url = f"{self.base_url}{path}"
        resp = self.session.get(url, params=params)
        resp.raise_for_status()
        return resp.json()

    def _safe_float(self, value, default: float = 0.0) -> float:
        if value is None:
            return default
        try:
            return float(value)
        except (ValueError, TypeError):
            return default

    def stock_by_name(self, name: str) -> dict:
        """
        Fetch stock data by name. Handles cases where API returns a list.
        """
        raw = self._get("/stock", params={"name": name})
        
        # DEBUG: Log what the API actually returns
        logger.info(f"IndianAPI.in raw response for '{name}': type={type(raw).__name__}")
        
        # If API returns a list, extract first element or raise
        if isinstance(raw, list):
            if len(raw) == 0:
                raise ValueError(f"No data found for stock: {name}")
            # If list contains dicts, take first
            if isinstance(raw[0], dict):
                raw = raw[0]
            else:
                raise ValueError(f"Unexpected list response for {name}: {raw}")
        
        # If it's not a dict after extraction, something is wrong
        if not isinstance(raw, dict):
            raise ValueError(f"Unexpected response type for {name}: {type(raw).__name__}")
        
        return raw

    def trending(self) -> dict:
        raw = self._get("/trending")
        return raw if isinstance(raw, dict) else {}

    def historical_data(self, stock_name: str, period: str = "5yr", filter_type: str = "price") -> dict:
        raw = self._get("/historical_data", params={
            "stock_name": stock_name,
            "period": period,
            "filter": filter_type
        })
        return raw if isinstance(raw, dict) else {}

    def map_to_nse_format(self, data: dict) -> dict:
        """
        Map IndianAPI.in /stock response to the nse-like format.
        """
        symbol = data.get("tickerId", "") or data.get("companyName", "Unknown")

        # Handle currentPrice safely (can be null or missing)
        current_price_raw = data.get("currentPrice")
        current_price = current_price_raw if isinstance(current_price_raw, dict) else {}
        
        nse_price = self._safe_float(current_price.get("NSE"))
        bse_price = self._safe_float(current_price.get("BSE"))
        last_price = nse_price or bse_price or 0.0

        # Handle percentChange safely
        p_change = self._safe_float(data.get("percentChange"), 0.0)

        # Calculate previous close and change
        if p_change and last_price:
            previous_close = round(last_price / (1 + p_change / 100), 2)
            change = round(last_price - previous_close, 2)
        else:
            previous_close = last_price
            change = 0.0

        # Technical data (can be null)
        tech_raw = data.get("stockTechnicalData")
        tech = tech_raw if isinstance(tech_raw, dict) else {}

        day_high = self._safe_float(
            tech.get("dayHigh") or tech.get("intraDayHigh") or data.get("yearHigh")
        ) or last_price
        day_low = self._safe_float(
            tech.get("dayLow") or tech.get("intraDayLow") or data.get("yearLow")
        ) or last_price

        year_high = self._safe_float(data.get("yearHigh"), last_price)
        year_low = self._safe_float(data.get("yearLow"), last_price)

        key_metrics_raw = data.get("keyMetrics")
        key_metrics = key_metrics_raw if isinstance(key_metrics_raw, dict) else {}
        
        initial_fin_raw = data.get("initialStockFinancialData")
        initial_fin = initial_fin_raw if isinstance(initial_fin_raw, dict) else {}

        return {
            "priceInfo": {
                "lastPrice": last_price,
                "companyName": data.get("companyName", symbol),
                "open": self._safe_float(initial_fin.get("open"), previous_close),
                "close": self._safe_float(initial_fin.get("close"), last_price),
                "previousClose": previous_close,
                "change": change,
                "pChange": p_change,
                "vwap": self._safe_float(key_metrics.get("VWAP") or key_metrics.get("vwap"), 0),
                "intraDayHighLow": {
                    "max": day_high,
                    "min": day_low,
                    "value": last_price
                },
                "weekHighLow": {
                    "max": year_high,
                    "min": year_low,
                    "maxDate": "",
                    "minDate": ""
                },
                "upperCP": self._safe_float(tech.get("upperCircuit"), 0),
                "lowerCP": self._safe_float(tech.get("lowerCircuit"), 0),
                "basePrice": previous_close,
                "pPriceBand": tech.get("priceBand") or "No Band"
            },
            "securityInfo": {
                "symbol": data.get("tickerId", ""),
                "companyName": data.get("companyName", ""),
                "tickSize": 0.05,
                "index": ""
            },
            "metadata": {
                "market": "Capital Market",
                "advances": 0,
                "declines": 0,
                "unchanged": 0,
                "iNavValue": 0,
                "stockIndClosePrice": previous_close,
                "checkINAV": False
            }
        }
# Initialize IndianAPI client
INDIAN_API_KEY = os.getenv("INDIAN_API_KEY")
if not INDIAN_API_KEY:
    logger.warning("⚠️ INDIAN_API_KEY not found in environment variables!")

indian_client = IndianAPIClient(api_key=INDIAN_API_KEY or "")

# ==================== BATCH STOCK QUOTES ENDPOINT ====================

@app.post("/api/stock-quotes")
async def api_stock_quotes_batch(request: Request):
    """
    Fetch multiple stock quotes in ONE request.
    Body: {"symbols": ["IRFC", "IRCTC", "SBIN", ...]}
    """
    try:
        body = await request.json()
        symbols = body.get("symbols", [])

        if not symbols or len(symbols) > 50:
            raise HTTPException(status_code=400, detail="Provide 1-50 symbols")

        results = []
        for symbol in symbols:
            try:
                raw = await asyncio.to_thread(indian_client.stock_by_name, symbol)
                mapped = indian_client.map_to_nse_format(raw)
                results.append({
                    "symbol": symbol,
                    "success": True,
                    "data": mapped
                })
            except Exception as e:
                results.append({
                    "symbol": symbol,
                    "success": False,
                    "error": str(e)
                })

        return {"results": results, "count": len(results)}

    except Exception as e:
        logger.error(f"Batch quote error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Optional NewsAPI import
try:
    from newsapi.newsapi_client import NewsApiClient
    NEWSAPI_AVAILABLE = True
except ImportError:
    print("NewsAPI not available. Install with: pip install newsapi-python")
    NEWSAPI_AVAILABLE = False
    NewsApiClient = None


# MongoDB connection
mongo_uri = os.getenv("MONGO_URI")
client = MongoClient(mongo_uri)
db = client['growup_database']
orders_collection = db['orders']
users = db['users']
exchanges = db['exchanges']
holdings = db['holdings']

# Create indexes for faster queries
orders_collection.create_index([('status', 1)])
orders_collection.create_index([('symbol', 1)])
orders_collection.create_index([('created_at', -1)])

# WebSocket variables
active_connections: Set[WebSocket] = set()
symbol_subscribers: Dict[str, Set[WebSocket]] = {}
price_cache = TTLCache(maxsize=100, ttl=5)  # Cache for 5 seconds

# Track market status
market_open = False


# ==================== HELPER FUNCTIONS ====================

def fetch_holdings_from_db(holding_id: str) -> Optional[pd.DataFrame]:
    """Fetch holdings from MongoDB based on holding ID."""
    try:
        holding = holdings.find_one({"HoldingId": holding_id})
        
        if holding and "Holdings" in holding:
            simplified_data = []
            for item in holding["Holdings"]:
                symbol = item.get("symbol") or item.get("Symbol") or item.get("Ticker")
                quantity = item.get("quantity") or item.get("Quantity") or 0
                if symbol:
                    simplified_data.append({"Ticker": symbol, "quantity": quantity})
            
            df = pd.DataFrame(simplified_data)
            logger.info(f"✅ Holdings for ID: {holding_id}")
            logger.info(f"Found {len(df)} holdings")
            return df
        else:
            logger.warning(f"❌ No holding found with HoldingId = {holding_id}")
            return None
            
    except Exception as e:
        logger.error(f"Error fetching holdings from database: {str(e)}")
        return None


def load_portfolio_from_dataframe(df: pd.DataFrame) -> List[Tuple[str, float]]:
    """Load portfolio data from dataframe format."""
    try:
        portfolio = []
        ticker_col = 'Ticker'
        quantity_col = 'quantity'
        
        if ticker_col not in df.columns or quantity_col not in df.columns:
            logger.error(f"Required columns not found. Expected: {ticker_col}, {quantity_col}")
            return []
        
        for _, row in df.iterrows():
            ticker = str(row[ticker_col]).strip()
            try:
                quantity = float(row[quantity_col])
            except (ValueError, TypeError):
                quantity = 0.0
            
            portfolio.append((ticker, quantity))
        
        return portfolio
        
    except Exception as e:
        logger.error(f"Error loading portfolio from dataframe: {str(e)}")
        return []


def check_market_status() -> bool:
    """
    Check if Indian equity market is open.
    IndianAPI.in does not provide a market status endpoint, so we use IST time rules:
    Mon-Fri, 9:15 AM - 3:30 PM IST.
    """
    try:
        ist_now = datetime.utcnow()  # Simplified; production should use pytz Asia/Kolkata
        # Quick approximate check (proper implementation should use pytz)
        weekday = ist_now.weekday()
        if weekday >= 5:  # Saturday=5, Sunday=6
            return False
        
        # For exact check you'd convert UTC to IST (+5:30)
        # Here we return True to allow testing; replace with proper tz logic
        return True
    except Exception as e:
        logger.error(f"Error checking market status: {e}")
        return False


def serialize_doc(doc):
    """Convert MongoDB document to JSON serializable format"""
    if not doc:
        return doc
    doc_copy = doc.copy()
    for key, value in doc_copy.items():
        if isinstance(value, ObjectId):
            doc_copy[key] = str(value)
        elif isinstance(value, datetime):
            doc_copy[key] = value.isoformat()
    return doc_copy


# ==================== AGENTS (REFACTORED) ====================

class NSEStockAgent:
    """Agent to fetch real-time NSE stock data using IndianAPI.in."""
    
    def __init__(self, api_client: IndianAPIClient):
        self.client = api_client
    
    def fetch_data(self, tickers: List[Tuple[str, float]]) -> List[Dict]:
        """Fetch real-time stock data for given tickers."""
        data = []
        
        for ticker, quantity in tickers:
            try:
                stock_data = self._fetch_from_api(ticker, quantity)
                if stock_data:
                    data.append(stock_data)
                else:
                    data.append({
                        'ticker': ticker,
                        'quantity': quantity,
                        'lastPrice': 0,
                        'change': 0,
                        'pChange': 0,
                        'error': 'Unable to fetch data from IndianAPI.in'
                    })
                        
            except Exception as e:
                logger.error(f"Error fetching data for {ticker}: {str(e)}")
                data.append({
                    'ticker': ticker,
                    'quantity': quantity,
                    'lastPrice': 0,
                    'change': 0,
                    'pChange': 0,
                    'error': str(e)
                })
        
        return data
    
    def _fetch_from_api(self, ticker: str, quantity: float) -> Optional[Dict]:
        """Fetch data from IndianAPI.in and flatten to legacy format."""
        try:
            raw = self.client.stock_by_name(ticker)
            mapped = self.client.map_to_nse_format(raw)
            api_data = mapped['priceInfo']
            
            return {
                'ticker': ticker,
                'quantity': quantity,
                'lastPrice': api_data.get('lastPrice', 0),
                'change': api_data.get('change', 0),
                'pChange': api_data.get('pChange', 0),
                'previousClose': api_data.get('previousClose', 0),
                'open': api_data.get('open', 0),
                'close': api_data.get('close', 0),
                'vwap': api_data.get('vwap', 0),
                'lowerCP': api_data.get('lowerCP', 'N/A'),
                'upperCP': api_data.get('upperCP', 'N/A'),
                'basePrice': api_data.get('basePrice', 0),
                'intraDayHigh': api_data.get('intraDayHighLow', {}).get('max', 0),
                'intraDayLow': api_data.get('intraDayHighLow', {}).get('min', 0),
                'intraDayValue': api_data.get('intraDayHighLow', {}).get('value', 0),
                'weekHigh': api_data.get('weekHighLow', {}).get('max', 0),
                'weekLow': api_data.get('weekHighLow', {}).get('min', 0),
                'weekHighDate': api_data.get('weekHighLow', {}).get('maxDate', 'N/A'),
                'weekLowDate': api_data.get('weekHighLow', {}).get('minDate', 'N/A'),
                'priceBand': api_data.get('pPriceBand', 'N/A'),
                'tickSize': api_data.get('tickSize', 0),
                'timestamp': int(time.time() * 1000)
            }
            
        except requests.RequestException as e:
            logger.warning(f"IndianAPI.in request failed for {ticker}: {str(e)}")
            return None
        except (KeyError, ValueError) as e:
            logger.warning(f"IndianAPI.in response parsing failed for {ticker}: {str(e)}")
            return None


class NSENewsAgent:
    """Agent to fetch real-time news using various sources."""
    
    def __init__(self, news_api_key: str = None):
        self.news_api_key = news_api_key
        self.newsapi = None
        if NEWSAPI_AVAILABLE and news_api_key:
            try:
                self.newsapi = NewsApiClient(api_key=news_api_key)
            except Exception as e:
                logger.warning(f"Failed to initialize NewsAPI: {str(e)}")
        self.session = requests.Session()
        self.session.timeout = 10
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
    
    def fetch_news(self, tickers: List[Tuple[str, float]]) -> Dict[str, List[str]]:
        """Fetch real-time news for given tickers."""
        news_data = {}
        
        for ticker, quantity in tickers:
            try:
                news_items = []
                
                if self.newsapi:
                    news_items.extend(self._fetch_from_newsapi(ticker))
                
                news_items.extend(self._fetch_from_indian_rss(ticker))
                news_items.extend(self._fetch_from_google_news(ticker))
                
                unique_news = list(dict.fromkeys(news_items))[:5]
                news_data[ticker] = unique_news if unique_news else [f"No recent news found for {ticker}"]
                
            except Exception as e:
                logger.error(f"Error fetching news for {ticker}: {str(e)}")
                news_data[ticker] = [f"Error fetching news for {ticker}: {str(e)}"]
        
        return news_data
    
    def _fetch_from_newsapi(self, ticker: str) -> List[str]:
        if not self.newsapi:
            return []
        try:
            articles = self.newsapi.get_everything(
                q=f"{ticker} NSE India stock",
                language='en',
                sort_by='publishedAt',
                page_size=3
            )
            return [
                f"{article['title']} - {article['source']['name']} ({article['publishedAt'][:10]})"
                for article in articles['articles']
            ]
        except Exception as e:
            logger.warning(f"NewsAPI request failed for {ticker}: {str(e)}")
            return []
    
    def _fetch_from_indian_rss(self, ticker: str) -> List[str]:
        try:
            rss_url = "https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms"
            feed = feedparser.parse(rss_url)
            relevant_news = []
            for entry in feed.entries[:10]:
                if ticker.lower() in entry.title.lower() or ticker.lower() in entry.summary.lower():
                    relevant_news.append(f"{entry.title} - Economic Times ({entry.published[:10]})")
            return relevant_news[:3]
        except Exception as e:
            logger.warning(f"Indian RSS feed request failed for {ticker}: {str(e)}")
            return []
    
    def _fetch_from_google_news(self, ticker: str) -> List[str]:
        try:
            rss_url = f"https://news.google.com/rss/search?q={ticker}+NSE+India+stock&hl=en-IN&gl=IN&ceid=IN:en"
            feed = feedparser.parse(rss_url)
            return [
                f"{entry.title} - {entry.published[:10]}"
                for entry in feed.entries[:3]
            ]
        except Exception as e:
            logger.warning(f"Google News request failed for {ticker}: {str(e)}")
            return []


class NSEWebAgent:
    """Agent to fetch company information using IndianAPI.in."""
    
    def __init__(self, api_client: IndianAPIClient):
        self.client = api_client
    
    def fetch_info(self, tickers: List[Tuple[str, float]]) -> Dict[str, str]:
        info = {}
        for ticker, quantity in tickers:
            try:
                raw = self.client.stock_by_name(ticker)
                company_name = raw.get("companyName", ticker)
                industry = raw.get("industry", "N/A")
                profile = raw.get("companyProfile", {})
                about = profile.get("about") or profile.get("description", "")
                
                info[ticker] = (
                    f"{company_name} ({ticker}) operates in the {industry} sector. "
                    f"{about[:200] if about else 'Listed on NSE/BSE India.'}"
                )
            except Exception as e:
                logger.error(f"Error fetching web info for {ticker}: {str(e)}")
                info[ticker] = f"Unable to fetch web information for {ticker}: {str(e)}"
        
        return info


class NSEPortfolioAgent:
    """Main coordinating agent for portfolio using IndianAPI.in."""
    
    def __init__(self, api_client: IndianAPIClient, news_api_key: str = None):
        self.stock_agent = NSEStockAgent(api_client)
        self.news_agent = NSENewsAgent(news_api_key)
        self.web_agent = NSEWebAgent(api_client)
    
    def generate_report(self, tickers: List[Tuple[str, float]]) -> str:
        logger.info("Starting portfolio report generation via IndianAPI.in...")
        
        real_time_data = self.stock_agent.fetch_data(tickers)
        web_info = self.web_agent.fetch_info(tickers)
        news_data = self.news_agent.fetch_news(tickers)
        
        report_lines = []
        report_lines.append("🇮🇳 INDIAN STOCK PORTFOLIO REPORT (IndianAPI.in)")
        report_lines.append("=" * 55)
        report_lines.append(f"Generated on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        report_lines.append("")
        
        total_value = 0
        total_change_value = 0
        
        report_lines.append("📊 REAL-TIME STOCK DATA:")
        report_lines.append("-" * 35)
        
        for item in real_time_data:
            ticker = item['ticker']
            quantity = item['quantity']
            
            if 'error' in item:
                report_lines.append(f"❌ {ticker}: ERROR - {item['error']}")
                report_lines.append("")
                continue
            
            lastPrice = item['lastPrice']
            change = item['change']
            pChange = item['pChange']
            
            status_emoji = "🟢" if change >= 0 else "🔴"
            holding_value = lastPrice * quantity if quantity > 0 else 0
            change_value = change * quantity if quantity > 0 else 0
            
            total_value += holding_value
            total_change_value += change_value
            
            report_lines.append(f"{status_emoji} {ticker}:")
            report_lines.append(f"    Last Price: ₹{lastPrice:.2f}")
            report_lines.append(f"    Change: ₹{change:+.2f} ({pChange:+.2f}%)")
            report_lines.append(f"    Previous Close: ₹{item['previousClose']:.2f}")
            report_lines.append(f"    Open: ₹{item['open']:.2f}")
            report_lines.append(f"    VWAP: ₹{item['vwap']:.2f}")
            report_lines.append(f"    Day Range: ₹{item['intraDayLow']:.2f} - ₹{item['intraDayHigh']:.2f}")
            report_lines.append(f"    52W Range: ₹{item['weekLow']:.2f} - ₹{item['weekHigh']:.2f}")
            report_lines.append(f"    Circuit Limits: ₹{item['lowerCP']} - ₹{item['upperCP']}")
            report_lines.append(f"    Price Band: {item['priceBand']}")
            
            if quantity > 0:
                report_lines.append(f"    Holdings: {quantity} shares")
                report_lines.append(f"    Holding Value: ₹{holding_value:.2f}")
                report_lines.append(f"    Day P&L: ₹{change_value:+.2f}")
            
            report_lines.append("")
        
        if total_value > 0:
            report_lines.append("💰 PORTFOLIO SUMMARY:")
            report_lines.append("-" * 20)
            report_lines.append(f"Total Portfolio Value: ₹{total_value:.2f}")
            report_lines.append(f"Total Day P&L: ₹{total_change_value:+.2f}")
            if total_value > 0:
                portfolio_pchange = (total_change_value / (total_value - total_change_value)) * 100
                report_lines.append(f"Portfolio Day Change: {portfolio_pchange:+.2f}%")
            report_lines.append("")
        
        report_lines.append("🏢 COMPANY INFORMATION:")
        report_lines.append("-" * 25)
        for ticker, info in web_info.items():
            report_lines.append(f"• {ticker}: {info}")
        report_lines.append("")
        
        report_lines.append("📰 LATEST NEWS:")
        report_lines.append("-" * 15)
        for ticker, news_items in news_data.items():
            report_lines.append(f"• {ticker}:")
            for news_item in news_items:
                report_lines.append(f"    - {news_item}")
            report_lines.append("")
        
        report_lines.append("=" * 55)
        report_lines.append("Report completed successfully!")
        
        return "\n".join(report_lines)


# ==================== WEBSOCKET HELPERS ====================

async def format_stock_data(symbol, quote):
    """Format stock data to match the expected format in the frontend"""
    try:
        price_info = quote.get("priceInfo", {})
        security_info = quote.get("securityInfo", {})
        metadata = quote.get("metadata", {})
        
        return {
            "T": "q",
            "S": symbol,
            "lastPrice": price_info.get("lastPrice", 0),
            "open": price_info.get("open", 0),
            "close": price_info.get("close", 0),
            "change": price_info.get("change", 0),
            "pChange": price_info.get("pChange", 0),
            "previousClose": price_info.get("previousClose", 0),
            "vwap": price_info.get("vwap", 0),
            "intraDayHighLow": {
                "max": price_info.get("intraDayHighLow", {}).get("max", 0),
                "min": price_info.get("intraDayHighLow", {}).get("min", 0)
            },
            "weekHighLow": {
                "max": price_info.get("weekHighLow", {}).get("max", 0),
                "min": price_info.get("weekHighLow", {}).get("min", 0),
                "maxDate": price_info.get("weekHighLow", {}).get("maxDate", ""),
                "minDate": price_info.get("weekHighLow", {}).get("minDate", "")
            },
            "upperCP": price_info.get("upperCP", 0),
            "lowerCP": price_info.get("lowerCP", 0),
            "pPriceBand": price_info.get("pPriceBand", "N/A"),
            "basePrice": price_info.get("basePrice", 0),
            "ieq": security_info.get("ieq", ""),
            "iNavValue": metadata.get("iNavValue", 0),
            "tickSize": security_info.get("tickSize", 0.05),
            "stockIndClosePrice": metadata.get("stockIndClosePrice", 0),
            "checkINAV": metadata.get("checkINAV", False),
            "marketStatus": metadata.get("market", "Closed"),
            "advances": metadata.get("advances", 0),
            "declines": metadata.get("declines", 0),
            "unchanged": metadata.get("unchanged", 0),
            "symbol": symbol,
            "name": security_info.get("companyName", symbol),
            "indexSymbol": security_info.get("index", ""),
            "timestamp": int(time.time() * 1000)
        }
    except Exception as e:
        logger.error(f"Error formatting stock data for {symbol}: {str(e)}")
        return {
            "T": "error",
            "S": symbol,
            "message": f"Error formatting data: {str(e)}"
        }


async def fetch_price(symbol):
    """Fetch and cache price data for a symbol via IndianAPI.in"""
    try:
        if symbol in price_cache:
            return price_cache[symbol]

        # Run sync requests in thread pool to not block event loop
        raw = await asyncio.to_thread(indian_client.stock_by_name, symbol)
        mapped = indian_client.map_to_nse_format(raw)
        data = await format_stock_data(symbol, mapped)
        
        price_cache[symbol] = data
        return data
    except Exception as e:
        logger.error(f"Error fetching price for {symbol}: {str(e)}")
        return {
            "T": "error",
            "S": symbol,
            "message": f"Error fetching data: {str(e)}"
        }


async def price_broadcast_loop():
    """Background task to broadcast price updates to WebSocket clients"""
    while True:
        try:
            for symbol, clients in list(symbol_subscribers.items()):
                if not clients:
                    continue
                
                data = await fetch_price(symbol)
                disconnected = []
                
                for client in clients:
                    try:
                        await client.send_json(data)
                    except Exception as e:
                        logger.error(f"Error sending to client: {str(e)}")
                        disconnected.append(client)
                
                for dc in disconnected:
                    clients.discard(dc)
                
                if not clients:
                    del symbol_subscribers[symbol]
                    
            await asyncio.sleep(3)
            
        except Exception as e:
            logger.error(f"Error in price broadcast loop: {str(e)}")
            await asyncio.sleep(1)


# ==================== WEBSOCKET ENDPOINT ====================

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time stock data via IndianAPI.in"""
    await websocket.accept()
    active_connections.add(websocket)
    
    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action")
            symbol = data.get("symbol", "").upper()

            if action == "subscribe" and symbol:
                try:
                    # Validate via IndianAPI.in
                    raw = await asyncio.to_thread(indian_client.stock_by_name, symbol)
                    if raw and "currentPrice" in raw:
                        if symbol not in symbol_subscribers:
                            symbol_subscribers[symbol] = set()
                        
                        symbol_subscribers[symbol].add(websocket)
                        await websocket.send_json({"message": f"Subscribed to {symbol}"})
                        
                        mapped = indian_client.map_to_nse_format(raw)
                        initial_data = await format_stock_data(symbol, mapped)
                        await websocket.send_json(initial_data)
                    else:
                        await websocket.send_json({"error": f"Invalid stock symbol: {symbol}"})
                except Exception as e:
                    logger.error(f"Error subscribing to {symbol}: {str(e)}")
                    await websocket.send_json({"error": f"Error subscribing to {symbol}: {str(e)}"})

            elif action == "unsubscribe" and symbol:
                if symbol in symbol_subscribers:
                    symbol_subscribers[symbol].discard(websocket)
                    await websocket.send_json({"message": f"Unsubscribed from {symbol}"})
                    
                    if not symbol_subscribers[symbol]:
                        del symbol_subscribers[symbol]

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
        active_connections.discard(websocket)
        for symbol, subscribers in list(symbol_subscribers.items()):
            subscribers.discard(websocket)
            if not subscribers:
                del symbol_subscribers[symbol]
    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}")
        active_connections.discard(websocket)


# ==================== REST API ENDPOINTS ====================

@app.get("/report_generation/{holding_id}")
async def generate_report(holding_id: str):
    """Generate portfolio report for given holding ID."""
    try:
        if not holding_id:
            raise HTTPException(status_code=400, detail="No holding_id provided")

        holdings_df = fetch_holdings_from_db(holding_id)

        if holdings_df is None or holdings_df.empty:
            raise HTTPException(
                status_code=404, 
                detail={
                    'error': 'No holdings found',
                    'message': f'No holdings found for holding_id: {holding_id}'
                }
            )

        portfolio = load_portfolio_from_dataframe(holdings_df)
        if not portfolio:
            raise HTTPException(status_code=500, detail="Invalid portfolio data")

        portfolio_agent = NSEPortfolioAgent(
            api_client=indian_client,
            news_api_key=None
        )

        report = portfolio_agent.generate_report(portfolio)

        return {
            'success': True,
            'holding_id': holding_id,
            'report': report,
            'portfolio_count': len(portfolio),
            'holdings_data': holdings_df.to_dict('records'),
            'generated_at': datetime.now().isoformat()
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating report: {str(e)}")
        raise HTTPException(status_code=500, detail={'error': 'Internal Server Error', 'message': str(e)})


@app.get("/")
async def root():
    """Root endpoint"""
    return HTMLResponse(content="""
    <html>
        <head><title>Indian Stock API</title></head>
        <body>
            <h1>Indian Stock API (IndianAPI.in)</h1>
            <p>API Documentation available at <a href="/docs">/docs</a></p>
        </body>
    </html>
    """)


@app.get("/api/search/{query}")
async def search_stocks(query: str):
    """Search for stocks by query string via IndianAPI.in"""
    try:
        raw = await asyncio.to_thread(indian_client.stock_by_name, query)
        results = [{
            "symbol": raw.get("tickerId"),
            "name": raw.get("companyName"),
            "industry": raw.get("industry"),
            "price": raw.get("currentPrice", {})
        }]
        return {"results": results}
    except Exception as e:
        logger.error(f"Error searching stocks: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error searching stocks: {str(e)}")


@app.get("/api/validate/{symbol}")
async def validate_stock(symbol: str):
    """Validate if a stock symbol exists"""
    try:
        raw = await asyncio.to_thread(indian_client.stock_by_name, symbol)
        if raw and "currentPrice" in raw:
            return {"valid": True, "symbol": symbol.upper()}
        return {"valid": False}
    except Exception as e:
        logger.error(f"Error validating stock {symbol}: {str(e)}")
        return {"valid": False}


@app.get("/api/graph-data/{symbol}")
async def get_graph_data(symbol: str, period: str = "1yr"):
    """
    Get historical graph data for a stock via IndianAPI.in.
    Periods: 1m, 6m, 1yr, 3yr, 5yr, 10yr, max
    """
    try:
        # Map frontend periods to IndianAPI.in periods
        period_map = {
            "1d": "1m", "5d": "1m", "1m": "1m", "3m": "6m",
            "ytd": "1yr", "1y": "1yr", "1yr": "1yr",
            "3y": "3yr", "3yr": "3yr", "5y": "5yr", "5yr": "5yr",
            "max": "max"
        }
        api_period = period_map.get(period, period)
        
        raw = await asyncio.to_thread(
            indian_client.historical_data, 
            stock_name=symbol.upper(), 
            period=api_period, 
            filter_type="price"
        )
        
        datasets = raw.get("datasets", [])
        if not datasets:
            return []
        
        price_dataset = next((d for d in datasets if d.get("metric") == "Price"), datasets[0])
        values = price_dataset.get("values", [])
        
        # Convert to [timestamp, price] format expected by frontend
        data_points = []
        for date_str, price_str in values:
            dt = datetime.strptime(date_str, "%Y-%m-%d")
            timestamp = int(dt.timestamp() * 1000)
            data_points.append([timestamp, float(price_str)])
        
        return data_points
        
    except Exception as e:
        logger.error(f"Error fetching graph data for {symbol}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching graph data: {str(e)}")


class OrderRequest(BaseModel):
    symbol: str
    quantity: int
    order_type: str
    target_price: float
    Email: str
    OrderId: str
    HoldingId: str
    
    @field_validator('symbol')
    def validate_symbol(cls, v):
        if not v or not v.strip():
            raise ValueError('Symbol cannot be empty')
        return v.strip().upper()
    
    @field_validator('quantity')
    def validate_quantity(cls, v):
        if v <= 0:
            raise ValueError('Quantity must be positive')
        return v
    
    @field_validator('target_price')
    def validate_price(cls, v):
        if v <= 0:
            raise ValueError('Price must be positive')
        return v
    
    @field_validator('order_type')
    def validate_order_type(cls, v):
        if v.upper() not in ['BUY', 'SELL']:
            raise ValueError('Order type must be BUY or SELL')
        return v.upper()
    
    @field_validator('Email')
    def validate_email(cls, v):
        if not v or not v.strip():
            raise ValueError('Email cannot be empty')
        return v.strip()
    
    @field_validator('OrderId')
    def validate_order_id(cls, v):
        if not v or not v.strip():
            raise ValueError('OrderId cannot be empty')
        return v.strip()
    
    @field_validator('HoldingId')
    def validate_holding_id(cls, v):
        if not v or not v.strip():
            raise ValueError('HoldingId cannot be empty')
        return v.strip()


@app.post("/api/place-order")
async def place_order(order_data: OrderRequest):
    """Place a buy or sell order"""
    try:
        logger.info(f"Processing order request: {order_data.model_dump()}")
        data = order_data.model_dump()
        
        symbol = data['symbol']
        quantity = data['quantity']
        order_type = data['order_type']
        target_price = data['target_price']
        email = data['Email']
        order_id = data['OrderId']
        holding_id = data['HoldingId']

        user = users.find_one({'Email': email})
        if not user:
            logger.error(f"User not found for email: {email}")
            return JSONResponse(status_code=404, content={"error": "User not found"})

        user_balance = float(user.get('Balance', 0))
        logger.info(f"User balance: {user_balance}")

        if order_type == 'SELL':
            holding = holdings.find_one({'HoldingId': holding_id})
            if not holding:
                return JSONResponse(status_code=404, content={"error": "Holding not found"})

            existing_holding = next((h for h in holding.get('Holdings', []) if h['symbol'] == symbol), None)
            if not existing_holding:
                return JSONResponse(status_code=400, content={"error": f"No holdings found for symbol {symbol}"})
            
            if existing_holding['quantity'] < quantity:
                return JSONResponse(
                    status_code=400,
                    content={"error": f"Insufficient holdings. Available: {existing_holding['quantity']}, Requested: {quantity}"}
                )

        total_cost = quantity * target_price
        if order_type == 'BUY' and user_balance < total_cost:
            return JSONResponse(
                status_code=400,
                content={"error": f"Insufficient balance. Required: ${total_cost:.2f}, Available: ${user_balance:.2f}"}
            )

        unique_order_id = str(uuid.uuid4())

        order = {
            'OrderId': unique_order_id,
            'symbol': symbol,
            'quantity': quantity,
            'order_type': order_type,
            'target_price': target_price,
            'Email': email,
            'HoldingId': holding_id,
            'created_at': datetime.now(),
            'status': 'EXECUTED',
            'total_amount': total_cost
        }

        result = orders_collection.insert_one(order)
        order['_id'] = result.inserted_id
        logger.info(f"Order created with ID: {result.inserted_id}")

        if order_type == 'BUY':
            new_balance = user_balance - total_cost
            users.update_one({'_id': user['_id']}, {'$set': {'Balance': new_balance}})
            logger.info(f"Updated user balance from {user_balance} to {new_balance}")

            holding = holdings.find_one({'HoldingId': holding_id})
            if not holding:
                holding = {'HoldingId': holding_id, 'Holdings': []}
                holdings.insert_one(holding)

            existing_holding_index = -1
            for i, h in enumerate(holding.get('Holdings', [])):
                h_symbol = h.get('symbol') or h.get('Symbol')
                if h_symbol == symbol:
                    existing_holding_index = i
                    break

            if existing_holding_index >= 0:
                existing_holding = holding['Holdings'][existing_holding_index]
                h_quantity = existing_holding.get('quantity') or existing_holding.get('Quantity', 0)
                h_price = existing_holding.get('price') or existing_holding.get('Price', 0)
                h_name = existing_holding.get('name') or existing_holding.get('Name', symbol)
                
                total_qty = h_quantity + quantity
                avg_price = ((h_quantity * h_price) + (quantity * target_price)) / total_qty

                holding['Holdings'][existing_holding_index] = {
                    'Name': h_name, 'Symbol': symbol, 'Quantity': total_qty, 'Price': avg_price,
                    'name': h_name, 'symbol': symbol, 'quantity': total_qty, 'price': avg_price
                }
                logger.info(f"Updated existing holding for {symbol}")
            else:
                try:
                    raw = await asyncio.to_thread(indian_client.stock_by_name, symbol)
                    company_name = raw.get("companyName", symbol)
                except Exception:
                    company_name = symbol
                
                holding['Holdings'].append({
                    'Name': company_name, 'Symbol': symbol, 'Quantity': quantity, 'Price': target_price,
                    'name': company_name, 'symbol': symbol, 'quantity': quantity, 'price': target_price
                })
                logger.info(f"Added new holding for {symbol}")

            holdings.update_one(
                {'HoldingId': holding_id}, 
                {'$set': {'Holdings': holding['Holdings']}}
            )

        else:  # SELL
            new_balance = user_balance + total_cost
            users.update_one({'_id': user['_id']}, {'$set': {'Balance': new_balance}})
            logger.info(f"Updated user balance from {user_balance} to {new_balance}")

            holding = holdings.find_one({'HoldingId': holding_id})
            updated_holdings = []
            
            for h in holding.get('Holdings', []):
                h_symbol = h.get('symbol') or h.get('Symbol')
                if h_symbol == symbol:
                    h_quantity = h.get('quantity') or h.get('Quantity', 0)
                    remaining_quantity = h_quantity - quantity
                    if remaining_quantity > 0:
                        h['quantity'] = remaining_quantity
                        h['Quantity'] = remaining_quantity
                        updated_holdings.append(h)
                else:
                    updated_holdings.append(h)

            if updated_holdings:
                holdings.update_one(
                    {'HoldingId': holding_id}, 
                    {'$set': {'Holdings': updated_holdings}}
                )
            else:
                holdings.delete_one({'HoldingId': holding_id})

        response_data = {
            "message": f"{order_type} order placed successfully",
            "order_id": str(order['_id']),
            "order": {
                "OrderId": order['OrderId'],
                "symbol": order['symbol'],
                "quantity": order['quantity'],
                "order_type": order['order_type'],
                "target_price": order['target_price'],
                "total_amount": order['total_amount'],
                "status": order['status'],
                "created_at": order['created_at'].isoformat()
            }
        }
        
        return JSONResponse(status_code=200, content=response_data)

    except ValueError as e:
        return JSONResponse(status_code=422, content={"error": f"Validation failed: {str(e)}"})
    except Exception as e:
        logger.error(f"Order placement error: {str(e)}", exc_info=True)
        return JSONResponse(status_code=500, content={"error": f"An error occurred: {str(e)}"})


@app.get("/api/gainer-losers")
async def get_gainers_and_losers():
    """Get top gainers and losers via IndianAPI.in /trending"""
    try:
        raw = await asyncio.to_thread(indian_client.trending)
        trending = raw.get("trending_stocks", {})
        
        gainers = trending.get("top_gainers", [])
        losers = trending.get("top_losers", [])
        
        # Normalize string numbers to floats for DataFrame compatibility
        for item in gainers + losers:
            for k in ['price', 'percent_change', 'net_change', 'high', 'low', 'open', 'volume']:
                if k in item and isinstance(item[k], str):
                    try:
                        item[k] = float(item[k].replace(',', ''))
                    except:
                        pass
        
        gainers_df = pd.DataFrame(gainers)
        losers_df = pd.DataFrame(losers)
        
        return {
            "gainers": gainers_df.to_dict(orient="records") if not gainers_df.empty else [],
            "losers": losers_df.to_dict(orient="records") if not losers_df.empty else []
        }
    except Exception as e:
        logger.error(f"Error fetching gainers and losers: {str(e)}")
        return JSONResponse(status_code=500, content={"error": f"Error fetching gainers and losers: {str(e)}"})


@app.get("/api/orders")
async def get_orders(status: Optional[str] = None, symbol: Optional[str] = None):
    """Get all orders with optional filtering"""
    try:
        query = {}
        if status:
            query['status'] = status.upper()
        if symbol:
            query['symbol'] = symbol.upper()
        
        orders_cursor = orders_collection.find(query).sort('created_at', -1)
        orders_list = [serialize_doc(o) for o in orders_cursor]
        
        return {
            "orders": orders_list,
            "count": len(orders_list),
            "market_open": check_market_status()
        }
    except Exception as e:
        logger.error(f"Error fetching orders: {str(e)}")
        return JSONResponse(status_code=500, content={"error": f"Error fetching orders: {str(e)}"})


@app.get("/api/orders/{id}")
async def get_order(id: str):
    """Get all orders for an Email"""
    try:
        orders = list(orders_collection.find({'Email': id}).sort('created_at', -1))
        if orders:
            return {
                "orders": [serialize_doc(o) for o in orders],
                "count": len(orders)
            }
        return JSONResponse(status_code=404, content={"error": "No orders found"})
    except Exception as e:
        logger.error(f"Error fetching orders for {id}: {str(e)}")
        return JSONResponse(status_code=500, content={"error": f"Error fetching orders: {str(e)}"})


@app.get("/api/market-status")
async def api_market_status():
    """Get current market status (time-based approximation for Indian markets)"""
    try:
        is_open = check_market_status()
        return {
            'marketState': [{'market': 'Capital Market', 'marketStatus': 'Open' if is_open else 'Closed'}],
            'isOpen': is_open
        }
    except Exception as e:
        logger.error(f"Error fetching market status: {str(e)}")
        return JSONResponse(status_code=500, content={"error": f"Error fetching market status: {str(e)}"})

"""
@app.get("/api/stock-quote/{symbol}")
async def api_stock_quote(symbol: str):"""
 # """Get current stock quote via IndianAPI.in"""
   
""" try:
        raw = await asyncio.to_thread(indian_client.stock_by_name, symbol)
        mapped = indian_client.map_to_nse_format(raw)
        return mapped['priceInfo']
    except Exception as e:
        logger.error(f"Error fetching stock quote for {symbol}: {str(e)}")
        return JSONResponse(status_code=500, content={"error": f"Error fetching stock quote: {str(e)}"})
"""
@app.get("/api/stock-quote/{symbol}")
async def api_stock_quote(symbol: str):
    """Get current stock quote via IndianAPI.in"""
    try:
        raw = await asyncio.to_thread(indian_client.stock_by_name, symbol)
        mapped = indian_client.map_to_nse_format(raw)
        return mapped
    except ValueError as e:
        # Stock not found or bad response format
        logger.warning(f"Stock lookup failed for {symbol}: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except requests.HTTPError as e:
        logger.warning(f"API error for {symbol}: {e}")
        raise HTTPException(status_code=502, detail=f"Upstream API error: {e}")
    except Exception as e:
        logger.error(f"Unexpected error fetching {symbol}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")
@app.get("/api/debug/users")
async def debug_users():
    """Temporary endpoint to diagnose MongoDB connectivity"""
    try:
        # List all databases
        db_names = client.list_database_names()
        
        # Count users in our target collection
        user_count = users.count_documents({})
        
        # Get first 3 users (hide passwords)
        sample_users = []
        for u in users.find().limit(3):
            u.pop('Password', None)
            u.pop('password', None)
            sample_users.append(serialize_doc(u))
        
        return {
            "databases": db_names,
            "target_db": "Growup",
            "target_collection": "users",
            "user_count": user_count,
            "sample_users": sample_users,
            "mongo_uri_connected": mongo_uri is not None
        }
    except Exception as e:
        return {"error": str(e)}
@app.get("/api/indices")
async def api_indices():
    """
    Get current indices data.
    NOTE: IndianAPI.in does not provide a direct /indices endpoint.
    This returns trending market sentiment as a proxy.
    """
    try:
        raw = await asyncio.to_thread(indian_client.trending)
        trending = raw.get("trending_stocks", {})
        gainers = len(trending.get("top_gainers", []))
        losers = len(trending.get("top_losers", []))
        
        return {
            "note": "IndianAPI.in does not provide an indices endpoint. Using trending data as proxy.",
            "marketSentiment": "Bullish" if gainers > losers else "Bearish" if losers > gainers else "Neutral",
            "topGainersCount": gainers,
            "topLosersCount": losers
        }
    except Exception as e:
        logger.error(f"Error fetching indices proxy: {str(e)}")
        return JSONResponse(status_code=500, content={"error": f"Error fetching market data: {str(e)}"})


# Startup and Shutdown Events
@app.on_event("startup")
async def startup_event():
    logger.info("Starting Indian Stock API (IndianAPI.in)")
    global market_open
    market_open = check_market_status()
    logger.info(f"Market status approx: {'Open' if market_open else 'Closed'}")
    asyncio.create_task(price_broadcast_loop())


@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Shutting down Indian Stock API")


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 5003))
    uvicorn.run(app, host="0.0.0.0", port=port)

    