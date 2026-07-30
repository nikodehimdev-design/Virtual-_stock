import React, { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { GoogleGenerativeAI } from "@google/generative-ai";
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
  Newspaper
} from "lucide-react";

interface Message {
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

const NEWS_API_URL = 'https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms';

const Footer = () => {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [chatVisible, setChatVisible] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [genAI, setGenAI] = useState<GoogleGenerativeAI | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [newsItems, setNewsItems] = useState<any[]>([]);

  // Fetch news on mount
  useEffect(() => {
    fetchNews();
  }, []);

  const fetchNews = async () => {
    try {
      const response = await fetch(
        `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(NEWS_API_URL)}`
      );
      const data = await response.json();
      if (data.status === 'ok' && Array.isArray(data.items)) {
        const cleaned = data.items.map((item: any) => ({
          title: item.title?.replace(/<[^>]*>/g, '').trim(),
          description: item.description?.replace(/<[^>]*>/g, '').trim(),
          link: item.link,
          pubDate: item.pubDate,
        }));
        setNewsItems(cleaned);
      }
    } catch (error) {
      console.error('Error fetching news:', error);
    }
  };

  const formatNewsList = (count: number = 5) => {
    if (!newsItems.length) return "No news available right now.";
    const top = newsItems.slice(0, count);
    return top.map((item, i) => 
      `${i + 1}. ${item.title}\n   📎 ${item.link}`
    ).join('\n\n');
  };

  const searchNewsByKeyword = (keywords: string[]) => {
    if (!newsItems.length) return null;
    const matches = newsItems.filter(item => 
      keywords.some(kw => 
        item.title?.toLowerCase().includes(kw.toLowerCase()) ||
        item.description?.toLowerCase().includes(kw.toLowerCase())
      )
    );
    if (!matches.length) return null;
    return matches.slice(0, 5).map((item, i) => 
      `${i + 1}. ${item.title}\n   📎 ${item.link}`
    ).join('\n\n');
  };

  // Initialize Gemini API
  useEffect(() => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (apiKey) {
      try {
        const client = new GoogleGenerativeAI(apiKey);
        setGenAI(client);
        setApiError(null);
      } catch (error) {
        console.error('Error initializing Gemini API:', error);
        setApiError('Failed to initialize chat service. Please check your API key.');
      }
    } else {
      setApiError('API key not found. Please configure your Gemini API key.');
    }
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 300);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email && email.includes('@')) {
      setSubscribed(true);
      setTimeout(() => setSubscribed(false), 3000);
      setEmail("");
    }
  };

  // ==================== CHATBOT LOGIC ====================
  const handleChatSubmit = async (e?: React.FormEvent | React.MouseEvent, directPrompt?: string) => {
    e?.preventDefault();
    const messageText = (directPrompt || chatMessage).trim();
    if (!messageText || !genAI) return;

    const userMessage: Message = {
      text: messageText,
      sender: 'user',
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);
    setChatMessage("");
    setIsTyping(true);
    setApiError(null);

    // 1. Check for "top 5 news" / "latest news" intent
    const topNewsRegex = /top\s*(\d+)?\s*news|latest\s*(\d+)?\s*news|list\s*news|show\s*news/i;
    if (topNewsRegex.test(messageText)) {
      const countMatch = messageText.match(/\d+/);
      const count = countMatch ? parseInt(countMatch[0]) : 5;
      const newsList = formatNewsList(Math.min(count, 10));
      setMessages(prev => [...prev, {
        text: `📰 Here are the top ${Math.min(count, 10)} market news:\n\n${newsList}`,
        sender: 'bot',
        timestamp: new Date()
      }]);
      setIsTyping(false);
      return;
    }

    // 2. Check for funding/IPO/raise intent
    const fundingRegex = /funding|raised|ipo|investment|funded|valuation|raise|series\s*[a-z]|seed\s*funding/i;
    if (fundingRegex.test(messageText)) {
      const fundingNews = searchNewsByKeyword(['funding', 'raise', 'raised', 'IPO', 'investment', 'crore', 'million', 'billion']);
      if (fundingNews) {
        setMessages(prev => [...prev, {
          text: `💰 Here are the latest funding/raise related news:\n\n${fundingNews}`,
          sender: 'bot',
          timestamp: new Date()
        }]);
      } else {
        setMessages(prev => [...prev, {
          text: `I checked today's Economic Times market feed but couldn't find any specific funding news. Try asking for "top 5 news" to see all headlines.`,
          sender: 'bot',
          timestamp: new Date()
        }]);
      }
      setIsTyping(false);
      return;
    }

    // 3. Check for stock growth/price/company financial intent → OUT OF SCOPE
    const growthRegex = /growth|stock price|share price|target price|profit|revenue|quarterly results|eps|pe ratio|market cap|valuation of|performance of|how is\s+\w+\s+doing|will\s+\w+\s+go up|should i buy\s+\w+/i;
    if (growthRegex.test(messageText)) {
      setMessages(prev => [...prev, {
        text: `📊 I don't have live stock fundamentals or historical price data in my context. I can only access today's Economic Times market news.\n\nPlease ask me about:\n• Latest market news / headlines\n• Funding or IPO announcements\n• News summary and market discussion\n\nFor stock charts and prices, check the Stock Market page!`,
        sender: 'bot',
        timestamp: new Date()
      }]);
      setIsTyping(false);
      return;
    }

    // 4. Check for news summary intent
    const summaryRegex = /summarize|summary|market update|what happened today|market discussion|news analysis/i;
    const isNewsQuery = summaryRegex.test(messageText);

    // 5. Fallback: Use Gemini
    try {
      const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-pro-latest",
        generationConfig: {
          maxOutputTokens: 1500,
          temperature: 0.7,
          topP: 0.8,
          topK: 40,
        }
      });

      let prompt = messageText;
      if (isNewsQuery && newsItems.length > 0) {
        const newsContext = newsItems
          .slice(0, 6)
          .map((item, i) => `${i + 1}. ${item.title}\n   ${item.description?.substring(0, 200)}...`)
          .join('\n\n');
        
        prompt = `Latest Indian Stock Market News (Economic Times):\n\n${newsContext}\n\nInstruction: Act as a stock market analyst. Summarize the above news, highlight key market impacts, and provide actionable discussion points for Indian traders. Use bullet points. Also mention that these are from today's Economic Times feed.\n\nUser question: ${messageText}`;
      } else if (newsItems.length > 0 && messages.length < 2) {
        prompt = `[Context: You are an Indian stock market assistant. You only have access to today's Economic Times market news. If asked about stock prices, growth, or financial data, politely say it's out of scope and suggest checking the Stock Market page.]\n\nUser: ${messageText}`;
      }

      const chat = model.startChat({
        history: messages.map(msg => ({
          role: msg.sender === 'user' ? 'user' : 'model',
          parts: [{ text: msg.text }]
        }))
      });

      const result = await chat.sendMessage(prompt);
      const response = await result.response;
      const text = response.text();

      setMessages(prev => [...prev, {
        text: text,
        sender: 'bot',
        timestamp: new Date()
      }]);
    } catch (error: any) {
      console.error('Error:', error);
      let errorMessage = 'An error occurred while processing your request.';
      if (error.message?.includes('API key')) errorMessage = 'Invalid API key.';
      else if (error.message?.includes('404')) errorMessage = 'Model not found.';
      else if (error.message?.includes('quota')) errorMessage = 'API quota exceeded.';
      
      setApiError(errorMessage);
      setMessages(prev => [...prev, {
        text: "I'm having trouble connecting. Please try again later.",
        sender: 'bot',
        timestamp: new Date()
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      {/* Main Footer */}
      <footer className="bg-gray-900 text-gray-300 pt-16 pb-8">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Company Info */}
            <div>
              <h3 className="text-2xl font-bold text-white mb-4">
                <span className="text-blue-400">Virtual</span> Stock
              </h3>
              <p className="mb-4 text-gray-400">
                Your premier virtual stock trading platform. Learn, practice, and master trading without financial risk.
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
                   { label: "Help Center", icon: HelpCircle, url: "/contact" }
                ].map((link, i) => (
                  <motion.li key={i} whileHover={{ x: 5 }}>
                    <a href={link.url} className="flex items-center hover:text-blue-400 transition-colors duration-200">
                      <link.icon size={16} className="mr-2" />
                      <span>{link.label}</span>
                    </a>
                  </motion.li>
                ))}
              </ul>
            </div>

            {/* Contact Info */}
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

          {/* Bottom Footer */}
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

      {/* Chat Button */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setChatVisible(!chatVisible)}
        className="fixed bottom-6 right-6 bg-blue-600 text-white p-3 rounded-full shadow-lg z-50 flex items-center"
      >
        {chatVisible ? <X size={24} /> : <MessageSquare size={24} />}
      </motion.button>

      {/* Chat Window */}
      {chatVisible && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-24 right-6 w-96 bg-white rounded-lg shadow-2xl overflow-hidden z-50"
        >
          <div className="bg-blue-600 text-white p-4 flex justify-between items-center">
            <div className="flex items-center">
              <div className={`w-3 h-3 rounded-full mr-2 ${genAI ? 'bg-green-400' : 'bg-red-400'}`}></div>
              <h3 className="font-semibold">AI Trading Assistant</h3>
            </div>
            <button 
              onClick={() => setChatVisible(false)} 
              className="text-white hover:text-gray-200"
            >
              <X size={20} />
            </button>
          </div>
          
          {apiError && (
            <div className="bg-red-100 text-red-700 p-2 text-sm">
              {apiError}
            </div>
          )}
          
          <div className="h-96 bg-gray-50 p-4 overflow-y-auto">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-3">
                <MessageSquare size={48} className="mb-2" />
                <p className="text-center text-sm">Ask me about today's market news!</p>
                <div className="flex flex-col gap-2 w-full px-4">
                  <button
                    onClick={() => handleChatSubmit(undefined, "Summarize today's stock market news and provide discussion points")}
                    className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-200 transition-colors flex items-center justify-center gap-1"
                  >
                    <Newspaper size={14} /> Summarize Today's News
                  </button>
                  <button
                    onClick={() => handleChatSubmit(undefined, "Show me top 5 news")}
                    className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 transition-colors flex items-center justify-center gap-1"
                  >
                    <Newspaper size={14} /> Top 5 Headlines
                  </button>
                  <button
                    onClick={() => handleChatSubmit(undefined, "Which company raised funding recently?")}
                    className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 transition-colors flex items-center justify-center gap-1"
                  >
                    <TrendingUp size={14} /> Funding News
                  </button>
                </div>
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={index}
                  className={`mb-4 flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] p-3 rounded-lg ${
                      message.sender === 'user'
                        ? 'bg-blue-600 text-white rounded-br-none'
                        : 'bg-gray-200 text-gray-800 rounded-bl-none'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                    <span className="text-xs opacity-70 mt-1 block">
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))
            )}
            {isTyping && (
              <div className="flex justify-start mb-4">
                <div className="bg-gray-200 text-gray-800 p-3 rounded-lg rounded-bl-none max-w-[80%]">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={(e) => handleChatSubmit(e)} className="p-3 border-t border-gray-200 flex">
            <input
              type="text"
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 bg-gray-100 border border-gray-300 rounded-l-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={!genAI || isTyping}
            />
            <button
              type="submit"
              className="bg-blue-600 text-white px-4 py-2 rounded-r-lg hover:bg-blue-700 flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!genAI || isTyping || !chatMessage.trim()}
            >
              <Send size={18} />
            </button>
          </form>
        </motion.div>
      )}

      {/* Back to top button */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: showBackToTop ? 1 : 0 }}
        onClick={scrollToTop}
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