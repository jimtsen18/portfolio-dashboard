export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const { symbols } = req.query;
  if (!symbols) return res.status(400).json({ error: "Missing symbols" });

  // Convert TW symbols: 2330 → 2330.TW, 00919 → 00919.TW
  // US symbols stay as-is: AAPL → AAPL
  const TW_SYMBOLS = ["00919","006208","2330","0056","00878"];
  
  const symbolList = symbols.split(",").map(s => s.trim());
  const yahooSymbols = symbolList.map(s => 
    TW_SYMBOLS.includes(s) || /^\d/.test(s) ? `${s}.TW` : s
  ).join(",");

  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${yahooSymbols}&fields=regularMarketPrice,symbol`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json",
      }
    });

    if (!response.ok) throw new Error(`Yahoo API error: ${response.status}`);
    const data = await response.json();
    const quotes = data?.quoteResponse?.result || [];

    const prices = {};
    quotes.forEach(q => {
      // Strip .TW suffix to match our internal symbol format
      const sym = q.symbol.replace(".TW", "");
      if (q.regularMarketPrice) prices[sym] = q.regularMarketPrice;
    });

    res.status(200).json({ prices, updatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
