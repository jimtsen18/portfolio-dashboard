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

        // Last-known prices from Firestore act as a fallback whenever
        // today's live fetch fails for a symbol (TWSE/Finnhub are flaky).
        // Without this, a single failed fetch used to make that entire
        // position silently vanish from the snapshot — dragging both
        // marketValue AND totalCost down for the whole portfolio.
        const lastKnownSnap = await db.collection("users").doc(uid).collection("portfolio_prices").get();
        const lastKnown = {};
        lastKnownSnap.docs.forEach(d => {
          const data = d.data();
          lastKnown[data.symbol] = data.price;
        });

        const prices = {};
        await Promise.all([
          ...twSymbols.map(async sym => {
            const live = await fetchTWPrice(sym);
            prices[sym] = live || lastKnown[sym] || 0;
          }),
          ...usSymbols.map(async sym => {
            const live = await fetchUSPrice(sym);
            prices[sym] = live || lastKnown[sym] || 0;
          }),
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
        const missingPriceSymbols = [];
        Object.values(map).forEach(pos => {
          if (pos.shares <= 0) return;
          const price = prices[pos.symbol] || 0;
          if (price === 0) missingPriceSymbols.push(pos.symbol);
          const mv = pos.shares * price;
          totalMarketValue += pos.market === "US" ? mv * usdTwd : mv;
          // Cost basis must never depend on whether today's price fetch
          // succeeded — a held position always has a cost, priced or not.
          totalCost += pos.market === "US" ? pos.totalBuyCost * usdTwd : pos.totalBuyCost;
        });

        // Safety net: if we truly have no price anywhere (no live fetch
        // AND no last-known fallback) for a held symbol, don't write a
        // partial/corrupted snapshot for the whole portfolio today — skip
        // and let the next successful sync (cron or manual) fill it in.
        if (missingPriceSymbols.length > 0) {
          results.push({ uid, skipped: true, reason: `no price available for: ${missingPriceSymbols.join(", ")}` });
          continue;
        }

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
