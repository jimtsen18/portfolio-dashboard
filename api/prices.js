const FINNHUB_KEY = "d8t8rvpr01qhcnk0oh6gd8t8rvpr01qhcnk0oh70";

// Fetch US stock price from Finnhub
async function fetchUSPrice(symbol) {
  const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finnhub error ${res.status} for ${symbol}`);
  const data = await res.json();
  // c = current price
  if (!data.c || data.c === 0) return null;
  return data.c;
}

// Fetch TW stock price from TWSE API
async function fetchTWPrice(symbol) {
  // TWSE uses format like 2330 for stocks, 0056 for ETFs
  const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_${symbol}.tw&json=1&delay=0`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  if (!res.ok) throw new Error(`TWSE error ${res.status} for ${symbol}`);
  const data = await res.json();
  const info = data?.msgArray?.[0];
  if (!info) return null;
  // z = current price, y = yesterday close (fallback)
  const price = parseFloat(info.z !== "-" ? info.z : info.y);
  return isNaN(price) ? null : price;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const { symbols } = req.query;
  if (!symbols) return res.status(400).json({ error: "Missing symbols" });

  const symbolList = symbols.split(",").map(s => s.trim()).filter(Boolean);

  // Detect TW vs US: TW symbols start with digits
  const twSymbols = symbolList.filter(s => /^\d/.test(s));
  const usSymbols = symbolList.filter(s => !/^\d/.test(s));

  const prices = {};
  const errors = [];

  // Fetch TW prices (parallel)
  await Promise.all(twSymbols.map(async sym => {
    try {
      const price = await fetchTWPrice(sym);
      if (price) prices[sym] = price;
    } catch (e) {
      errors.push(`${sym}: ${e.message}`);
    }
  }));

  // Fetch US prices (parallel)
  await Promise.all(usSymbols.map(async sym => {
    try {
      const price = await fetchUSPrice(sym);
      if (price) prices[sym] = price;
    } catch (e) {
      errors.push(`${sym}: ${e.message}`);
    }
  }));

  res.status(200).json({
    prices,
    updatedAt: new Date().toISOString(),
    matched: Object.keys(prices).length,
    total: symbolList.length,
    errors: errors.length > 0 ? errors : undefined
  });
}
