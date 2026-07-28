import requests
import json

symbol = "^NSEI"
url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
}

try:
    r = requests.get(url, headers=headers, timeout=10)
    data = r.json()
    meta = data['chart']['result'][0]['meta']
    print("SUCCESS!")
    print(f"Index Name: NIFTY 50")
    print(f"Price: {meta.get('regularMarketPrice')}")
    print(f"Previous Close: {meta.get('previousClose')}")
except Exception as e:
    print(e)   
