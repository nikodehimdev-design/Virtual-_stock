const Parser = require("rss-parser");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const parser = new Parser();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Simple keyword check to detect stock/finance intent
const isStockRelated = (question) => {
    const keywords = [
        "stock", "market", "share", "nse", "bse", "sensex", "nifty",
        "investor", "trading", "equity", "bull", "bear", "ipo", "fund",
        "portfolio", "dividend", "earnings", "profit", "loss", "rally",
        "crash", "sector", "bank", "finance", "economic", "growth", "gdp"
    ];
    const q = question.toLowerCase();
    return keywords.some(k => q.includes(k));
};

// Simple greeting detector
const isGreeting = (question) => {
    const greetings = ["hi", "hello", "hey", "good morning", "good afternoon", "good evening", "how are you", "what can you do"];
    const q = question.toLowerCase().trim();
    return greetings.some(g => q === g || q.startsWith(g + " "));
};

const fetchStockNews = async() => {
    const feed = await parser.parseURL(
        "https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms"
    );
    return feed.items.map((item, index) => ({
        index: index + 1,
        title: item.title,
        summary: item.contentSnippet || "",
        published: item.pubDate,
        link: item.link
    }));
};

const formatNewsForPrompt = (newsItems) => {
    return newsItems.map((item) => `
News ${item.index}
Title: ${item.title}
Summary: ${item.summary}
Published: ${item.published}
Link: ${item.link}
`).join("\n----------------------\n");
};

module.exports.getAIModel = async(req, res) => {
    try {
        const { question } = req.body;

        if (!question || typeof question !== "string") {
            return res.status(400).json({
                success: false,
                message: "Question is required and must be a string."
            });
        }

        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        let prompt;
        let responseFormat = "json"; // or "text"

        // Route 1: Greetings / General chat
        if (isGreeting(question)) {
            responseFormat = "text";
            prompt = `
You are a friendly AI Assistant specialized in Stock Markets and General News.
The user just greeted you. Respond warmly and briefly mention what you can help with:
- Stock market analysis and news
- Summarizing today's financial headlines
- Explaining market trends in simple terms
- General news queries

Keep it under 3 sentences. Be conversational. No JSON.
User: ${question}
`;
        }
        // Route 2: Stock/Finance questions → Structured JSON
        else if (isStockRelated(question)) {
            const newsItems = await fetchStockNews();
            const newsText = formatNewsForPrompt(newsItems);

            prompt = `
You are an expert AI Stock Market Analyst.

Below are the latest stock market news from Economic Times:
${newsText}

User Question: ${question}

Analyze the news and answer the question. Return ONLY valid JSON in this exact structure:

{
  "summary": "Brief overall answer to the user's question based on the news",
  "marketSentiment": "Bullish | Bearish | Neutral | Mixed",
  "topNews": [
    {
      "title": "News headline",
      "company": "Mentioned company name or 'Multiple/General'",
      "category": "Earnings | Policy | IPO | M&A | Global | Sector | General",
      "overview": "2-3 sentence summary",
      "importance": "High | Medium | Low",
      "investorImpact": "How this affects investors",
      "stockImpact": "Expected stock movement or sentiment",
      "published": "Date from the news"
    }
  ]
}

Rules:
- Return ONLY the JSON object. No markdown, no code blocks, no explanation.
- Include as many relevant news articles as possible (up to 10).
- If news is insufficient to answer, state that in the summary but still return the JSON.
`;
        }
        // Route 3: General news questions → Natural language
        else {
            const newsItems = await fetchStockNews();
            const newsText = formatNewsForPrompt(newsItems);

            responseFormat = "text";
            prompt = `
You are an AI News Assistant. The user asked a general question.

Here are some recent market news for context (use only if relevant):
${newsText}

User Question: ${question}

Provide a helpful, well-structured answer. If the question is not related to the provided news, answer based on your knowledge but mention that you're primarily a financial news assistant. Do not return JSON. Use clear formatting.
`;
        }

        const result = await model.generateContent(prompt);
        let responseText = result.response.text().trim();

        // Clean up markdown code blocks if Gemini ignores instructions
        if (responseText.startsWith("```json")) {
            responseText = responseText.replace(/```json\s*/, "").replace(/```\s*$/, "").trim();
        } else if (responseText.startsWith("```")) {
            responseText = responseText.replace(/```\s*/, "").replace(/```\s*$/, "").trim();
        }

        // Parse JSON if expected
        let parsedAnswer = responseText;
        if (responseFormat === "json") {
            try {
                parsedAnswer = JSON.parse(responseText);
            } catch (parseError) {
                console.error("JSON Parse Error:", parseError.message);
                console.error("Raw response:", responseText);
                // Fallback: return raw text with a warning
                return res.status(200).json({
                    success: true,
                    question,
                    answer: responseText,
                    warning: "Model returned non-JSON output. Displaying raw response.",
                    format: "text"
                });
            }
        }

        res.status(200).json({
            success: true,
            question,
            answer: parsedAnswer,
            format: responseFormat
        });

    } catch (error) {
        console.error("Controller Error:", error);
        res.status(500).json({
            success: false,
            message: "Something went wrong.",
            error: error.message
        });
    }
};