export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const { symbols } = req.query;
  if (!symbols) return res.status(400).json({ error: "Missing symbols" });

  const symbolList = symbols.split(",").map(s => s.trim());
  const yahooSymbols = symbolList.map(s =>
    /^\d/.test(s) ? `${s}.TW` : s
  ).join(",");

  try {
    // Step 1: get crumb
    const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://finance.yahoo.com/",
        "Cookie": "tbla_id=; GUC=AQABCAFn; A1=d=AQABB; A3=d=AQABB",
      }
    });
    const crumb = await crumbRes.text();

    // Step 2: fetch quotes with crumb
    const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${yahooSymbols}&crumb=${encodeURIComponent(crumb.trim())}`;
    const quoteRes = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://finance.yahoo.com/",
        "Cookie": "tbla_id=; GUC=AQABCAFn; A1=d=AQABB; A3=d=AQABB",
      }
    });

    if (!quoteRes.ok) throw new Error(`Yahoo API error: ${quoteRes.status}`);
    const data = await quoteRes.json();
    const quotes = data?.quoteResponse?.result || [];

    if (quotes.length === 0) throw new Error("No quotes returned");

    const prices = {};
    quotes.forEach(q => {
      const sym = q.symbol.replace(".TW", "");
      if (q.regularMarketPrice) prices[sym] = q.regularMarketPrice;
    });

    res.status(200).json({ prices, updatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
