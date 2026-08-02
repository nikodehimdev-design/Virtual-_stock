import React, { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Mail,
  Phone,
  MapPin,
  Facebook,
  Twitter,
  Instagram,
  Linkedin,
  Youtube,
  ChevronUp,
  ChevronRight,
  MessageSquare,
  DollarSign,
  TrendingUp,
  BookOpen,
  User,
  HelpCircle,
  Send,
  X,
  Newspaper,
} from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface NewsItem {
  title: string;
  description: string;
  link: string;
  pubDate: string;
}

const NEWS_RSS_URL =
  "https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms";

const API_BASE_URL = "http://localhost:3001";

const STATIC_NEWS_FALLBACK: NewsItem[] = [
  {
    title: "Sensex rallies 400 pts; Nifty above 24,500 as financials lead gains",
    description: "Indian equity benchmarks opened higher backed by strong FII inflows and positive global cues. Banking and financial stocks were the top gainers.",
    link: "https://economictimes.indiatimes.com/markets/stocks",
    pubDate: new Date().toUTCString(),
  },
  {
    title: "RBI holds repo rate at 6.5%; economy outlook remains stable",
    description: "Reserve Bank of India's Monetary Policy Committee kept key policy rates unchanged, citing controlled inflation and steady growth momentum.",
    link: "https://economictimes.indiatimes.com/markets",
    pubDate: new Date().toUTCString(),
  },
  {
    title: "FIIs pour ₹2,000 crore into Indian equities; bullish sentiment returns",
    description: "Foreign institutional investors turned net buyers after weeks of selling pressure, signalling renewed confidence in Indian markets.",
    link: "https://economictimes.indiatimes.com/markets",
    pubDate: new Date().toUTCString(),
  },
  {
    title: "IT sector rally: TCS, Infosys, Wipro gain 2-3% on strong deal wins",
    description: "Indian IT majors surged after announcing strong deal pipelines and better-than-expected order books for Q2.",
    link: "https://economictimes.indiatimes.com/markets/stocks",
    pubDate: new Date().toUTCString(),
  },
  {
    title: "Adani Group stocks rebound 5% after clarification on debt concerns",
    description: "Adani Group companies recovered sharply after the conglomerate issued a detailed response addressing recent concerns about leverage.",
    link: "https://economictimes.indiatimes.com/markets/stocks",
    pubDate: new Date().toUTCString(),
  },
];

// ════════════════════════════════════════════════════════════════
// BACKEND API CALL
// ════════════════════════════════════════════════════════════════
const callBackendAI = async (question: string): Promise<string> => {
  const response = await fetch(`${API_BASE_URL}/model/ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `Server error ${response.status}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.message || "Backend request failed");
  }

  // Clean up markdown wrappers if Gemini returned them despite instructions
  let answer = data.answer || "No response from server.";
  if (typeof answer === "string") {
    answer = answer
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
  }

  return answer;
};

// ════════════════════════════════════════════════════════════════
// FOOTER COMPONENT
// ════════════════════════════════════════════════════════════════
const Footer = () => {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [chatVisible, setChatVisible] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [newsItems, setNewsItems] = useState<NewsItem[]>(STATIC_NEWS_FALLBACK);
  const [newsLoading, setNewsLoading] = useState(false);
  const [aiReady, setAiReady] = useState(true);
  const [chatError, setChatError] = useState<string | null>(null);
  const [connectionTested, setConnectionTested] = useState(true);

  // ── Scroll helpers ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 300);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ════════════════════════════════════════
  // NEWS FETCH
  // ════════════════════════════════════════
  useEffect(() => {
    fetchNews();
  }, []);

  const fetchNews = async () => {
    setNewsLoading(true);
    try {
      // Primary: rss2json
      const res = await fetch(
        `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(NEWS_RSS_URL)}&count=20`
      );
      if (!res.ok) throw new Error("rss2json failed");
      const data = await res.json();
      if (data.status === "ok" && data.items?.length > 0) {
        setNewsItems(
          data.items.map((item: any) => ({
            title: item.title?.replace(/<[^>]*>/g, "").trim() || "",
            description: item.description?.replace(/<[^>]*>/g, "").trim() || "",
            link: item.link || "",
            pubDate: item.pubDate || "",
          }))
        );
        console.log("[StockNews AI] Live news loaded:", data.items.length, "articles");
        setNewsLoading(false);
        return;
      }
      throw new Error("empty feed");
    } catch (e1) {
      console.warn("[StockNews AI] rss2json failed:", e1);
      // Fallback: allorigins
      try {
        const res2 = await fetch(
          `https://api.allorigins.win/get?url=${encodeURIComponent(NEWS_RSS_URL)}`
        );
        const json2 = await res2.json();
        if (json2.contents) {
          const xml = new DOMParser().parseFromString(json2.contents, "text/xml");
          const items = Array.from(xml.querySelectorAll("item")).slice(0, 20);
          if (items.length > 0) {
            setNewsItems(
              items.map((el) => ({
                title: el.querySelector("title")?.textContent?.trim() || "",
                description:
                  el.querySelector("description")?.textContent
                    ?.replace(/<[^>]*>/g, "")
                    .trim() || "",
                link: el.querySelector("link")?.textContent?.trim() || "",
                pubDate: el.querySelector("pubDate")?.textContent?.trim() || "",
              }))
            );
            console.log("[StockNews AI] Fallback news loaded via allorigins");
            setNewsLoading(false);
            return;
          }
        }
      } catch (err2) {
        console.warn("[StockNews AI] allorigins also failed:", err2);
      }
      console.warn("[StockNews AI] Using static fallback news.");
    } finally {
      setNewsLoading(false);
    }
  };

  const formatNewsList = (count = 5) => {
    if (!newsItems.length) return "📡 Fetching latest news... Try again shortly.";
    return newsItems
      .slice(0, count)
      .map(
        (n, i) =>
          `${i + 1}. ${n.title}${n.pubDate ? `\n   🕐 ${n.pubDate}` : ""}\n   📎 ${n.link}`
      )
      .join("\n\n");
  };

  const searchNewsByKeyword = (keywords: string[]) => {
    const matches = newsItems.filter((n) =>
      keywords.some(
        (kw) =>
          n.title?.toLowerCase().includes(kw.toLowerCase()) ||
          n.description?.toLowerCase().includes(kw.toLowerCase())
      )
    );
    if (!matches.length) return null;
    return matches
      .slice(0, 5)
      .map(
        (n, i) =>
          `${i + 1}. ${n.title}${n.pubDate ? `\n   🕐 ${n.pubDate}` : ""}\n   📎 ${n.link}`
      )
      .join("\n\n");
  };

  // ════════════════════════════════════════
  // NEWSLETTER
  // ════════════════════════════════════════
  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email?.includes("@")) {
      setSubscribed(true);
      setTimeout(() => setSubscribed(false), 3000);
      setEmail("");
    }
  };

  // ════════════════════════════════════════
  // CHAT SUBMIT
  // ════════════════════════════════════════
  const addBotMessage = (content: string) => {
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content, timestamp: new Date() },
    ]);
  };

  const handleChatSubmit = async (
    e?: React.FormEvent | React.MouseEvent,
    directPrompt?: string
  ) => {
    e?.preventDefault();
    const text = (directPrompt || chatMessage).trim();
    if (!text || isTyping) return;

    // Add user message
    setMessages((prev) => [
      ...prev,
      { role: "user", content: text, timestamp: new Date() },
    ]);
    setChatMessage("");
    setIsTyping(true);
    setChatError(null);

    try {
      // ── Quick-path: top N news (no backend call needed) ──
      if (
        /top\s*(\d+)?\s*news|latest\s*(\d+)?\s*news|list\s*news|show\s*news|headlines/i.test(text)
      ) {
        const n = parseInt(text.match(/\d+/)?.[0] || "5");
        const count = Math.min(n || 5, 10);
        addBotMessage(`📰 Top ${count} market headlines:\n\n${formatNewsList(count)}`);
        return;
      }

      // ── Quick-path: funding / IPO (no backend call needed) ──
      if (
        /\bfunding\b|\braised\b|\bipo\b|\binvestment\b|\bfunded\b|\bvaluation\b|\braise\b|\bseries [a-z]\b|\bseed funding\b/i.test(
          text
        )
      ) {
        const found = searchNewsByKeyword([
          "funding",
          "raise",
          "raised",
          "IPO",
          "investment",
          "crore",
          "million",
          "billion",
        ]);
        addBotMessage(
          found
            ? `💰 Latest funding & IPO news:\n\n${found}`
            : `No recent funding or IPO news found in today's feed.\n\nTry: *"Show top 5 news"* to see all headlines.\n📎 https://economictimes.indiatimes.com/markets`
        );
        return;
      }

      // ── All other queries → Backend server ──
      const reply = await callBackendAI(text);
      addBotMessage(reply);
    } catch (err: any) {
      const errMsg = err?.message || String(err) || "Unknown error";
      console.error("[StockNews AI] Backend error:", errMsg, err);
      setAiReady(false);
      setChatError(errMsg);
      addBotMessage(
        `⚠️ Server error: ${errMsg}\n\nHere's what I have from today's feed:\n\n${formatNewsList(5)}`
      );
    } finally {
      setIsTyping(false);
    }
  };

  // Offline / error fallback responses
  const offlineFallback = (text: string): string => {
    const lower = text.toLowerCase();
    if (/\b(hi|hello|hey|hlo|hii)\b/.test(lower)) {
      return `👋 Hello! I'm **StockNews AI** — your expert financial news assistant for Virtual Stock.\n\nI can help you with:\n• 📰 Latest market headlines\n• 💰 Funding & IPO news\n• 📊 Market summaries & sentiment\n\nTry: *"Show top 5 news"* or *"Summarize today's market"*`;
    }
    if (/who are you|what are you|introduce/.test(lower)) {
      return `🤖 I'm **StockNews AI** — an expert financial news assistant for the Virtual Stock platform.\n\nI fetch live headlines from Economic Times and help you understand what's moving the markets.\n\nAsk me anything about today's market! 📈`;
    }
    if (/summar|update|overview|today|market/.test(lower)) {
      return `📊 Today's Market Overview:\n\n${formatNewsList(6)}`;
    }
    return `📰 Here's what I found in today's feed:\n\n${formatNewsList(5)}\n\n💡 Try asking about a specific company or sector!`;
  };

  // ════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════
  return (
    <>
      {/* ── FOOTER ── */}
      <footer className="bg-gray-900 text-gray-300 pt-16 pb-8">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">

            {/* Company Info */}
            <div>
              <h3 className="text-2xl font-bold text-white mb-4">
                <span className="text-blue-400">Virtual</span> Stock
              </h3>
              <p className="mb-4 text-gray-400">
                Your premier virtual stock trading platform. Learn, practice, and master
                trading without financial risk.
              </p>
              <div className="flex space-x-4 mt-6">
                {[Facebook, Twitter, Linkedin, Instagram, Youtube].map((Icon, i) => (
                  <motion.a
                    key={i}
                    href="#"
                    className="bg-gray-800 p-2 rounded-full hover:bg-blue-600 transition-colors duration-300"
                    whileHover={{ y: -5 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    <Icon size={18} />
                  </motion.a>
                ))}
              </div>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="text-lg font-semibold text-white mb-4 pb-2 border-b border-gray-700">
                Quick Links
              </h4>
              <ul className="space-y-2">
                {[
                  { label: "Trading Platform", icon: DollarSign, url: "/stocks" },
                  { label: "Market Analysis", icon: TrendingUp, url: "/watchlist" },
                  { label: "Learning Resources", icon: BookOpen, url: "/learn" },
                  { label: "My Portfolio", icon: User, url: "/holding" },
                  { label: "Help Center", icon: HelpCircle, url: "/contact" },
                ].map((link, i) => (
                  <motion.li key={i} whileHover={{ x: 5 }}>
                    <a
                      href={link.url}
                      className="flex items-center hover:text-blue-400 transition-colors duration-200"
                    >
                      <link.icon size={16} className="mr-2" />
                      <span>{link.label}</span>
                    </a>
                  </motion.li>
                ))}
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="text-lg font-semibold text-white mb-4 pb-2 border-b border-gray-700">
                Contact Us
              </h4>
              <ul className="space-y-4">
                <li className="flex items-start">
                  <MapPin size={18} className="mr-2 mt-1 text-blue-400" />
                  <span>Pune Institute of Computer Technology, Pune-411043</span>
                </li>
                <li className="flex items-center">
                  <Phone size={18} className="mr-2 text-blue-400" />
                  <span>+91 7709469083</span>
                </li>
                <li className="flex items-center">
                  <Mail size={18} className="mr-2 text-blue-400" />
                  <span>growup@gmail.com</span>
                </li>
              </ul>
            </div>

            {/* Newsletter */}
            <div>
              <h4 className="text-lg font-semibold text-white mb-4 pb-2 border-b border-gray-700">
                Market Updates
              </h4>
              <p className="mb-4 text-gray-400">
                Subscribe to our newsletter for weekly market insights and trading tips.
              </p>
              <form onSubmit={handleSubscribe} className="mt-4">
                <div className="flex flex-col space-y-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Your email address"
                    className="bg-gray-800 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 border border-gray-700"
                    required
                  />
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex justify-center items-center transition-colors"
                  >
                    Subscribe <ChevronRight size={16} className="ml-1" />
                  </motion.button>
                </div>
              </form>
              {subscribed && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 text-green-400 text-sm"
                >
                  Thanks for subscribing! Check your inbox.
                </motion.div>
              )}
            </div>
          </div>

          {/* Bottom bar */}
          <div className="mt-12 pt-6 border-t border-gray-800 flex flex-col md:flex-row justify-between items-center">
            <div className="text-sm text-gray-500 mb-4 md:mb-0">
              © {new Date().getFullYear()} Virtual Stock. All rights reserved.
            </div>
            <div className="flex space-x-4 text-sm text-gray-500">
              <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
              <span className="text-gray-700">|</span>
              <a href="#" className="hover:text-white transition-colors">Terms of Use</a>
              <span className="text-gray-700">|</span>
              <a href="#" className="hover:text-white transition-colors">Disclaimer</a>
            </div>
          </div>
        </div>
      </footer>

      {/* ── CHAT TOGGLE BUTTON ── */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setChatVisible(!chatVisible)}
        className="fixed bottom-6 right-6 bg-blue-600 text-white p-3 rounded-full shadow-xl z-50 flex items-center"
        title="StockNews AI"
      >
        {chatVisible ? (
          <X size={24} />
        ) : (
          <>
            <MessageSquare size={24} />
            <span
              className={`absolute top-1 right-1 w-2.5 h-2.5 rounded-full border-2 border-blue-600 ${
                !connectionTested
                  ? "bg-yellow-400 animate-pulse"
                  : aiReady
                  ? "bg-green-400"
                  : "bg-orange-400"
              }`}
            />
          </>
        )}
      </motion.button>

      {/* ── CHAT WINDOW ── */}
      {chatVisible && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="fixed bottom-24 right-6 w-96 bg-white rounded-xl shadow-2xl overflow-hidden z-50 border border-gray-200"
        >
          {/* Debug error banner */}
          {chatError && (
            <div className="bg-red-50 border-b border-red-200 px-3 py-2 text-xs text-red-700 flex items-start gap-1">
              <span className="font-bold">⚠️ Error:</span>
              <span className="break-all">{chatError}</span>
            </div>
          )}

          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-4 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div
                className={`w-2.5 h-2.5 rounded-full ${
                  !connectionTested
                    ? "bg-yellow-400 animate-pulse"
                    : aiReady
                    ? "bg-green-400"
                    : "bg-orange-400"
                }`}
              />
              <div>
                <h3 className="font-semibold text-sm">🤖 StockNews AI</h3>
                <p className="text-xs text-blue-200">
                  {newsLoading
                    ? "Fetching live news..."
                    : !connectionTested
                    ? "Checking server..."
                    : aiReady
                    ? `${newsItems.length} articles loaded · Server connected`
                    : `${newsItems.length} articles loaded · Server offline`}
                </p>
              </div>
            </div>
            <button
              onClick={() => setChatVisible(false)}
              className="text-white hover:text-gray-200 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Messages */}
          <div className="h-96 bg-gray-50 p-4 overflow-y-auto">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-3">
                <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center">
                  <Newspaper size={28} className="text-blue-600" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-gray-700 text-sm">StockNews AI</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Expert financial news assistant
                  </p>
                </div>
                <div className="flex flex-col gap-2 w-full px-2 mt-2">
                  <button
                    onClick={() =>
                      handleChatSubmit(undefined, "Summarize today's stock market news and sentiment")
                    }
                    className="px-3 py-2.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors flex items-center justify-center gap-2"
                  >
                    <Newspaper size={13} /> 📊 Market Summary & Sentiment
                  </button>
                  <button
                    onClick={() => handleChatSubmit(undefined, "Show me top 5 news")}
                    className="px-3 py-2.5 bg-gray-50 border border-gray-200 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
                  >
                    <Newspaper size={13} /> 🗞️ Top 5 Headlines
                  </button>
                  <button
                    onClick={() =>
                      handleChatSubmit(undefined, "Which company raised funding recently?")
                    }
                    className="px-3 py-2.5 bg-gray-50 border border-gray-200 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
                  >
                    <TrendingUp size={13} /> 💰 Funding & IPO News
                  </button>
                </div>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div
                  key={i}
                  className={`mb-4 flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "assistant" && (
                    <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center mr-2 mt-1 flex-shrink-0 text-xs">
                      🤖
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] p-3 rounded-xl text-sm ${
                      msg.role === "user"
                        ? "bg-blue-600 text-white rounded-br-none"
                        : "bg-white text-gray-800 rounded-bl-none border border-gray-200 shadow-sm"
                    }`}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    <span className="text-xs opacity-50 mt-1.5 block">
                      {msg.timestamp.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              ))
            )}

            {/* Typing dots */}
            {isTyping && (
              <div className="flex justify-start mb-4 items-end gap-2">
                <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs flex-shrink-0">
                  🤖
                </div>
                <div className="bg-white border border-gray-200 shadow-sm p-3 rounded-xl rounded-bl-none">
                  <div className="flex space-x-1 items-center">
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" />
                    <div
                      className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"
                      style={{ animationDelay: "0.2s" }}
                    />
                    <div
                      className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"
                      style={{ animationDelay: "0.4s" }}
                    />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => handleChatSubmit(e)}
            className="p-3 border-t border-gray-200 flex gap-2 bg-white"
          >
            <input
              type="text"
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              placeholder="Ask about stocks, news, sectors..."
              className="flex-1 bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isTyping}
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={isTyping || !chatMessage.trim()}
              className="bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 flex items-center disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={16} />
            </button>
          </form>
        </motion.div>
      )}

      {/* ── BACK TO TOP ── */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: showBackToTop ? 1 : 0 }}
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="fixed bottom-6 left-6 bg-blue-600 text-white p-3 rounded-full shadow-lg z-50"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
      >
        <ChevronUp size={24} />
      </motion.button>
    </>
  );
};

export default Footer;