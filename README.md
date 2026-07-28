# 📈 Virtual Stock – Virtual Stock Market Simulator

**Virtual Stock** is a real-time, beginner-friendly virtual stock trading simulator that allows users to understand the basics of the stock market without any financial risk. Designed as an experiential platform, it uses live NSE stock data, simulates buying/selling behavior, and provides portfolio tracking with personalized analysis.

---

## 🚀 Inspiration

As someone who started trading in my Third year, I personally experienced the steep learning curve and confusion around basic market terminologies and trading strategies. Virtual Stock is built to solve that gap — giving users a risk-free, real-world learning experience in the world of stock markets.

---

## 🎯 Features

- 📊 **Live NSE Stock Data** – Integrated using `nse-jugaad-data` (no paid API required)
- 🔁 **Real-Time Updates** – WebSocket-powered live price streaming
- 🚀 **Asynchronous FastAPI Backend** – Built with high-performance async I/O
- 🧠 **Portfolio Summary & Analyzer** – Get insights on portfolio performance and suggestions
- 🔄 **Order Management** – Simulate buy/sell operations with real-time timestamps
- ⚡ **TTL Cache** – Efficient caching of stock data to reduce latency and API load
- 🔐 **User Authentication** – Secure login/register system (planned)
- 📊 **Future Scope** – AI-driven stock suggestions, mutual funds, BSE & global trade support

---

## 🛠 Tech Stack

### ✅ Backend

- **Python 3.10**
- **FastAPI** – Async API framework
- **cachetools** – For TTL cache
- **nse-jugaad-data** – Live stock data from NSE
- **WebSockets** – For real-time communication
- **Uvicorn** – ASGI server

### ✅ Frontend

- **React.js 18** + **TypeScript**
- **Vite** – Fast build tool
- **WebSocket API / socket.io-client**
- **Recharts** – Interactive charts
- **Framer Motion** – Smooth animations
- **Tailwind CSS** – Utility-first styling

### ✅ Node.js Utilities

- **Node.js 18**
- **Express.js 4.18** – Lightweight proxy APIs and utility endpoints
- **MongoDB / Mongoose** – User data & portfolio persistence

### ✅ AI Integration

- **Google Gemini API** – AI Trading Assistant chatbot

### ✅ Deployment

- **Docker / Docker Compose** – Containerized multi-service architecture
- **Render** – Backend hosting (due to support for rewrites/redirects)
- **AWS EC2** – For scalable and flexible hosting of backend services

---

## 💡 Future Scope

- 🧠 AI-powered suggestion engine (pros/cons before buying a stock)
- 📦 Mutual fund simulation
- 🌍 Support for BSE and global markets
- 🧑‍🤝‍🧑 Social trading (follow & clone portfolios)
- 🏆 Gamification (badges, leaderboards)

---

## 📁 Project Structure

```
virtual-stock/
├── backend/                  # Node.js + Express (Auth, Portfolio, Watchlist)
│   ├── Controller/           # HoldingController, UserController, WatchlistController
│   ├── Models/               # Mongoose schemas
│   ├── Routes/               # API route definitions
│   ├── dbconfig/             # MongoDB connection
│   └── server.js             # Express entry point
│
├── fastapi_backend/          # Python FastAPI (Live NSE data + WebSocket)
│   ├── app.py                # Main FastAPI application
│   └── requirements.txt
│
├── frontend/                 # React + TypeScript + Vite
│   ├── src/
│   │   ├── components/       # Navbar, Footer, PrivateRoute
│   │   ├── pages/            # Home, Dashboard, Stocks, Watchlist, Holdings, Orders, Learn
│   │   ├── store/            # Zustand auth store
│   │   ├── services/         # API service calls
│   │   └── types/            # TypeScript type definitions
│   └── index.html
│
└── docker-compose.yml        # Multi-service orchestration
```

---

## 📁 Project Setup

### 🐍 FastAPI Backend (Live NSE Data + WebSocket)

```bash
cd fastapi_backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --reload
```

> Runs on `http://localhost:8000`

---

### 🌲 Node/Express Backend (Auth, Portfolio, Watchlist)

```bash
cd backend
npm install
npm start
```

> Runs on `http://localhost:5000`

---

### ⚛️ Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

> Runs on `http://localhost:5173`

---

### 🐳 Docker (All Services)

```bash
docker-compose up --build
```

| Service          | Port  |
|------------------|-------|
| FastAPI Backend  | 8000  |
| Node.js Backend  | 5000  |
| React Frontend   | 3000  |

---

## 🧑‍💻 Environment Variables

### `frontend/.env`

```env
VITE_FLASK_BACKEND_URL=http://localhost:8000
VITE_NODE_BACKEND_URL=http://localhost:5000
VITE_GEMINI_API_KEY=your_gemini_api_key
```

### `backend/.env`

```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
```

### `fastapi_backend/.env`

```env
PORT=8000
```

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!  
Feel free to open a pull request or an issue.

---

## 📜 License

This project is licensed under the **MIT License**.

---

<div align="center">
  Made with ❤️ by the Virtual Stock Team · Pune Institute of Computer Technology
</div>
