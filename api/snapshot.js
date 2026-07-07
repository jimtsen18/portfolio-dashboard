import admin from "firebase-admin";

// Init Firebase Admin (singleton)
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}
const db = admin.firestore();

const FINNHUB_KEY = "d8t8rvpr01qhcnk0oh6gd8t8rvpr01qhcnk0oh70";

async function fetchUSPrice(symbol) {
  const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_KEY}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.c && data.c !== 0 ? data.c : null;
}

async function fetchTWPrice(symbol) {
  const res = await fetch(`https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_${symbol}.tw&json=1&delay=0`, {
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  if (!res.ok) return null;
  const data = await res.json();
  const info = data?.msgArray?.[0];
  if (!info) return null;
  const price = parseFloat(info.z !== "-" ? info.z : info.y);
  return isNaN(price) ? null : price;
}

async function fetchFxRate() {
  try {
    const res = await fetch("https://v6.exchangerate-api.com/v6/freekey/latest/USD");
    const data = await res.json();
    return data?.conversion_rates?.TWD || 32.5;
  } catch { return 32.5; }
}

export default async function handler(req, res) {
  // 驗證 cron secret 防止未授權呼叫
  if (req.headers["authorization"] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // 取得所有用戶
    const usersSnap = await db.collection("users").get();
    const results = [];

    for (const userDoc of usersSnap.docs) {
      const uid = userDoc.id;
      try {
        // 取得該用戶的交易紀錄
        const tradesSnap = await db.collection("users").doc(uid).collection("portfolio_trades").get();
        const trades = tradesSnap.docs.map(d => d.data());
        if (trades.length === 0) continue;

        // 收集所有標的
        const symbols = [...new Set(trades.map(t => t.symbol))];
        const twSymbols = symbols.filter(s => /^\d/.test(s));
        const usSymbols = symbols.filter(s => !/^\d/.test(s));

        // 抓報價
        const prices = {};
        await Promise.all([
          ...twSymbols.map(async sym => {
            const p = await fetchTWPrice(sym);
            if (p) prices[sym] = p;
          }),
          ...usSymbols.map(async sym => {
            const p = await fetchUSPrice(sym);
            if (p) prices[sym] = p;
          }),
        ]);

        // 抓匯率
        const usdTwd = await fetchFxRate();

        // 計算持倉
        const map = {};
        const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
        sorted.forEach(t => {
          if (!map[t.symbol]) map[t.symbol] = { symbol: t.symbol, market: t.market, shares: 0, totalBuyCost: 0 };
          const pos = map[t.symbol];
          if (t.type === "buy" || !t.type) {
            const cost = t.isAdjustment && t.totalCost != null ? t.totalCost : t.shares * t.price + (t.fee || 0);
            pos.shares += t.shares;
            pos.totalBuyCost += cost;
          } else if (t.type === "sell") {
            pos.shares -= t.shares;
          }
        });

        // 計算總市值和總成本
        let totalMarketValue = 0, totalCost = 0;
        Object.values(map).forEach(pos => {
          if (pos.shares <= 0) return;
          const price = prices[pos.symbol] || 0;
          const mv = pos.shares * price;
          totalMarketValue += pos.market === "US" ? mv * usdTwd : mv;
          totalCost += pos.market === "US" ? pos.totalBuyCost * usdTwd : pos.totalBuyCost;
        });

        if (totalMarketValue > 0) {
          const today = new Date().toISOString().slice(0, 10);
          await db.collection("users").doc(uid).collection("portfolio_snapshots").doc(today).set({
            date: today,
            marketValue: Math.round(totalMarketValue),
            totalCost: Math.round(totalCost),
          });
          results.push({ uid, date: today, marketValue: Math.round(totalMarketValue) });
        }
      } catch (e) {
        results.push({ uid, error: e.message });
      }
    }

    res.status(200).json({ ok: true, processed: results.length, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
