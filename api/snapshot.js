import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();

const FINNHUB_KEY = "d8t8rvpr01qhcnk0oh6gd8t8rvpr01qhcnk0oh70";

async function fetchUSPrice(symbol) {
  try {
    const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_KEY}`);
    const data = await res.json();
    return data.c && data.c !== 0 ? data.c : null;
  } catch { return null; }
}

async function fetchTWPrice(symbol) {
  try {
    const res = await fetch(`https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_${symbol}.tw&json=1&delay=0`,
      { headers: { "User-Agent": "Mozilla/5.0" } });
    const data = await res.json();
    const info = data?.msgArray?.[0];
    if (!info) return null;
    const price = parseFloat(info.z !== "-" ? info.z : info.y);
    return isNaN(price) ? null : price;
  } catch { return null; }
}

async function fetchFxRate() {
  try {
    const res = await fetch("https://v6.exchangerate-api.com/v6/freekey/latest/USD");
    const data = await res.json();
    return data?.conversion_rates?.TWD || 32.5;
  } catch { return 32.5; }
}

export default async function handler(req, res) {
  if (req.headers["authorization"] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // 用 collectionGroup 跨所有用戶抓 portfolio_trades
    const tradesSnap = await db.collectionGroup("portfolio_trades").get();

    // 依 uid 分組
    const userTrades = {};
    tradesSnap.docs.forEach(d => {
      // path: users/{uid}/portfolio_trades/{tradeId}
      const uid = d.ref.path.split("/")[1];
      if (!userTrades[uid]) userTrades[uid] = [];
      userTrades[uid].push(d.data());
    });

    const usdTwd = await fetchFxRate();
    const results = [];

    for (const [uid, trades] of Object.entries(userTrades)) {
      try {
        const symbols = [...new Set(trades.map(t => t.symbol))];
        const twSymbols = symbols.filter(s => /^\d/.test(s));
        const usSymbols = symbols.filter(s => !/^\d/.test(s));

        const prices = {};
        await Promise.all([
          ...twSymbols.map(async sym => { const p = await fetchTWPrice(sym); if (p) prices[sym] = p; }),
          ...usSymbols.map(async sym => { const p = await fetchUSPrice(sym); if (p) prices[sym] = p; }),
        ]);

        // 計算持倉
        const map = {};
        [...trades].sort((a, b) => a.date.localeCompare(b.date)).forEach(t => {
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

        let totalMarketValue = 0, totalCost = 0;
        Object.values(map).forEach(pos => {
          if (pos.shares <= 0) return;
          const price = prices[pos.symbol] || 0;
          if (price === 0) return;
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
