// ─────────────────────────────────────────────────────────────────────────────
// Dual-Engine Investment Portfolio Dashboard
// Firebase Firestore Edition — real-time sync across Mac & iPhone
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line
} from "recharts";

// ─── FIREBASE ────────────────────────────────────────────────────────────────
import { initializeApp }                            from "firebase/app";
import { getAnalytics, logEvent }                    from "firebase/analytics";
import {
  getFirestore, collection, doc,
  onSnapshot, setDoc, deleteDoc, writeBatch, getDocs
} from "firebase/firestore";
import {
  getAuth, onAuthStateChanged, getRedirectResult,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, updateProfile,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, 
  
} from "firebase/auth";

const firebaseConfig = {
  apiKey:            "AIzaSyBRPfLFC83OvvoXBktXuZU7YXfcGnB28qs",
  authDomain:        "my-portfolio-db-76f01.firebaseapp.com",
  projectId:         "my-portfolio-db-76f01",
  storageBucket:     "my-portfolio-db-76f01.firebasestorage.app",
  messagingSenderId: "901809095318",
  appId:             "1:901809095318:web:e26c19fba2ed4896c5b8b7",
  measurementId:     "G-P6YC4DR214",
};

const fbApp     = initializeApp(firebaseConfig);
const db        = getFirestore(fbApp);
const auth      = getAuth(fbApp);
const analytics = getAnalytics(fbApp);
const googleProvider = new GoogleAuthProvider();

// Firestore collection names — now nested under users/{uid}/...
const userCol = (uid, name) => collection(db, "users", uid, name);
const userDoc = (uid, name, id) => doc(db, "users", uid, name, id);

const COL_TRADES    = "portfolio_trades";
const COL_DIVIDENDS = "portfolio_dividends";
const COL_PRICES    = "portfolio_prices";
const COL_META      = "portfolio_meta";
const COL_SNAPSHOTS = "portfolio_snapshots"; // daily market value history

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const TW_STOCKS = ["00919", "006208", "2330", "0056", "00878"];
const US_STOCKS = ["AAPL", "GOOGL", "INTC", "MSFT", "QQQM", "TSLA", "TSLL"];
const USD_TWD_FALLBACK = 32.5; // used if live FX fetch fails

const SEED_PRICES = {
  "00919": 52.30, "006208": 103.20, "2330": 985.00, "0056": 33.45, "00878": 21.80,
  "AAPL": 213.50, "GOOGL": 178.20, "INTC": 21.40,  "MSFT": 452.80, "QQQM": 198.60,
  "TSLA": 248.30, "TSLL": 14.20,
};

const PALETTE = [
  "#38bdf8","#a78bfa","#34d399","#f472b6","#fb923c",
  "#facc15","#60a5fa","#f87171","#4ade80","#c084fc","#fb7185","#67e8f9",
];

const PERIOD_OPTIONS = [
  { label: "1M",  days: 30   },
  { label: "6M",  days: 183  },
  { label: "YTD", days: null },
  { label: "1Y",  days: 365  },
  { label: "5Y",  days: 1826 },
  { label: "ALL", days: null },
];

// ─── SEED DATA (written to Firestore on first load if collection is empty) ───
const SEED_TRADES = [
  { id:"t1",  type:"buy",  symbol:"2330",   market:"TW", date:"2023-06-15", shares:5,   price:540.00, fee:77  },
  { id:"t2",  type:"buy",  symbol:"00919",  market:"TW", date:"2023-09-01", shares:100, price:48.20,  fee:24  },
  { id:"t3",  type:"buy",  symbol:"006208", market:"TW", date:"2024-01-10", shares:50,  price:95.60,  fee:24  },
  { id:"t4",  type:"buy",  symbol:"AAPL",   market:"US", date:"2023-07-20", shares:10,  price:185.54, fee:0   },
  { id:"t5",  type:"buy",  symbol:"MSFT",   market:"US", date:"2023-11-05", shares:5,   price:368.40, fee:0   },
  { id:"t6",  type:"buy",  symbol:"QQQM",   market:"US", date:"2024-02-14", shares:20,  price:178.90, fee:0   },
  { id:"t7",  type:"buy",  symbol:"TSLA",   market:"US", date:"2024-03-20", shares:8,   price:175.20, fee:0   },
  { id:"t8",  type:"buy",  symbol:"0056",   market:"TW", date:"2024-04-01", shares:200, price:31.20,  fee:31  },
  { id:"t9",  type:"buy",  symbol:"00878",  market:"TW", date:"2024-05-10", shares:300, price:20.10,  fee:30  },
  { id:"t10", type:"sell", symbol:"TSLA",   market:"US", date:"2024-09-05", shares:3,   price:248.75, fee:0   },
  { id:"t11", type:"sell", symbol:"0056",   market:"TW", date:"2024-10-15", shares:50,  price:34.20,  fee:51  },
];

const SEED_DIVS = [
  { id:"d1", symbol:"00919", market:"TW", date:"2024-01-20", perShare:1.00, sharesHeld:100, totalAmount:450   },
  { id:"d2", symbol:"0056",  market:"TW", date:"2024-02-20", perShare:0.92, sharesHeld:200, totalAmount:1240  },
  { id:"d3", symbol:"00878", market:"TW", date:"2024-03-20", perShare:0.42, sharesHeld:300, totalAmount:840   },
  { id:"d4", symbol:"AAPL",  market:"US", date:"2024-02-15", perShare:0.24, sharesHeld:10,  totalAmount:268.0 },
  { id:"d5", symbol:"MSFT",  market:"US", date:"2024-03-15", perShare:0.75, sharesHeld:5,   totalAmount:121.9 },
  { id:"d6", symbol:"2330",  market:"TW", date:"2024-07-15", perShare:320,  sharesHeld:5,   totalAmount:1600  },
  { id:"d7", symbol:"00919", market:"TW", date:"2024-07-20", perShare:1.30, sharesHeld:100, totalAmount:520   },
  { id:"d8", symbol:"0056",  market:"TW", date:"2024-08-20", perShare:1.15, sharesHeld:200, totalAmount:1380  },
];

// ─── YAHOO FINANCE API (via Vercel Serverless proxy) ─────────────────────────
const fetchPricesFromAPI = async (allSymbols) => {
  if (allSymbols.length === 0) return { updated: {}, matchCount: 0, total: 0 };
  const res = await fetch(`/api/prices?symbols=${allSymbols.join(",")}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  const updated = data.prices || {};
  const matchCount = Object.keys(updated).length;
  return { updated, matchCount, total: allSymbols.length };
};

// ─── CALC HELPERS ─────────────────────────────────────────────────────────────
const buildPositions = (trades) => {
  const map = {};
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  sorted.forEach(t => {
    const sym = t.symbol;
    if (!map[sym]) map[sym] = { symbol: sym, market: t.market, shares: 0, totalBuyCost: 0, realizedGain: 0, lots: [] };
    const pos = map[sym];
    if (t.type === "buy" || !t.type) {
      const costPerShare = (t.shares * t.price + (t.fee || 0)) / t.shares;
      pos.lots.push({ shares: t.shares, price: costPerShare });
      pos.shares       += t.shares;
      pos.totalBuyCost += t.shares * costPerShare;
    } else if (t.type === "sell") {
      let remainToSell = t.shares;
      let costOfSold = 0;
      while (remainToSell > 0 && pos.lots.length > 0) {
        const lot = pos.lots[0];
        if (lot.shares <= remainToSell) {
          costOfSold += lot.shares * lot.price;
          remainToSell -= lot.shares;
          pos.lots.shift();
        } else {
          costOfSold += remainToSell * lot.price;
          lot.shares -= remainToSell;
          remainToSell = 0;
        }
      }
      pos.realizedGain += t.shares * t.price - (t.fee || 0) - costOfSold;
      pos.shares       -= t.shares;
      pos.totalBuyCost  = pos.lots.reduce((s, l) => s + l.shares * l.price, 0);
      if (pos.shares < 0)       pos.shares = 0;
      if (pos.totalBuyCost < 0) pos.totalBuyCost = 0;
    }
  });
  return Object.values(map).map(p => ({
    ...p,
    wac: p.shares > 0 ? Math.round((p.totalBuyCost / p.shares) * 1e6) / 1e6 : 0,
  })).filter(p => p.shares > 0 || p.realizedGain !== 0);
};

// ─── UTILS ───────────────────────────────────────────────────────────────────
const fmt     = (n, dec = 0) => {
  if (n == null || isNaN(n)) return "—";
  return new Intl.NumberFormat("zh-TW", { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n);
};
const fmtPct  = (n)        => (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
const fmtSign = (n, dec=0) => (n >= 0 ? "+" : "") + fmt(n, dec);
const ytdStart = ()  => new Date(new Date().getFullYear(), 0, 1);
const daysAgo  = (d) => { const t = new Date(); t.setDate(t.getDate() - d); return t; };
const toTWD = (v, market, rate = USD_TWD_FALLBACK) => market === "US" ? v * rate : v;

// ─── LIVE EXCHANGE RATE (exchangerate-api.com, free open endpoint) ──────────
const FX_API_URL = "https://open.er-api.com/v6/latest/USD";

const fetchUsdTwdRate = async () => {
  const res = await fetch(FX_API_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const rate = data?.rates?.TWD;
  if (!rate || isNaN(rate)) throw new Error("回應中缺少 TWD 匯率");
  return rate;
};

const filterByPeriod = (items, period, yearFilter = null) => {
  if (yearFilter) {
    const start = new Date(`${yearFilter}-01-01`);
    const end   = new Date(`${yearFilter}-12-31T23:59:59`);
    return items.filter(i => { const d = new Date(i.date); return d >= start && d <= end; });
  }
  if (period.label === "ALL") return items;
  const cutoff = period.label === "YTD" ? ytdStart() : daysAgo(period.days);
  return items.filter(i => new Date(i.date) >= cutoff);
};

const groupByMonth = (items) => {
  const map = {};
  items.forEach(i => { const k = i.date.slice(0, 7); map[k] = (map[k] || 0) + (i.amount || 0); });
  return Object.entries(map).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => ({ month: k, value: Math.round(v) }));
};

// ─── SHARED STYLES ────────────────────────────────────────────────────────────
const INP = { background:"#0f1422", border:"1px solid #2a3045", borderRadius:6, color:"#e2e8f0", padding:"6px 10px", fontSize:13, width:"100%" };
const LBL = { color:"#6b7a99", fontSize:11, marginBottom:4 };

// ─── SMALL COMPONENTS ────────────────────────────────────────────────────────
const KPICard = ({ label, value, sub, color="#38bdf8" }) => (
  <div style={{ background:"#1a1f2e", border:"1px solid #2a3045", borderRadius:12, padding:"16px 20px", minWidth:0, height:"100%", boxSizing:"border-box" }}>
    <div style={{ fontSize:11, color:"#6b7a99", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:6 }}>{label}</div>
    <div style={{ fontSize:22, fontWeight:700, color, letterSpacing:"-0.5px" }}>{value}</div>
    {sub && <div style={{ fontSize:12, color:"#6b7a99", marginTop:4 }}>{sub}</div>}
  </div>
);

const Badge = ({ children, color }) => (
  <span style={{ background:color+"22", color, border:`1px solid ${color}44`, borderRadius:6, padding:"2px 8px", fontSize:11, fontWeight:600 }}>
    {children}
  </span>
);

const TypeBadge = ({ type }) => (
  <Badge color={type==="sell"?"#f87171":"#34d399"}>{type==="sell"?"賣出":"買入"}</Badge>
);

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:"#e2e8f0", border:"1px solid #94a3b8", borderRadius:8, color:"#1a202c", padding:"10px 14px", fontSize:12 }}>
      <div style={{ color:"#8892a8", marginBottom:4 }}>{label}</div>
      {payload.map((p, i) => <div key={i} style={{ color:p.color||"#38bdf8" }}>{p.name}: {fmt(p.value,0)}</div>)}
    </div>
  );
};

// ─── LOADING SCREEN ───────────────────────────────────────────────────────────
const LoadingScreen = ({ status }) => (
  <div style={{ background:"#0b0f1a", minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:20 }}>
    <style>{`
  @keyframes spin{to{transform:rotate(360deg)}}
  .kpi-grid-4 { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:12px; }
  .kpi-grid-2 { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:24px; }
  .chart-grid  { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
  .app-wrap    { background:#0b0f1a; min-height:100vh; color:#e2e8f0; font-family:'Inter','Segoe UI',system-ui,sans-serif; padding:24px 32px; }
  @media(max-width:768px){
    .kpi-all    { display:flex !important; flex-direction:column !important; gap:8px !important; margin-bottom:16px !important; }
    .kpi-order-1 { order:1; }
    .kpi-order-2 { order:2; }
    .kpi-order-3 { order:3; }
    .kpi-order-4 { order:4; }
    .kpi-order-5 { order:5; }
    .kpi-order-6 { order:6; }
    .chart-grid  { grid-template-columns:1fr !important; }
    .app-wrap    { padding:16px 12px !important; }
  }
`}</style>
    <div style={{ width:48, height:48, border:"3px solid #1e2535", borderTopColor:"#38bdf8", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
    <div style={{ fontSize:18, fontWeight:700, background:"linear-gradient(135deg,#38bdf8,#a78bfa)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
      Dual-Engine Portfolio
    </div>
    <div style={{ color:"#4a5568", fontSize:13 }}>{status}</div>
  </div>
);

// ─── LOGIN SCREEN ─────────────────────────────────────────────────────────────
const LoginScreen = () => {
  const [mode, setMode]       = useState("login"); // "login" | "signup"
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [name, setName]       = useState("");
  const [err, setErr]         = useState("");
  const [busy, setBusy]       = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  const friendlyError = (code) => ({
    "auth/invalid-email":            "Email 格式不正確",
    "auth/user-not-found":           "找不到此帳號，請先註冊",
    "auth/wrong-password":           "密碼錯誤",
    "auth/invalid-credential":       "帳號或密碼錯誤",
    "auth/email-already-in-use":     "此 Email 已被註冊，請改用登入",
    "auth/weak-password":            "密碼至少需要 6 個字元",
    "auth/operation-not-allowed":    "此登入方式尚未在 Firebase 後台啟用（請到 Authentication → Sign-in method 開啟）",
    "auth/network-request-failed":   "網路連線失敗，請檢查網路",
    "auth/too-many-requests":        "嘗試次數過多，請稍後再試",
    "auth/configuration-not-found":  "Firebase Authentication 尚未設定完成",
    "auth/popup-closed-by-user":     "登入視窗已關閉，請再試一次",
    "auth/popup-blocked":            "瀏覽器阻擋了登入彈出視窗，正改用整頁跳轉方式…",
    "auth/cancelled-popup-request":  "登入已取消",
    "auth/unauthorized-domain":      "此網域尚未在 Firebase 授權網域清單中（Authentication → Settings → Authorized domains）",
  }[code] || `發生錯誤（${code || "未知錯誤"}），請再試一次`);

  const handleSubmit = async () => {
    setErr("");
    if (!email.trim() || !password) { setErr("請輸入 Email 與密碼"); return; }
    setBusy(true);
    try {
      if (mode === "signup") {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() });
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (e) {
      console.error("Firebase Auth error:", e.code, e.message);
      setErr(friendlyError(e.code));
    }
    setBusy(false);
  };

  const handleGoogleSignIn = async () => {
    setErr("");
    setGoogleBusy(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      console.error("Google Sign-In error:", e.code, e.message);
      if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") {
        setErr(friendlyError(e.code));
      }
      setGoogleBusy(false);
    }
  };

  return (
    <div style={{ background:"#0b0f1a", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", padding:20, fontFamily:"'Inter','Segoe UI',system-ui,sans-serif" }}>
      <div style={{ width:380, background:"#1a1f2e", border:"1px solid #2a3045", borderRadius:16, padding:32 }}>
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{ fontSize:22, fontWeight:800, background:"linear-gradient(135deg,#38bdf8,#a78bfa)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
            Dual-Engine Portfolio
          </div>
          <div style={{ color:"#4a5568", fontSize:12, marginTop:4 }}>登入以存取你的雲端投資紀錄</div>
        </div>

        {/* ── Google Sign-In ── */}
        <button onClick={handleGoogleSignIn} disabled={googleBusy}
          style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:10,
            background:"#fff", border:"none", borderRadius:8, color:"#1f2937",
            padding:"10px 0", fontWeight:600, cursor:"pointer", fontSize:14,
            opacity: googleBusy ? 0.7 : 1, marginBottom:18 }}>
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.61z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.87-3.04.87-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18z"/>
            <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.69 9c0-.6.1-1.18.28-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"/>
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.59-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
          </svg>
          {googleBusy ? "登入中…" : "使用 Google 帳號登入"}
        </button>

        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:18 }}>
          <div style={{ flex:1, height:1, background:"#2a3045" }} />
          <span style={{ color:"#4a5568", fontSize:11 }}>或使用 Email</span>
          <div style={{ flex:1, height:1, background:"#2a3045" }} />
        </div>

        <div style={{ display:"flex", background:"#0f1422", borderRadius:8, border:"1px solid #2a3045", overflow:"hidden", marginBottom:20 }}>
          {[["login","登入"],["signup","註冊新帳號"]].map(([m,l]) => (
            <button key={m} onClick={() => { setMode(m); setErr(""); }}
              style={{ flex:1, padding:"8px 0", border:"none", cursor:"pointer", fontWeight:700, fontSize:13,
                background: mode===m ? "#1e3a5f" : "transparent",
                color: mode===m ? "#38bdf8" : "#6b7a99" }}>
              {l}
            </button>
          ))}
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {mode === "signup" && (
            <div>
              <div style={LBL}>顯示名稱（選填）</div>
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="你的名字" style={INP}
                onKeyDown={e => e.key==="Enter" && handleSubmit()} />
            </div>
          )}
          <div>
            <div style={LBL}>Email</div>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" style={INP}
              onKeyDown={e => e.key==="Enter" && handleSubmit()} />
          </div>
          <div>
            <div style={LBL}>密碼</div>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="至少 6 個字元" style={INP}
              onKeyDown={e => e.key==="Enter" && handleSubmit()} />
          </div>
        </div>

        {err && <div style={{ color:"#f87171", fontSize:12, marginTop:10 }}>{err}</div>}

        <button onClick={handleSubmit} disabled={busy}
          style={{ marginTop:18, width:"100%", background:"linear-gradient(135deg,#1e40af,#7c3aed)", border:"none", borderRadius:8, color:"#fff",
            padding:"11px 0", fontWeight:700, cursor:"pointer", fontSize:14, opacity:busy?0.6:1 }}>
          {busy ? "處理中…" : mode==="signup" ? "建立帳號並登入" : "登入"}
        </button>

        <div style={{ marginTop:16, padding:"10px 14px", background:"#0f1422", borderRadius:8, border:"1px solid #2a3045", fontSize:11, color:"#4a5568" }}>
          🔒 每個帳號的投資紀錄完全獨立，不會與其他使用者共享。註冊新帳號即可開始建立你自己的雲端投資組合。
        </div>
      </div>
    </div>
  );
};

// ─── ADD TRADE FORM ───────────────────────────────────────────────────────────
const AddTradeForm = ({ onAdd }) => {
  const blank = { type:"buy", symbol:"", market:"TW", date:new Date().toISOString().slice(0,10), shares:"", price:"", fee:"0" };
  const [f, setF]   = useState(blank);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }));

  const handleAdd = async () => {
    if (!f.symbol.trim() || !f.shares || !f.price) { setErr("請填寫股票代號、股數及單價"); return; }
    setSaving(true);
    await onAdd({
      id: "t" + Date.now(),
      type: f.type,
      symbol: f.symbol.toUpperCase().trim(),
      market: f.market,
      date: f.date,
      shares: parseFloat(f.shares),
      price: parseFloat(parseFloat(f.price).toFixed(2)),
      fee: parseFloat(f.fee) || 0,
    });
    setF(blank); setErr(""); setSaving(false);
  };

  const isSell = f.type === "sell";
  return (
    <div style={{ background:"#1a1f2e", border:"1px solid #2a3045", borderRadius:12, padding:20 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
        <span style={{ color:"#a78bfa", fontWeight:700, fontSize:14 }}>＋ 新增交易紀錄</span>
        <div style={{ display:"flex", background:"#0f1422", borderRadius:8, border:"1px solid #2a3045", overflow:"hidden" }}>
          {["buy","sell"].map(t => (
            <button key={t} onClick={() => setF(p => ({ ...p, type:t }))}
              style={{ padding:"5px 16px", border:"none", cursor:"pointer", fontWeight:700, fontSize:12,
                background: f.type===t ? (t==="buy"?"#052e16":"#2d1515") : "transparent",
                color: f.type===t ? (t==="buy"?"#34d399":"#f87171") : "#6b7a99" }}>
              {t==="buy"?"買入 Buy":"賣出 Sell"}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
        <div><div style={LBL}>股票代號</div><input value={f.symbol} onChange={set("symbol")} placeholder="2330 / AAPL" style={INP} /></div>
        <div><div style={LBL}>市場</div>
          <select value={f.market} onChange={set("market")} style={INP}>
            <option value="TW">🇹🇼 台股</option>
            <option value="US">🇺🇸 美股</option>
          </select>
        </div>
        <div><div style={LBL}>交易日期</div><input type="date" value={f.date} onChange={set("date")} style={INP} /></div>
        <div><div style={LBL}>{isSell?"賣出股數":"購入股數"}</div><input type="number" step="0.00001" value={f.shares} onChange={set("shares")} placeholder="100" style={INP} /></div>
        <div><div style={LBL}>{isSell?"賣出單價":"買入單價"}（精確至分）</div><input type="number" step="0.01" value={f.price} onChange={set("price")} placeholder="0.00" style={INP} /></div>
        <div><div style={LBL}>{isSell?"手續費+稅金":"手續費"}</div><input type="number" step="0.01" value={f.fee} onChange={set("fee")} placeholder="0" style={INP} /></div>
      </div>
      {err && <div style={{ color:"#f87171", fontSize:12, marginTop:8 }}>{err}</div>}
      <button onClick={handleAdd} disabled={saving}
        style={{ marginTop:14, background:isSell?"#2d1515":"#0d2e1a", border:`1px solid ${isSell?"#f87171":"#34d399"}`,
          borderRadius:8, color:isSell?"#f87171":"#34d399", padding:"8px 24px", fontWeight:700, cursor:"pointer", fontSize:13,
          opacity: saving ? 0.6 : 1 }}>
        {saving ? "儲存中…" : (isSell?"確認賣出":"確認買入")}
      </button>
    </div>
  );
};

// ─── ADD DIVIDEND FORM ────────────────────────────────────────────────────────
const AddDivForm = ({ onAdd, positions }) => {
  const blank = { symbol:"", market:"TW", date:new Date().toISOString().slice(0,10), perShare:"", sharesHeld:"", totalAmount:"" };
  const [f, setF]       = useState(blank);
  const [autoCalc, setAutoCalc] = useState(true);
  const [saving, setSaving]     = useState(false);

  const handleSymbolChange = (e) => {
    const sym = e.target.value.toUpperCase();
    const pos = positions.find(p => p.symbol===sym);
    setF(prev => ({ ...prev, symbol:sym, sharesHeld: pos ? pos.shares : "" }));
  };
  const handlePerShareChange = (e) => {
    const ps = parseFloat(e.target.value)||0, sh = parseFloat(f.sharesHeld)||0;
    setF(prev => ({ ...prev, perShare:e.target.value, totalAmount: autoCalc?(ps*sh).toFixed(2):f.totalAmount }));
  };
  const handleSharesChange = (e) => {
    const sh = parseFloat(e.target.value)||0, ps = parseFloat(f.perShare)||0;
    setF(prev => ({ ...prev, sharesHeld:e.target.value, totalAmount: autoCalc?(ps*sh).toFixed(2):f.totalAmount }));
  };
  const handleAdd = async () => {
    if (!f.symbol || !f.totalAmount) return;
    setSaving(true);
    await onAdd({ id:"d"+Date.now(), symbol:f.symbol.trim(), market:f.market, date:f.date,
      perShare:parseFloat(f.perShare)||0, sharesHeld:parseFloat(f.sharesHeld)||0, totalAmount:parseFloat(f.totalAmount) });
    setF(blank); setSaving(false);
  };

  return (
    <div style={{ background:"#1a1f2e", border:"1px solid #2a3045", borderRadius:12, padding:20 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
        <span style={{ color:"#34d399", fontWeight:700, fontSize:14 }}>💰 新增股息發放紀錄</span>
        <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:"#8892a8", cursor:"pointer" }}>
          <input type="checkbox" checked={autoCalc} onChange={e=>setAutoCalc(e.target.checked)} style={{ accentColor:"#34d399" }} />
          自動計算總金額
        </label>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
        <div><div style={LBL}>發放日期</div><input type="date" value={f.date} onChange={e=>setF(p=>({...p,date:e.target.value}))} style={INP} /></div>
        <div><div style={LBL}>股票代號</div><input value={f.symbol} onChange={handleSymbolChange} placeholder="e.g. 00919" style={INP} /></div>
        <div><div style={LBL}>市場</div>
          <select value={f.market} onChange={e=>setF(p=>({...p,market:e.target.value}))} style={INP}>
            <option value="TW">🇹🇼 台股</option>
            <option value="US">🇺🇸 美股</option>
          </select>
        </div>
        <div><div style={LBL}>每股股息（原幣）</div><input type="number" step="0.01" value={f.perShare} onChange={handlePerShareChange} placeholder="1.00" style={INP} /></div>
        <div><div style={LBL}>除權息時持有股數</div><input type="number" step="1" value={f.sharesHeld} onChange={handleSharesChange} placeholder="自動帶入" style={INP} /></div>
        <div>
          <div style={{ ...LBL, display:"flex", gap:4 }}>
            <span>實際領取金額（原幣）</span>
            {autoCalc && <span style={{ color:"#34d399" }}>●</span>}
          </div>
          <input type="number" step="0.01" value={f.totalAmount}
            onChange={e=>setF(p=>({...p,totalAmount:e.target.value}))}
            placeholder="可手動校正" style={{ ...INP, borderColor: autoCalc?"#34d39944":"#2a3045" }} />
        </div>
      </div>
      <button onClick={handleAdd} disabled={saving}
        style={{ marginTop:14, background:"#0d2e1a", border:"1px solid #34d399", borderRadius:8, color:"#34d399",
          padding:"8px 24px", fontWeight:700, cursor:"pointer", fontSize:13, opacity:saving?0.6:1 }}>
        {saving?"儲存中…":"新增股息"}
      </button>
    </div>
  );
};

// ─── EDIT TRADE MODAL ─────────────────────────────────────────────────────────
const EditTradeModal = ({ trade, onSave, onDelete, onClose }) => {
  const [f, setF] = useState({
    type: trade.type || "buy",
    symbol: trade.symbol,
    market: trade.market,
    date: trade.date,
    shares: String(trade.shares),
    price: String(trade.price),
    fee: String(trade.fee || 0),
  });
  const [err, setErr]       = useState("");
  const [saving, setSaving] = useState(false);
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }));
  const isSell = f.type === "sell";

  const handleSave = async () => {
    if (!f.symbol.trim() || !f.shares || !f.price) { setErr("請填寫股票代號、股數及單價"); return; }
    setSaving(true);
    await onSave({
      id: trade.id,
      type: f.type,
      symbol: f.symbol.toUpperCase().trim(),
      market: f.market,
      date: f.date,
      shares: parseFloat(f.shares),
      price: parseFloat(parseFloat(f.price).toFixed(2)),
      fee: parseFloat(f.fee) || 0,
    });
    setSaving(false);
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:999, display:"flex", alignItems:"center", justifyContent:"center" }}
      onClick={e => { if (e.target===e.currentTarget) onClose(); }}>
      <div style={{ background:"#1a1f2e", border:"1px solid #2a3045", borderRadius:16, padding:28, width:440 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
          <span style={{ color:"#e2e8f0", fontWeight:700, fontSize:16 }}>✏️ 編輯交易紀錄</span>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#6b7a99", cursor:"pointer", fontSize:22, lineHeight:1 }}>×</button>
        </div>

        <div style={{ display:"flex", background:"#0f1422", borderRadius:8, border:"1px solid #2a3045", overflow:"hidden", marginBottom:16, width:"fit-content" }}>
          {["buy","sell"].map(t => (
            <button key={t} onClick={() => setF(p => ({ ...p, type:t }))}
              style={{ padding:"5px 16px", border:"none", cursor:"pointer", fontWeight:700, fontSize:12,
                background: f.type===t ? (t==="buy"?"#052e16":"#2d1515") : "transparent",
                color: f.type===t ? (t==="buy"?"#34d399":"#f87171") : "#6b7a99" }}>
              {t==="buy"?"買入 Buy":"賣出 Sell"}
            </button>
          ))}
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <div><div style={LBL}>股票代號</div><input value={f.symbol} onChange={set("symbol")} style={INP} /></div>
          <div><div style={LBL}>市場</div>
            <select value={f.market} onChange={set("market")} style={INP}>
              <option value="TW">🇹🇼 台股</option>
              <option value="US">🇺🇸 美股</option>
            </select>
          </div>
          <div><div style={LBL}>交易日期</div><input type="date" value={f.date} onChange={set("date")} style={INP} /></div>
          <div><div style={LBL}>{isSell?"賣出股數":"購入股數"}</div><input type="number" step="0.00001" value={f.shares} onChange={set("shares")} style={INP} /></div>
          <div><div style={LBL}>{isSell?"賣出單價":"買入單價"}（精確至分）</div><input type="number" step="0.01" value={f.price} onChange={set("price")} style={INP} /></div>
          <div><div style={LBL}>{isSell?"手續費+稅金":"手續費"}</div><input type="number" step="0.01" value={f.fee} onChange={set("fee")} style={INP} /></div>
        </div>
        {err && <div style={{ color:"#f87171", fontSize:12, marginTop:8 }}>{err}</div>}

        <div style={{ display:"flex", gap:10, marginTop:18 }}>
          <button onClick={handleSave} disabled={saving}
            style={{ flex:1, background:"linear-gradient(135deg,#1e40af,#7c3aed)", border:"none", borderRadius:8, color:"#fff",
              padding:"10px 0", fontWeight:700, cursor:"pointer", fontSize:14, opacity:saving?0.6:1 }}>
            {saving ? "儲存中…" : "儲存變更"}
          </button>
          <button onClick={() => onDelete(trade.id)}
            style={{ background:"#2d1515", border:"1px solid #f8717155", borderRadius:8, color:"#f87171",
              padding:"10px 18px", fontWeight:700, cursor:"pointer", fontSize:13 }}>
            刪除
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── EDIT POSITION MODAL (adjust the net position directly) ─────────────────
// A position is derived from many trades. To let the user "edit a position"
// directly (change total shares / average cost in one step), we compute the
// delta needed and write it as a single adjustment trade tagged isAdjustment.
const EditPositionModal = ({ position, onSave, onClose }) => {
  const cur  = position.market === "TW" ? "NT$" : "$";
  const step = position.market === "US" ? "0.00001" : "1";
  const [shares,    setSharesRaw]    = useState(String(position.shares));
  const [wac,       setWacRaw]       = useState(position.wac.toFixed(2));
  const [totalCost, setTotalCostRaw] = useState((position.shares * position.wac).toFixed(2));
  const [saving,    setSaving]       = useState(false);
  const [err,       setErr]          = useState("");
  const [lastEdited, setLastEdited]  = useState("wac");

  const handleShares = (e) => {
    const v = e.target.value; setSharesRaw(v); setLastEdited("shares");
    const s = parseFloat(v)||0, w = parseFloat(wac)||0;
    setTotalCostRaw((s*w).toFixed(2));
  };
  const handleWac = (e) => {
    const v = e.target.value; setWacRaw(v); setLastEdited("wac");
    const w = parseFloat(v)||0, s = parseFloat(shares)||0;
    setTotalCostRaw((s*w).toFixed(2));
  };
  const handleTotalCost = (e) => {
    const v = e.target.value; setTotalCostRaw(v); setLastEdited("totalCost");
    const t = parseFloat(v)||0, s = parseFloat(shares)||0;
    if (s > 0) setWacRaw((Math.round((t / s) * 100) / 100).toFixed(2));
  };
  const handleTotalCostBlur = () => {
    const t = parseFloat(totalCost)||0, s = parseFloat(shares)||0;
    if (s > 0) {
      const rounded = Math.round((t / s) * 100) / 100;
      setWacRaw(rounded.toFixed(2));
      setTotalCostRaw((rounded * s).toFixed(2));
    }
  };
  const handleSave = async () => {
    const newShares = parseFloat(shares);
    const newWac = Math.round(parseFloat(wac) * 1e6) / 1e6;
    if (isNaN(newShares)||newShares<0||isNaN(newWac)||newWac<0) { setErr("請輸入有效數值"); return; }
    setSaving(true);
    try {
      await onSave({ symbol:position.symbol, market:position.market, shares:newShares, wac:newWac });
      console.log("onSave completed");
    } catch(e) {
      console.error("onSave error:", e);
    }
    setSaving(false);
  };
  const origTotal = (position.shares * position.wac).toFixed(2);
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:999, display:"flex", alignItems:"center", justifyContent:"center" }}
      onClick={e => { if (e.target===e.currentTarget) onClose(); }}>
      <div style={{ background:"#1a1f2e", border:"1px solid #2a3045", borderRadius:16, padding:28, width:480 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
          <span style={{ color:"#e2e8f0", fontWeight:700, fontSize:16 }}>✏️ 編輯持股 — {position.symbol}</span>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#6b7a99", cursor:"pointer", fontSize:22, lineHeight:1 }}>×</button>
        </div>
        <div style={{ color:"#6b7a99", fontSize:12, marginBottom:18 }}>三個欄位互相連動：改任一欄，其他欄位自動計算。</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
          <div>
            <div style={LBL}>庫存股數</div>
            <input type="number" step={step} value={shares} onChange={handleShares}
              style={{ ...INP, borderColor: lastEdited==="shares"?"#38bdf8":"#2a3045" }} />
          </div>
          <div>
            <div style={LBL}>加權平均成本（{cur}）</div>
            <input type="number" step="0.01" value={wac} onChange={handleWac}
              style={{ ...INP, borderColor: lastEdited==="wac"?"#a78bfa":"#2a3045" }} />
          </div>
          <div>
            <div style={LBL}>持倉總成本（{cur}）</div>
            <input type="number" step="0.01" value={totalCost} onChange={handleTotalCost} onBlur={handleTotalCostBlur}
              style={{ ...INP, borderColor: lastEdited==="totalCost"?"#34d399":"#2a3045" }} />
          </div>
        </div>
        <div style={{ display:"flex", gap:12, marginTop:8, fontSize:11 }}>
          <span style={{ color:"#38bdf8" }}>● 股數</span>
          <span style={{ color:"#a78bfa" }}>● 均價</span>
          <span style={{ color:"#34d399" }}>● 總成本（÷股數→均價）</span>
        </div>
        <div style={{ marginTop:12, padding:"10px 14px", background:"#0f1422", borderRadius:8, border:"1px solid #2a3045", fontSize:12 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, textAlign:"center" }}>
            <div><div style={{ color:"#4a5568", marginBottom:3 }}>原始股數</div><div style={{ color:"#8892a8" }}>{fmt(position.shares, position.market==="US"?5:0)}</div></div>
            <div><div style={{ color:"#4a5568", marginBottom:3 }}>原始均價</div><div style={{ color:"#8892a8" }}>{cur}{position.wac.toFixed(2)}</div></div>
            <div><div style={{ color:"#4a5568", marginBottom:3 }}>原始總成本</div><div style={{ color:"#8892a8" }}>{cur}{origTotal}</div></div>
          </div>
        </div>
        {err && <div style={{ color:"#f87171", fontSize:12, marginTop:8 }}>{err}</div>}
        <button onClick={handleSave} disabled={saving}
          style={{ marginTop:16, width:"100%", background:"linear-gradient(135deg,#1e40af,#7c3aed)", border:"none", borderRadius:8, color:"#fff",
            padding:"10px 0", fontWeight:700, cursor:"pointer", fontSize:14, opacity:saving?0.6:1 }}>
          {saving?"儲存中…":"套用修改"}
        </button>
      </div>
    </div>
  );
};


export default function App() {
  // ── Auth state ───────────────────────────────────────────────────────────
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const [user,       setUser]       = useState(null);   // Firebase User object or null
  const [authLoading, setAuthLoading] = useState(true);  // resolving initial auth state

  // ── Firebase-backed state ────────────────────────────────────────────────
  const [trades,    setTrades]    = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [dividends, setDividends] = useState([]);
  const [prices,    setPrices]    = useState(SEED_PRICES);
  const [lastSynced, setLastSynced] = useState(null);
  const [dbLoading, setDbLoading] = useState(true);
  const [dbStatus,  setDbStatus]  = useState("正在連線 Firebase…");
  const seededRef = useRef(false);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [period,     setPeriod]     = useState(PERIOD_OPTIONS[2]);
  const [yearFilter, setYearFilter] = useState(null);
  const [tab,        setTab]        = useState("overview");
  const [posSort,    setPosSort]    = useState({ col:"valueInTWD", dir:"desc" });
  const [editingTrade,    setEditingTrade]    = useState(null); // trade object or null
  const [editingPosition, setEditingPosition] = useState(null); // position object or null
  const [syncStatus, setSyncStatus] = useState("idle");
  const [syncMsg,    setSyncMsg]    = useState("");
  const [usdTwd,     setUsdTwd]     = useState(USD_TWD_FALLBACK);
  const [fxStatus,   setFxStatus]   = useState("idle"); // idle | loading | success | error
  const [fxUpdated,  setFxUpdated]  = useState(null);

  // ── Listen for auth state changes ───────────────────────────────────────
  useEffect(() => {
    // Safety timeout: if auth doesn't resolve in 8s, stop loading
    const timeout = setTimeout(() => setAuthLoading(false), 8000);
    getRedirectResult(auth).catch(() => {});
    const unsub = onAuthStateChanged(auth, (u) => {
      clearTimeout(timeout);
      setUser(u);
      setAuthLoading(false);
      if (u) {
        // Reset per-user state when account changes
        seededRef.current = false;
        setTrades([]); setDividends([]); setPrices(SEED_PRICES);
        setDbLoading(true);
      } else {
        setDbLoading(false);
      }
    });
    return unsub;
  }, []);

  // ── Seed Firestore if empty (per user) ───────────────────────────────────
  const seedIfEmpty = useCallback(async (uid) => {
    if (seededRef.current) return;
    seededRef.current = true;
    // New users start with clean data — no seed data written
  }, []);

  // ── onSnapshot listeners (per user) ──────────────────────────────────────
  useEffect(() => {
    if (!user) return; // wait until logged in
    const uid = user.uid;

    seedIfEmpty(uid).then(() => {
      let ready = { trades:false, divs:false, prices:false };
      const check = () => {
        if (ready.trades && ready.divs && ready.prices) {
          setDbLoading(false);
          setDbStatus("已連線");
        }
      };

      const unsubTrades = onSnapshot(userCol(uid, COL_TRADES), snap => {
        setTrades(snap.docs.map(d => ({ ...d.data(), id: d.id })));
        ready.trades = true; check();
      }, err => { setDbStatus("Firestore 連線失敗: " + err.message); });

      const unsubDivs = onSnapshot(userCol(uid, COL_DIVIDENDS), snap => {
        setDividends(snap.docs.map(d => ({ ...d.data(), id: d.id })));
        ready.divs = true; check();
      });

      const unsubPrices = onSnapshot(userCol(uid, COL_PRICES), snap => {
        const p = {};
        snap.docs.forEach(d => { const data = d.data(); p[data.symbol] = data.price; });
        if (Object.keys(p).length > 0) setPrices(p);
        ready.prices = true; check();
      });

      const unsubSnapshots = onSnapshot(userCol(uid, COL_SNAPSHOTS), snap => {
        const data = snap.docs
          .map(d => d.data())
          .sort((a, b) => a.date.localeCompare(b.date));
        setSnapshots(data);
      });

      const unsubMeta = onSnapshot(userDoc(uid, COL_META, "sync_info"), snap => {
        if (snap.exists()) setLastSynced(snap.data().lastSynced || null);
      });

      // Stash unsub functions so the cleanup below can call them
      seedIfEmpty._unsub = () => { unsubTrades(); unsubDivs(); unsubPrices(); unsubSnapshots(); unsubMeta(); };
    });

    return () => { if (seedIfEmpty._unsub) seedIfEmpty._unsub(); };
  }, [user, seedIfEmpty]);

  // ── Firestore write helpers (all scoped to current user.uid) ─────────────
  const addTrade = useCallback(async (t) => {
    if (!user) return;
    await setDoc(userDoc(user.uid, COL_TRADES, t.id), t);
    logEvent(analytics, "add_stock", { symbol: t.symbol });
  }, [user]);

  const updateTrade = useCallback(async (t) => {
    if (!user) return;
    await setDoc(userDoc(user.uid, COL_TRADES, t.id), t);
  }, [user]);

  const saveEditTrade = useCallback(async (t) => {
    await updateTrade(t);
    logEvent(analytics, "edit_stock", { symbol: t.symbol });
    setEditingTrade(null);
  }, [updateTrade]);

  const deleteEditTrade = useCallback(async (id) => {
    if (!user) return;
    const trade = trades.find(t => t.id === id);
    await deleteDoc(userDoc(user.uid, COL_TRADES, id));
    if (trade) logEvent(analytics, "delete_stock", { symbol: trade.symbol });
    setEditingTrade(null);
  }, [user, trades]);

  const delTrade = useCallback(async (id) => {
    if (!user) return;
    await deleteDoc(userDoc(user.uid, COL_TRADES, id));
  }, [user]);

  const addDividend = useCallback(async (d) => {
    if (!user) return;
    await setDoc(userDoc(user.uid, COL_DIVIDENDS, d.id), d);
  }, [user]);

  const delDiv = useCallback(async (id) => {
    if (!user) return;
    await deleteDoc(userDoc(user.uid, COL_DIVIDENDS, id));
  }, [user]);

  // Rebase a position: collapse ALL existing buy trades for this symbol into
  // a single normalized buy trade matching the user's new shares/wac.
  // We keep sell trades intact (realized gains stay accurate); we replace the
  // buy-side cost basis only.
  const rebasePosition = useCallback(async ({ symbol, market, shares, wac }) => {
    if (!user) return;
    const batch = writeBatch(db);
    const buysToRemove = trades.filter(t => t.symbol === symbol && (t.type === "buy" || !t.type));
    buysToRemove.forEach(t => batch.delete(userDoc(user.uid, COL_TRADES, t.id)));
    if (shares > 0) {
      const newId = "tadj" + Date.now();
      batch.set(userDoc(user.uid, COL_TRADES, newId), {
        id: newId,
        type: "buy",
        symbol,
        market,
        date: new Date().toISOString().slice(0,10),
        shares,
        price: Math.round(wac * 1e6) / 1e6,
        fee: 0,
        isAdjustment: true,
      });
    }
    await batch.commit();
    setEditingPosition(null);
  }, [trades, user]);

  // Save prices to Firestore (batch)
  // ── Google Sheets sync ────────────────────────────────────────────────────
  const allSymbols = useMemo(() => [...new Set(trades.map(t => t.symbol))], [trades]);

  const syncFromSheets = useCallback(async () => {
    if (!user) return;
    setSyncStatus("loading"); setSyncMsg("正在抓取最新報價…");
    try {
      const { updated, matchCount, total } = await fetchPricesFromAPI(allSymbols);
      const batch = writeBatch(db);
      Object.entries(updated).forEach(([sym, price]) => {
        batch.set(userDoc(user.uid, COL_PRICES, sym), { symbol: sym, price });
      });
      const now = new Date().toLocaleString("zh-TW", { hour12: false });
      const today = new Date().toISOString().slice(0, 10);
      batch.set(userDoc(user.uid, COL_META, "sync_info"), { lastSynced: now });
      // Save daily market value snapshot
      const snapTotalTWD = Math.round(
        positions.reduce((s, p) => s + p.valueInTWD, 0)
      );
      const snapTotalCost = Math.round(
        positions.reduce((s, p) => s + (p.market === "US" ? p.totalBuyCost * usdTwd : p.totalBuyCost), 0)
      );
      if (snapTotalTWD > 0) {
        batch.set(userDoc(user.uid, COL_SNAPSHOTS, today), {
          date: today,
          marketValue: snapTotalTWD,
          totalCost: snapTotalCost,
        });
      }
      await batch.commit();
      setSyncStatus("success");
      setSyncMsg(`已更新 ${matchCount}/${total} 支標的 · ${now}`);
      setTimeout(() => setSyncStatus("idle"), 4000);
    } catch (err) {
      setSyncStatus("error");
      setSyncMsg("同步失敗：" + (err.message || "網路錯誤"));
      setTimeout(() => setSyncStatus("idle"), 5000);
    }
  }, [allSymbols, user]);

  useEffect(() => { if (!dbLoading && user) syncFromSheets(); }, [dbLoading, user]);

  // ── Live USD/TWD exchange rate ────────────────────────────────────────────
  const syncFxRate = useCallback(async () => {
    setFxStatus("loading");
    try {
      const rate = await fetchUsdTwdRate();
      setUsdTwd(rate);
      setFxUpdated(new Date().toLocaleString("zh-TW", { hour12: false }));
      setFxStatus("success");
      setTimeout(() => setFxStatus("idle"), 3000);
    } catch (err) {
      setFxStatus("error");
      setTimeout(() => setFxStatus("idle"), 4000);
    }
  }, []);

  useEffect(() => { if (!dbLoading && user) syncFxRate(); }, [dbLoading, user]);

  // ── Position calculations ─────────────────────────────────────────────────
  const rawPositions = useMemo(() => buildPositions(trades), [trades]);

  const positions = useMemo(() => rawPositions.map(pos => {
    const price      = prices[pos.symbol] || 0;
    const wac        = pos.shares > 0 ? Math.round((pos.totalBuyCost / pos.shares) * 1e6) / 1e6 : 0;
    const marketValue = pos.shares * price;
    const unrealized  = marketValue - pos.totalBuyCost;
    const roi         = pos.totalBuyCost > 0 ? (unrealized / pos.totalBuyCost) * 100 : 0;
    const valueInTWD  = toTWD(marketValue, pos.market, usdTwd);
    const unrealTWD   = toTWD(unrealized,  pos.market, usdTwd);
    const realTWD     = toTWD(pos.realizedGain, pos.market, usdTwd);
    return { ...pos, price, wac, marketValue, unrealized, roi, valueInTWD, unrealTWD, realTWD };
  }), [rawPositions, prices]);

  // ── Sorted positions ──────────────────────────────────────────────────────
  const sortedPositions = useMemo(() => {
    const active = positions.filter(p => p.shares > 0);
    const { col, dir } = posSort;
    const d = dir === "asc" ? 1 : -1;
    if (col === "category") {
      return [...active].sort((a, b) => {
        if (a.market !== b.market) return a.market==="TW" ? -1 : 1;
        if (a.market === "TW")
          return a.symbol.padStart(10,"0").localeCompare(b.symbol.padStart(10,"0"));
        return a.symbol.localeCompare(b.symbol);
      });
    }
    return [...active].sort((a, b) => {
      if (col === "symbol") return d * a.symbol.localeCompare(b.symbol);
      return d * (a[col] - b[col]);
    });
  }, [positions, posSort]);

  // ── KPI aggregates ────────────────────────────────────────────────────────
  const twPos       = positions.filter(p => p.market==="TW" && p.shares>0);
  const usPos       = positions.filter(p => p.market==="US" && p.shares>0);
  const twValue     = twPos.reduce((s,p) => s + p.marketValue, 0);
  const usValue     = usPos.reduce((s,p) => s + p.marketValue, 0);
  const totalTWD    = twValue + usValue * usdTwd;
  const totalCost   = twPos.reduce((s,p) => s + p.totalBuyCost, 0) + usPos.reduce((s,p) => s + p.totalBuyCost, 0) * usdTwd;
  const totalUnreal = positions.reduce((s,p) => s + p.unrealTWD, 0);
  const totalReal   = positions.reduce((s,p) => s + p.realTWD,   0);
  const totalROI    = totalCost > 0 ? (totalUnreal / totalCost) * 100 : 0;
  const totalCapGainTWD = totalUnreal + totalReal;

  const buyDates = trades.filter(t => t.type==="buy"||!t.type).map(t => t.date);
  const earliest = buyDates.length ? buyDates.reduce((m,d) => d<m?d:m) : new Date().toISOString().slice(0,10);
  const years    = (Date.now() - new Date(earliest)) / (365.25 * 86400000);
  const cagr     = years>0.01 && totalCost>0 ? (Math.pow(totalTWD/totalCost, 1/years)-1)*100 : 0;

  // ── Period-filtered stats ─────────────────────────────────────────────────
  const activePeriodLabel = yearFilter ? `${yearFilter}年` : period.label;
  const filteredDivs      = filterByPeriod(dividends, period, yearFilter);
  const divIncome         = filteredDivs.reduce((s,d) => s + toTWD(d.totalAmount, d.market, usdTwd), 0);
  const filteredSells     = filterByPeriod(trades.filter(t => t.type==="sell"), period, yearFilter);
  const realizedInPeriod  = filteredSells.reduce((s, t) => {
    const pos = positions.find(p => p.symbol===t.symbol);
    if (!pos) return s;
    return s + toTWD(t.shares*t.price - (t.fee||0) - pos.wac*t.shares, t.market, usdTwd);
  }, 0);
  const periodCapGain = realizedInPeriod + totalUnreal;

  // ── Dynamic year list ─────────────────────────────────────────────────────
  const availableYears = useMemo(() => {
    const yrs = new Set();
    trades.forEach(t    => yrs.add(t.date.slice(0,4)));
    dividends.forEach(d => yrs.add(d.date.slice(0,4)));
    return [...yrs].sort((a,b) => b.localeCompare(a));
  }, [trades, dividends]);

  // ── Chart data ────────────────────────────────────────────────────────────
  const pieData = positions.filter(p => p.shares>0)
    .map(p => ({ name:p.symbol, value:Math.round(p.valueInTWD), market:p.market }))
    .sort((a,b) => b.value-a.value);

  const marketPie = [
    { name:"台股 🇹🇼", value:Math.round(twValue) },
    { name:"美股 🇺🇸", value:Math.round(usValue*usdTwd) },
  ];

  const assetBarData = positions.filter(p => p.shares>0).map(p => ({
    name: p.symbol,
    成本: Math.round(toTWD(p.totalBuyCost, p.market, usdTwd)),
    現值: Math.round(p.valueInTWD),
  })).sort((a,b) => b.現值-a.現值);

  const monthlyDivData = groupByMonth(
    filterByPeriod(dividends, period, yearFilter).map(d => ({
      date: d.date, amount: toTWD(d.totalAmount, d.market, usdTwd)
    }))
  );

  const gainBarData = (() => {
    const map = {};
    filterByPeriod(trades.filter(t => t.type==="sell"), period, yearFilter).forEach(t => {
      const k = t.date.slice(0,7);
      const pos = positions.find(p => p.symbol===t.symbol);
      const wac = pos ? pos.wac : 0;
      map[k] = (map[k]||0) + toTWD(t.shares*t.price - (t.fee||0) - wac*t.shares, t.market, usdTwd);
    });
    return Object.entries(map).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => ({ month:k, value:Math.round(v) }));
  })();

  // ── Filtered snapshot data for market value chart ───────────────────────────
  const filteredSnapshots = snapshots.filter(s => {
    if (yearFilter) {
      return s.date >= yearFilter + "-01-01" && s.date <= yearFilter + "-12-31";
    }
    if (period.label === "ALL") return true;
    const cutoff = period.label === "YTD"
      ? new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10)
      : daysAgo(period.days).toISOString().slice(0, 10);
    return s.date >= cutoff;
  });

  // ── Render guards ─────────────────────────────────────────────────────────
  if (authLoading) return <LoadingScreen status="正在確認登入狀態…" />;
  if (!user)       return <LoginScreen />;
  if (dbLoading)   return <LoadingScreen status={dbStatus} />;

  // ── Styles ────────────────────────────────────────────────────────────────
  const syncTheme = {
    idle:    { bg:"linear-gradient(135deg,#0c4a6e,#312e81)", border:"#38bdf8", color:"#38bdf8", text:"🔄 同步最新雲端報價" },
    loading: { bg:"linear-gradient(135deg,#1e3a5f,#3b2f6e)", border:"#6366f1", color:"#a5b4fc", text:"⏳ 同步中…" },
    success: { bg:"linear-gradient(135deg,#052e16,#14532d)", border:"#34d399", color:"#34d399", text:"✅ 同步成功" },
    error:   { bg:"linear-gradient(135deg,#2d1515,#450a0a)", border:"#f87171", color:"#f87171", text:"❌ 同步失敗" },
  }[syncStatus];

  const tabBtn = (t) => ({
    padding:"7px 18px", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer", border:"none",
    background: tab===t ? "#1e3a5f" : "transparent",
    color:      tab===t ? "#38bdf8" : "#6b7a99",
  });

  const CARD_COLORS = {
    totalValue: "#38bdf8",
    unrealized: totalUnreal >= 0 ? "#34d399" : "#f87171",
    realized:   totalReal   >= 0 ? "#a78bfa" : "#f87171",
    totalGain:  totalCapGainTWD >= 0 ? "#34d399" : "#f87171",
    cagr:       "#a78bfa",
    div:        "#34d399",
    periodGain: periodCapGain >= 0 ? "#34d399" : "#f87171",
  };

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div className="app-wrap">
      <style>{`
  @keyframes spin{to{transform:rotate(360deg)}}
  .kpi-grid-4 { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:12px; }
  .kpi-grid-2 { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:24px; }
  .chart-grid  { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
  .app-wrap    { background:#0b0f1a; min-height:100vh; color:#e2e8f0; font-family:'Inter','Segoe UI',system-ui,sans-serif; padding:24px 32px; }
  @media(max-width:768px){
    .kpi-all    { display:flex !important; flex-direction:column !important; gap:8px !important; margin-bottom:16px !important; }
    .kpi-order-1 { order:1; }
    .kpi-order-2 { order:2; }
    .kpi-order-3 { order:3; }
    .kpi-order-4 { order:4; }
    .kpi-order-5 { order:5; }
    .kpi-order-6 { order:6; }
    .chart-grid  { grid-template-columns:1fr !important; }
    .app-wrap    { padding:16px 12px !important; }
  }
`}</style>

      {/* ── SHEETS SYNC BANNER ── */}
      {syncStatus !== "idle" && (
        <div style={{ marginBottom:14, padding:"10px 18px", borderRadius:10,
          background: syncStatus==="loading"?"#0f1a2e": syncStatus==="success"?"#052e16":"#2d1515",
          border:`1px solid ${syncTheme.border}40`, display:"flex", alignItems:"center", gap:10, fontSize:13 }}>
          {syncStatus==="loading" && (
            <span style={{ width:14, height:14, border:"2px solid #6366f1", borderTopColor:"transparent", borderRadius:"50%", display:"inline-block", animation:"spin 0.7s linear infinite" }} />
          )}
          <span style={{ color:syncTheme.color }}>{syncMsg}</span>
        </div>
      )}

      {/* ── HEADER ── */}
      <div style={{ display:"flex", flexDirection: isMobile ? "column" : "row", justifyContent:"space-between", alignItems: isMobile ? "stretch" : "flex-start", marginBottom:22, gap: isMobile ? 10 : 0 }}>
        <div>
          <div style={{ fontSize: isMobile ? 20 : 23, fontWeight:800, background:"linear-gradient(135deg,#38bdf8,#a78bfa)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
            Dual-Engine Portfolio
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", gap:6, marginTop:4 }}>
            <span style={{ color:"#4a5568", fontSize:11 }}>台股 × 美股 雙引擎投資追蹤</span>
            {/* Firebase live badge */}
            <span style={{ background:"#052e16", border:"1px solid #34d39944", borderRadius:20, padding:"2px 10px", fontSize:10, color:"#34d399", fontWeight:600 }}>
              ⚡ Firebase 即時同步
            </span>
            {/* Live USD/TWD FX badge */}
            <button onClick={syncFxRate} title="點擊重新抓取即時匯率"
              style={{
                display:"flex", alignItems:"center", gap:4, cursor:"pointer",
                borderRadius:20, padding:"2px 10px", fontSize:10, fontWeight:600,
                background: fxStatus==="error" ? "#2d1515" : "#0d1f35",
                color: fxStatus==="error" ? "#f87171" : fxStatus==="loading" ? "#a5b4fc" : "#38bdf8",
                border: `1px solid ${fxStatus==="error" ? "#f8717144" : "#38bdf844"}`,
              }}>
              {fxStatus==="loading" ? "⏳ 更新匯率中…" : fxStatus==="error" ? "⚠️ 匯率改用備援值" : `💱 USD/TWD ${usdTwd.toFixed(3)}`}
            </button>
          </div>
          {(lastSynced || fxUpdated) && (
            <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginTop:3 }}>
              {lastSynced && syncStatus==="idle" && (
                <span style={{ color:"#2a3a55", fontSize:10 }}>· 報價更新 {lastSynced}</span>
              )}
              {fxUpdated && fxStatus==="idle" && (
                <span style={{ color:"#2a3a55", fontSize:10 }}>· 匯率更新 {fxUpdated}</span>
              )}
            </div>
          )}
        </div>

        <div style={{ display:"flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 6 : 10, alignItems: isMobile ? "stretch" : "center", flexWrap: isMobile ? "nowrap" : "wrap", justifyContent:"flex-end" }}>
          {/* Period buttons */}
          <div style={{ display:"flex", background:"#1a1f2e", borderRadius:10, border:"1px solid #2a3045", padding:3, gap:2, width: isMobile ? "100%" : "auto", justifyContent: isMobile ? "space-between" : "flex-start" }}>
            {PERIOD_OPTIONS.map(p => {
              const active = !yearFilter && period.label===p.label;
              return (
                <button key={p.label} onClick={() => { setPeriod(p); setYearFilter(null); }}
                  style={{ padding:"5px 13px", borderRadius:7, border:"none", cursor:"pointer", fontSize:12, fontWeight:600,
                    background: active?"#1e3a5f":"transparent", color: active?"#38bdf8":"#6b7a99" }}>
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Year dropdown */}
          <div style={{ position:"relative", width: isMobile ? "100%" : "auto" }}>
            <select value={yearFilter||""} onChange={e => setYearFilter(e.target.value||null)}
              style={{ background:yearFilter?"#1a2e4a":"#1a1f2e", border:`1px solid ${yearFilter?"#38bdf8":"#2a3045"}`,
                borderRadius:8, color:yearFilter?"#38bdf8":"#6b7a99",
                padding:"6px 30px 6px 12px", fontSize:12, fontWeight:600,
                cursor:"pointer", appearance:"none", WebkitAppearance:"none", outline:"none", width: isMobile ? "100%" : "auto", minWidth: isMobile ? "unset" : 110 }}>
              <option value="">特定年份 ▾</option>
              {availableYears.map(y => <option key={y} value={y}>{y} 年</option>)}
            </select>
            {yearFilter && (
              <button onClick={() => setYearFilter(null)}
                style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)",
                  background:"none", border:"none", color:"#38bdf8", cursor:"pointer", fontSize:14, lineHeight:1, padding:0 }}>
                ×
              </button>
            )}
          </div>

          {/* Cloud sync */}
          <button onClick={syncFromSheets} disabled={syncStatus==="loading"}
            style={{ background:syncTheme.bg, border:`1px solid ${syncTheme.border}`, borderRadius:8,
              color:syncTheme.color, padding:"7px 18px", fontWeight:700,
              cursor:syncStatus==="loading"?"not-allowed":"pointer",
              fontSize:12, whiteSpace:"nowrap", boxShadow:`0 0 12px ${syncTheme.border}28` }}>
            {syncTheme.text}
          </button>


          {/* User badge + logout */}
          <div style={{ display:"flex", alignItems:"center", gap:8, background:"#151b2a", border:"1px solid #2a3045", borderRadius:8, padding:"5px 12px" }}>
            <span style={{ color:"#8892a8", fontSize:12 }}>
              👤 {user.displayName || user.email}
            </span>
            <button onClick={() => signOut(auth)}
              style={{ background:"none", border:"none", color:"#f87171", cursor:"pointer", fontSize:11, fontWeight:600 }}>
              登出
            </button>
          </div>
        </div>
      </div>

      {/* ── ACTIVE FILTER INDICATOR ── */}
      {(() => {
        let rangeText = "";
        if (yearFilter)                   rangeText = `${yearFilter}/01/01 ~ ${yearFilter}/12/31`;
        else if (period.label==="ALL")    rangeText = "全部歷史紀錄";
        else if (period.label==="YTD")    rangeText = `${new Date().getFullYear()}/01/01 ~ 今日`;
        else { const d = daysAgo(period.days); rangeText = `${d.toISOString().slice(0,10)} ~ 今日`; }
        return (
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:18 }}>
            <span style={{ background:yearFilter?"#1a2e4a":"#141a28", border:`1px solid ${yearFilter?"#38bdf8":"#2a3045"}`,
              borderRadius:20, padding:"4px 14px", fontSize:12, color:yearFilter?"#38bdf8":"#6b7a99", fontWeight:600 }}>
              {yearFilter ? `📅 ${yearFilter} 年度篩選` : `⏱ ${period.label}`}
            </span>
            <span style={{ color:"#3a4a62", fontSize:12 }}>{rangeText}</span>
            {yearFilter && (
              <span style={{ color:"#34d399", fontSize:11, background:"#052e16", border:"1px solid #34d39933", borderRadius:6, padding:"2px 8px" }}>
                精確鎖定 {yearFilter}/01/01 ~ {yearFilter}/12/31
              </span>
            )}
          </div>
        );
      })()}

      {/* ── KPI ROW 1 ── */}
      <div className="kpi-all" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:24 }}>
        <div className="kpi-order-1" style={{ height:"100%" }}><KPICard label="總市值（TWD）"   value={"NT$"+fmt(totalTWD)}           sub={"投入成本 NT$"+fmt(totalCost)}   color={CARD_COLORS.totalValue} /></div>
        <div className="kpi-order-2" style={{ height:"100%" }}><KPICard label="未實現損益"       value={"NT$"+fmtSign(totalUnreal)}    sub={fmtPct(totalROI)+" vs 成本"}    color={CARD_COLORS.unrealized} /></div>
        <div className="kpi-order-3" style={{ height:"100%" }}><KPICard label={activePeriodLabel+" 股息收入"} value={"NT$"+fmt(divIncome)}   sub={"含即時換匯 ×"+usdTwd.toFixed(2)}    color={CARD_COLORS.div}        /></div>
        <div className="kpi-order-4" style={{ height:"100%" }}><KPICard label="已實現資本利得"   value={"NT$"+fmtSign(totalReal)}      sub="賣出交易累積"                    color={CARD_COLORS.realized}   /></div>
        <div className="kpi-order-5" style={{ height:"100%" }}><KPICard label={activePeriodLabel+" 期間資本利得"} value={"NT$"+fmtSign(periodCapGain)} sub="已實現 + 目前未實現"     color={CARD_COLORS.periodGain} /></div>
        <div className="kpi-order-6">
        {/* Market split */}
        <div style={{ background:"#1a1f2e", border:"1px solid #2a3045", borderRadius:12, padding:"16px 20px" }}>
          <div style={{ fontSize:11, color:"#6b7a99", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10 }}>市場分配</div>
          {[{label:"台股",val:twValue,color:"#38bdf8"},{label:"美股",val:usValue*usdTwd,color:"#a78bfa"}].map(m => {
            const pct = totalTWD>0 ? (m.val/totalTWD*100).toFixed(1) : 0;
            return (
              <div key={m.label} style={{ marginBottom:7 }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:3 }}>
                  <span style={{ color:"#8892a8" }}>{m.label}</span>
                  <span style={{ color:m.color, fontWeight:700 }}>{pct}%</span>
                </div>
                <div style={{ background:"#0f1422", borderRadius:4, height:5 }}>
                  <div style={{ background:m.color, width:pct+"%", height:"100%", borderRadius:4, transition:"width 0.6s" }} />
                </div>
              </div>
            );
          })}
        </div>
        </div>
      </div>

      {/* ── TABS ── */}
      <div style={{ display:"flex", gap:4, marginBottom:20, background:"#1a1f2e", border:"1px solid #2a3045", borderRadius:10, padding:4, width:"fit-content" }}>
        {[["overview","圖表分析"],["positions","持倉清單"],["trades","交易紀錄"],["dividends","股息管理"],["add","新增資料"]].map(([t,l]) => (
          <button key={t} onClick={() => setTab(t)} style={tabBtn(t)}>{l}</button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── OVERVIEW TAB ──                                                   */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab==="overview" && (
        <div className="chart-grid">
          {/* Line chart: market value vs cost over time */}
          <div style={{ background:"#1a1f2e", border:"1px solid #2a3045", borderRadius:12, padding:20, gridColumn:"1 / -1" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <div style={{ color:"#8892a8", fontSize:12 }}>總市值 vs 持倉成本走勢（{activePeriodLabel}，TWD）</div>
              {filteredSnapshots.length === 0 && (
                <span style={{ color:"#4a5568", fontSize:11 }}>尚無歷史快照・每次同步報價時自動記錄一筆</span>
              )}
            </div>
            {filteredSnapshots.length >= 2 ? (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={filteredSnapshots} margin={{ top:4, right:16, left:0, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" />
                  <XAxis dataKey="date" tick={{ fill:"#6b7a99", fontSize:10 }}
                    tickFormatter={v => v.slice(5)} />
                  <YAxis tick={{ fill:"#6b7a99", fontSize:10 }}
                    tickFormatter={v => "NT$" + (v >= 1000000 ? (v/1000000).toFixed(1)+"M" : (v/1000).toFixed(0)+"K")} />
                  <Tooltip
                    contentStyle={{ background:"#e2e8f0", border:"1px solid #94a3b8", borderRadius:8, color:"#1a202c" }}
                    formatter={(v, name) => ["NT$" + new Intl.NumberFormat("zh-TW").format(v), name]}
                    labelFormatter={l => "日期：" + l}
                  />
                  <Legend formatter={v => <span style={{ color:"#8892a8", fontSize:12 }}>{v}</span>} />
                  <Line type="monotone" dataKey="marketValue" name="總市值"
                    stroke="#38bdf8" strokeWidth={2} dot={filteredSnapshots.length <= 30}
                    activeDot={{ r:5 }} />
                  <Line type="monotone" dataKey="totalCost" name="持倉成本"
                    stroke="#a78bfa" strokeWidth={2} strokeDasharray="5 5"
                    dot={false} activeDot={{ r:4 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : filteredSnapshots.length === 1 ? (
              <div style={{ color:"#4a5568", fontSize:12, textAlign:"center", paddingTop:60 }}>
                已記錄 1 筆快照（{filteredSnapshots[0].date}），再同步一次即可顯示走勢圖
              </div>
            ) : (
              <div style={{ color:"#4a5568", fontSize:12, textAlign:"center", paddingTop:60 }}>
                點擊「🔄 同步最新雲端報價」開始記錄市值歷史，每次同步自動儲存一筆
              </div>
            )}
            {filteredSnapshots.length >= 2 && (() => {
              const first = filteredSnapshots[0].marketValue;
              const last  = filteredSnapshots[filteredSnapshots.length-1].marketValue;
              const diff  = last - first;
              const pct   = first > 0 ? (diff / first * 100).toFixed(2) : 0;
              const color = diff >= 0 ? "#34d399" : "#f87171";
              return (
                <div style={{ marginTop:10, display:"flex", justifyContent:"flex-end", alignItems:"center", gap:16 }}>
                  <span style={{ color:"#6b7a99", fontSize:11 }}>{filteredSnapshots[0].date} → {filteredSnapshots[filteredSnapshots.length-1].date}</span>
                  <span style={{ color, fontWeight:700, fontSize:13 }}>
                    {diff >= 0 ? "+" : ""}NT${fmt(Math.round(diff))}
                  </span>
                  <span style={{ color, fontSize:12 }}>
                    ({diff >= 0 ? "+" : ""}{pct}%)
                  </span>
                </div>
              );
            })()}
          </div>
          {/* Donut: individual weights */}
          <div style={{ background:"#1a1f2e", border:"1px solid #2a3045", borderRadius:12, padding:20 }}>
            <div style={{ color:"#8892a8", fontSize:12, marginBottom:12 }}>個股持倉權重分佈</div>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={56} outerRadius={92} paddingAngle={2} dataKey="value">
                  {pieData.map((_,i) => <Cell key={i} fill={PALETTE[i%PALETTE.length]} />)}
                </Pie>
                <Tooltip content={({ payload }) => {
                  if (!payload || !payload[0]) return null;
                  const d = payload[0].payload;
                  return (
                    <div style={{ background:"#e2e8f0", border:"1px solid #94a3b8", borderRadius:8, padding:"8px 12px", color:"#1a202c" }}>
                      <div style={{ fontWeight:700, marginBottom:4 }}>{d.name}</div>
                      <div>{"NT$"+fmt(d.value)}</div>
                      <div style={{ color:"#4a5568", fontSize:11, marginTop:2 }}>{totalTWD>0?(d.value/totalTWD*100).toFixed(1):0}%</div>
                    </div>
                  );
                }} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginTop:6 }}>
              {pieData.map((d,i) => (
                <div key={d.name} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11 }}>
                  <div style={{ width:8, height:8, borderRadius:2, background:PALETTE[i%PALETTE.length] }} />
                  <span style={{ color:"#8892a8" }}>{d.name}</span>
                  <span style={{ color:"#e2e8f0", fontWeight:600 }}>{totalTWD>0?(d.value/totalTWD*100).toFixed(1):0}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Donut: TW vs US */}
          <div style={{ background:"#1a1f2e", border:"1px solid #2a3045", borderRadius:12, padding:20 }}>
            <div style={{ color:"#8892a8", fontSize:12, marginBottom:12 }}>台股 vs 美股（TWD 換算）</div>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={marketPie} cx="50%" cy="50%" innerRadius={56} outerRadius={92} paddingAngle={4} dataKey="value">
                  <Cell fill="#38bdf8" /><Cell fill="#a78bfa" />
                </Pie>
                <Tooltip formatter={v=>["NT$"+fmt(v),"市值"]} contentStyle={{ background:"#e2e8f0", border:"1px solid #94a3b8", borderRadius:8, color:"#1a202c" }} />
                <Legend formatter={v => <span style={{ color:"#8892a8", fontSize:12 }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>


          {/* Bar: monthly dividends */}
          <div style={{ background:"#1a1f2e", border:"1px solid #2a3045", borderRadius:12, padding:20 }}>
            <div style={{ color:"#8892a8", fontSize:12, marginBottom:12 }}>月度股息收入趨勢（{activePeriodLabel}，TWD）</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={monthlyDivData} margin={{ top:4, right:16, left:0, bottom:0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" />
                <XAxis dataKey="month" tick={{ fill:"#6b7a99", fontSize:10 }} />
                <YAxis tick={{ fill:"#6b7a99", fontSize:10 }} tickFormatter={v=>"NT$"+v} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" name="股息" fill="#34d399" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
            {monthlyDivData.length > 0 && (
              <div style={{ marginTop:10, display:"flex", justifyContent:"flex-end", alignItems:"center", gap:6 }}>
                <span style={{ color:"#6b7a99", fontSize:11 }}>月均股息</span>
                <span style={{ color:"#34d399", fontWeight:700, fontSize:13 }}>
                  {"NT$"+fmt(Math.round(monthlyDivData.reduce((s,m)=>s+m.value,0)/monthlyDivData.length))}
                </span>
              </div>
            )}
          </div>

          {/* Bar: realized gains */}
          <div style={{ background:"#1a1f2e", border:"1px solid #2a3045", borderRadius:12, padding:20 }}>
            <div style={{ color:"#8892a8", fontSize:12, marginBottom:12 }}>已實現資本利得（{activePeriodLabel}，TWD）</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={gainBarData} margin={{ top:4, right:16, left:0, bottom:0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" />
                <XAxis dataKey="month" tick={{ fill:"#6b7a99", fontSize:10 }} />
                <YAxis tick={{ fill:"#6b7a99", fontSize:10 }} tickFormatter={v=>"NT$"+v} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" name="已實現利得" fill="#a78bfa" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
            {gainBarData.length===0 && (
              <div style={{ color:"#4a5568", fontSize:12, textAlign:"center", marginTop:40 }}>此期間無賣出紀錄</div>
            )}
          </div>

        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── POSITIONS TAB ──                                                  */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab==="positions" && (() => {
        const handleSort = (col) => setPosSort(prev =>
          prev.col===col ? { col, dir:prev.dir==="desc"?"asc":"desc" } : { col, dir:"desc" }
        );
        const Arrow = ({ col:c }) => posSort.col!==c
          ? <span style={{ opacity:0.25, marginLeft:4 }}>⇅</span>
          : <span style={{ marginLeft:4, color:"#38bdf8" }}>{posSort.dir==="desc"?"▼":"▲"}</span>;

        const presets = [
          { key:"valueInTWD", dir:"desc", icon:"💰", label:"市值由大到小" },
          { key:"category",   dir:null,   icon:"🗂",  label:"台股/美股分類" },
          { key:"roi",        dir:"desc", icon:"📈", label:"報酬率由高到低" },
          { key:"unrealTWD",  dir:"desc", icon:"✨", label:"未實現損益" },
        ];
        const thBase  = { padding:"11px 14px", color:"#6b7a99", fontWeight:600, whiteSpace:"nowrap", fontSize:11, letterSpacing:"0.04em", borderBottom:"1px solid #1e2535", userSelect:"none" };
        const thClick = { ...thBase, cursor:"pointer" };
        const thHover = (c) => posSort.col===c ? { ...thClick, color:"#38bdf8", background:"#111827" } : thClick;
        const showSep = (rows,i) => posSort.col==="category" && i>0 && rows[i].market!==rows[i-1].market;

        return (
          <div>
            <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
              {presets.map(p => {
                const active = posSort.col===p.key;
                return (
                  <button key={p.key} onClick={() => setPosSort({ col:p.key, dir:p.dir||"desc" })}
                    style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 14px", borderRadius:8, fontSize:12, fontWeight:600,
                      cursor:"pointer", border:`1px solid ${active?"#38bdf8":"#2a3045"}`,
                      background:active?"#0d1f35":"#1a1f2e", color:active?"#38bdf8":"#6b7a99", transition:"all 0.15s" }}>
                    <span>{p.icon}</span><span>{p.label}</span>
                    {active && p.dir && <span style={{ fontSize:10 }}>{posSort.dir==="desc"?"▼":"▲"}</span>}
                  </button>
                );
              })}
              <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:6, color:"#3a4a62", fontSize:11 }}>
                <span>共 {sortedPositions.length} 支持股</span>
                <span>·</span><span>點擊欄標題可排序</span>
              </div>
            </div>

            <div style={{ background:"#1a1f2e", border:"1px solid #2a3045", borderRadius:12, overflow:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                <thead>
                  <tr style={{ background:"#0a0e1a" }}>
                    <th onClick={() => handleSort("symbol")}      style={{ ...thHover("symbol"),      textAlign:"left"  }}>代號 <Arrow col="symbol" /></th>
                    <th                                            style={{ ...thBase,                 textAlign:"left"  }}>市場</th>
                    <th onClick={() => handleSort("shares")}      style={{ ...thHover("shares"),      textAlign:"right" }}>庫存股數 <Arrow col="shares" /></th>
                    <th onClick={() => handleSort("wac")}         style={{ ...thHover("wac"),         textAlign:"right" }}>加權平均成本 <Arrow col="wac" /></th>
                    <th onClick={() => handleSort("totalBuyCost")}style={{ ...thHover("totalBuyCost"),textAlign:"right" }}>持倉成本 <Arrow col="totalBuyCost" /></th>
                    <th onClick={() => handleSort("price")}       style={{ ...thHover("price"),       textAlign:"right" }}>現價 <Arrow col="price" /></th>
                    <th onClick={() => handleSort("valueInTWD")}  style={{ ...thHover("valueInTWD"),  textAlign:"right" }}>市值 TWD <Arrow col="valueInTWD" /></th>
                    <th onClick={() => handleSort("unrealTWD")}   style={{ ...thHover("unrealTWD"),   textAlign:"right" }}>未實現損益 <Arrow col="unrealTWD" /></th>
                    <th onClick={() => handleSort("realTWD")}     style={{ ...thHover("realTWD"),     textAlign:"right" }}>已實現利得 <Arrow col="realTWD" /></th>
                    <th onClick={() => handleSort("roi")}         style={{ ...thHover("roi"),         textAlign:"right" }}>ROI <Arrow col="roi" /></th>
                    <th style={{ ...thBase, textAlign:"center" }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPositions.map((p, i) => (
                    <>
                      {showSep(sortedPositions, i) && (
                        <tr key={"sep-"+i}>
                          <td colSpan={11} style={{ padding:"6px 14px", background:"#0d1424", borderTop:"1px solid #2a3045", borderBottom:"1px solid #2a3045" }}>
                            <span style={{ color:"#a78bfa", fontSize:11, fontWeight:700, letterSpacing:"0.1em" }}>🇺🇸 美股</span>
                          </td>
                        </tr>
                      )}
                      {posSort.col==="category" && i===0 && (
                        <tr key="sep-tw">
                          <td colSpan={11} style={{ padding:"6px 14px", background:"#0d1424", borderBottom:"1px solid #2a3045" }}>
                            <span style={{ color:"#38bdf8", fontSize:11, fontWeight:700, letterSpacing:"0.1em" }}>🇹🇼 台股</span>
                          </td>
                        </tr>
                      )}
                      <tr key={p.symbol} style={{ borderTop:"1px solid #1e2535", background:i%2===0?"transparent":"#0b0f1c", transition:"background 0.1s" }}>
                        <td style={{ padding:"11px 14px", fontWeight:700, color:"#e2e8f0" }}>{p.symbol}</td>
                        <td style={{ padding:"11px 14px" }}>
                          <Badge color={p.market==="TW"?"#38bdf8":"#a78bfa"}>
                            {p.market==="TW"?"🇹🇼 台股":"🇺🇸 美股"}
                          </Badge>
                        </td>
                        <td style={{ padding:"11px 14px", textAlign:"right", color:"#e2e8f0" }}>{fmt(p.shares, p.market==="US"?5:0)}</td>
                        <td style={{ padding:"11px 14px", textAlign:"right", color:"#8892a8" }}>{p.market==="TW"?"NT$":"$"}{p.wac.toFixed(2)}</td>
                        <td style={{ padding:"11px 14px", textAlign:"right", color:"#8892a8" }}>{p.market==="TW"?"NT$":"$"}{fmt(p.totalBuyCost,2)}</td>
                        <td style={{ padding:"11px 14px", textAlign:"right" }}>
                          <span style={{ color:"#38bdf8", fontWeight:600 }}>{p.market==="TW"?"NT$":"$"}{p.price.toFixed(2)}</span>
                        </td>
                        <td style={{ padding:"11px 14px", textAlign:"right" }}>
                          <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:3 }}>
                            <span style={{ color:"#e2e8f0", fontWeight:700 }}>NT${fmt(p.valueInTWD)}</span>
                            <div style={{ width:60, height:3, background:"#1e2535", borderRadius:2 }}>
                              <div style={{ width:(totalTWD>0?Math.min(p.valueInTWD/totalTWD*100,100):0)+"%",
                                height:"100%", background:p.market==="TW"?"#38bdf8":"#a78bfa", borderRadius:2, transition:"width 0.4s" }} />
                            </div>
                          </div>
                        </td>
                        <td style={{ padding:"11px 14px", textAlign:"right", color:p.unrealized>=0?"#34d399":"#f87171", fontWeight:700 }}>
                          NT${fmtSign(p.unrealTWD)}
                        </td>
                        <td style={{ padding:"11px 14px", textAlign:"right", color:p.realTWD>=0?"#a78bfa":"#f87171", fontWeight:600 }}>
                          {p.realTWD!==0 ? "NT$"+fmtSign(p.realTWD) : <span style={{ color:"#2a3045" }}>—</span>}
                        </td>
                        <td style={{ padding:"11px 14px", textAlign:"right" }}>
                          <span style={{ color:p.roi>=0?"#34d399":"#f87171", fontWeight:700,
                            background:p.roi>=0?"#34d39915":"#f8717115", padding:"2px 8px", borderRadius:6 }}>
                            {fmtPct(p.roi)}
                          </span>
                        </td>
                        <td style={{ padding:"11px 14px", textAlign:"center" }}>
                          <button onClick={() => setEditingPosition(p)}
                            style={{ background:"#0d1f35", border:"1px solid #38bdf855", borderRadius:6, color:"#38bdf8",
                              padding:"4px 12px", cursor:"pointer", fontSize:11, fontWeight:600 }}>
                            ✏️ 編輯
                          </button>
                        </td>
                      </tr>
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── TRADES TAB ──                                                     */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab==="trades" && (
        <div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:16 }}>
            <KPICard label="已實現資本利得（全部）"    value={"NT$"+fmtSign(totalReal)}        sub="所有賣出交易合計" color={totalReal>=0?"#a78bfa":"#f87171"} />
            <KPICard label={activePeriodLabel+" 期間已實現"} value={"NT$"+fmtSign(realizedInPeriod)} sub="期間賣出交易"   color={realizedInPeriod>=0?"#34d399":"#f87171"} />
            <KPICard label="賣出交易筆數"             value={fmt(trades.filter(t=>t.type==="sell").length)} sub="筆賣出" color="#38bdf8" />
          </div>
          <div style={{ background:"#1a1f2e", border:"1px solid #2a3045", borderRadius:12, overflow:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr style={{ background:"#0f1422" }}>
                  {["類型","代號","市場","日期","股數","單價","費用/稅","金額","實現利得","操作"].map(h => (
                    <th key={h} style={{ padding:"12px 14px", color:"#6b7a99", fontWeight:600,
                      textAlign:["類型","代號","市場","日期"].includes(h)?"left":"right",
                      whiteSpace:"nowrap", fontSize:11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...trades].sort((a,b) => b.date.localeCompare(a.date)).map((t, i) => {
                  const pos = positions.find(p => p.symbol===t.symbol);
                  const wac = pos ? pos.wac : 0;
                  const realized = t.type==="sell"
                    ? toTWD(t.shares*t.price - (t.fee||0) - wac*t.shares, t.market, usdTwd)
                    : null;
                  return (
                    <tr key={t.id} style={{ borderTop:"1px solid #1e2535", background:i%2===0?"transparent":"#0f1422" }}>
                      <td style={{ padding:"10px 14px" }}><TypeBadge type={t.type||"buy"} /></td>
                      <td style={{ padding:"10px 14px", fontWeight:700, color:"#e2e8f0" }}>{t.symbol}</td>
                      <td style={{ padding:"10px 14px" }}><Badge color={t.market==="TW"?"#38bdf8":"#a78bfa"}>{t.market==="TW"?"台股":"美股"}</Badge></td>
                      <td style={{ padding:"10px 14px", color:"#8892a8" }}>{t.date}</td>
                      <td style={{ padding:"10px 14px", textAlign:"right", color:"#e2e8f0" }}>{fmt(t.shares, t.market==="US"?5:0)}</td>
                      <td style={{ padding:"10px 14px", textAlign:"right", color:"#e2e8f0" }}>{t.market==="TW"?"NT$":"$"}{t.price.toFixed(2)}</td>
                      <td style={{ padding:"10px 14px", textAlign:"right", color:"#6b7a99" }}>{fmt(t.fee||0,2)}</td>
                      <td style={{ padding:"10px 14px", textAlign:"right", color:"#e2e8f0", fontWeight:600 }}>
                        {t.market==="TW"?"NT$":"$"}{fmt(t.type==="sell"?t.shares*t.price-(t.fee||0):t.shares*t.price+(t.fee||0),2)}
                      </td>
                      <td style={{ padding:"10px 14px", textAlign:"right" }}>
                        {realized!==null
                          ? <span style={{ color:realized>=0?"#a78bfa":"#f87171", fontWeight:700 }}>NT${fmtSign(realized)}</span>
                          : <span style={{ color:"#2a3045" }}>—</span>}
                      </td>
                      <td style={{ padding:"10px 14px", textAlign:"right" }}>
                        <div style={{ display:"flex", gap:6, justifyContent:"flex-end" }}>
                          <button onClick={() => setEditingTrade(t)}
                            style={{ background:"#0d1f35", border:"1px solid #38bdf855", borderRadius:6, color:"#38bdf8", padding:"3px 10px", cursor:"pointer", fontSize:11, fontWeight:600 }}>
                            編輯
                          </button>
                          <button onClick={() => delTrade(t.id)}
                            style={{ background:"#2d1515", border:"1px solid #f8717133", borderRadius:6, color:"#f87171", padding:"3px 10px", cursor:"pointer", fontSize:11 }}>
                            刪除
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── DIVIDENDS TAB ──                                                  */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab==="dividends" && (() => {
        // Aggregate filtered dividends by symbol (TWD-converted)
        const bySymbol = {};
        filteredDivs.forEach(d => {
          const twd = toTWD(d.totalAmount, d.market, usdTwd);
          if (!bySymbol[d.symbol]) bySymbol[d.symbol] = { symbol: d.symbol, market: d.market, total: 0, count: 0 };
          bySymbol[d.symbol].total += twd;
          bySymbol[d.symbol].count += 1;
        });
        const divBySymbol = Object.values(bySymbol).sort((a,b) => b.total - a.total);
        const divPieData  = divBySymbol.map(s => ({ name: s.symbol, value: Math.round(s.total) }));

        return (
        <div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:16 }}>
            <KPICard label={activePeriodLabel+" 股息總收入"} value={"NT$"+fmt(divIncome)}   sub="TWD 換算"     color="#34d399" />
            <KPICard label="股息筆數"                        value={fmt(filteredDivs.length)} sub={activePeriodLabel+" 期間"} color="#38bdf8" />
            <KPICard label="年化股息率"                      value={(() => {
              const divSymbols = new Set(filteredDivs.map(d => d.symbol));
              const divCost = positions.filter(p => divSymbols.has(p.symbol)).reduce((s, p) => s + toTWD(p.totalBuyCost, p.market, usdTwd), 0);
              return divCost > 0 ? (divIncome / divCost * 100).toFixed(2) + "%" : "—";
            })()} sub="股息 ÷ 持股成本" color="#f472b6" />
          </div>

          {/* ── Per-symbol dividend breakdown: donut + ranked list ── */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:20 }}>
            {/* Donut chart */}
            <div style={{ background:"#1a1f2e", border:"1px solid #2a3045", borderRadius:12, padding:20 }}>
              <div style={{ color:"#8892a8", fontSize:12, marginBottom:12 }}>
                個股股息佔比（{activePeriodLabel}，TWD）
              </div>
              {divPieData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={divPieData} cx="50%" cy="50%" innerRadius={56} outerRadius={92} paddingAngle={2} dataKey="value">
                        {divPieData.map((_,i) => <Cell key={i} fill={PALETTE[i%PALETTE.length]} />)}
                      </Pie>
                      <Tooltip content={({ payload }) => {
                        if (!payload || !payload[0]) return null;
                        const d = payload[0].payload;
                        return (
                          <div style={{ background:"#e2e8f0", border:"1px solid #94a3b8", borderRadius:8, padding:"8px 12px", color:"#1a202c" }}>
                            <div style={{ fontWeight:700, marginBottom:4 }}>{d.name}</div>
                            <div>{"NT$"+fmt(d.value)}</div>
                            <div style={{ color:"#4a5568", fontSize:11, marginTop:2 }}>{divIncome>0?(d.value/divIncome*100).toFixed(1):0}%</div>
                          </div>
                        );
                      }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginTop:6 }}>
                    {divPieData.map((d,i) => (
                      <div key={d.name} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11 }}>
                        <div style={{ width:8, height:8, borderRadius:2, background:PALETTE[i%PALETTE.length] }} />
                        <span style={{ color:"#8892a8" }}>{d.name}</span>
                        <span style={{ color:"#e2e8f0", fontWeight:600 }}>{divIncome>0?(d.value/divIncome*100).toFixed(1):0}%</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ color:"#4a5568", fontSize:12, textAlign:"center", marginTop:80 }}>此期間無股息紀錄</div>
              )}
            </div>

            {/* Ranked bar list */}
            <div style={{ background:"#1a1f2e", border:"1px solid #2a3045", borderRadius:12, padding:20 }}>
              <div style={{ color:"#8892a8", fontSize:12, marginBottom:12 }}>
                個股股息排行（{activePeriodLabel}，TWD）
              </div>
              {divBySymbol.length > 0 ? (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {divBySymbol.map((s, i) => {
                    const pct = divIncome > 0 ? (s.total / divIncome * 100) : 0;
                    return (
                      <div key={s.symbol}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:4 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                            <span style={{ width:8, height:8, borderRadius:2, background:PALETTE[i%PALETTE.length], display:"inline-block" }} />
                            <span style={{ color:"#e2e8f0", fontWeight:700, fontSize:13 }}>{s.symbol}</span>
                            <Badge color={s.market==="TW"?"#38bdf8":"#a78bfa"}>{s.market==="TW"?"台股":"美股"}</Badge>
                            <span style={{ color:"#4a5568", fontSize:11 }}>{s.count} 筆</span>
                          </div>
                          <div style={{ display:"flex", alignItems:"baseline", gap:10 }}>
                            {(() => {
                              const pos = positions.find(p => p.symbol === s.symbol);
                              const cost = pos ? toTWD(pos.totalBuyCost, pos.market, usdTwd) : 0;
                              const yld = cost > 0 ? (s.total / cost * 100).toFixed(2) : null;
                              return yld ? <span style={{ color:"#f472b6", fontSize:11 }}>{yld}%</span> : null;
                            })()}
                            <span style={{ color:"#34d399", fontWeight:700, fontSize:13 }}>NT${fmt(s.total)}</span>
                          </div>
                        </div>
                        <div style={{ background:"#0f1422", borderRadius:4, height:6 }}>
                          <div style={{ width:pct+"%", height:"100%", borderRadius:4, background:PALETTE[i%PALETTE.length], transition:"width 0.4s" }} />
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ borderTop:"1px solid #1e2535", marginTop:6, paddingTop:10, display:"flex", justifyContent:"space-between" }}>
                    <span style={{ color:"#6b7a99", fontSize:12, fontWeight:600 }}>合計</span>
                    <span style={{ color:"#34d399", fontWeight:800, fontSize:14 }}>NT${fmt(divIncome)}</span>
                  </div>
                </div>
              ) : (
                <div style={{ color:"#4a5568", fontSize:12, textAlign:"center", marginTop:80 }}>此期間無股息紀錄</div>
              )}
            </div>
          </div>

          <div style={{ background:"#1a1f2e", border:"1px solid #2a3045", borderRadius:12, overflow:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr style={{ background:"#0f1422" }}>
                  {["發放日期","代號","市場","每股股息","持有股數","實際領取（原幣）","TWD 換算","操作"].map(h => (
                    <th key={h} style={{ padding:"12px 14px", color:"#6b7a99", fontWeight:600,
                      textAlign:["發放日期","代號","市場"].includes(h)?"left":"right",
                      whiteSpace:"nowrap", fontSize:11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...dividends].sort((a,b) => b.date.localeCompare(a.date)).map((d, i) => (
                  <tr key={d.id} style={{ borderTop:"1px solid #1e2535", background:i%2===0?"transparent":"#0f1422" }}>
                    <td style={{ padding:"10px 14px", color:"#8892a8" }}>{d.date}</td>
                    <td style={{ padding:"10px 14px", fontWeight:700, color:"#e2e8f0" }}>{d.symbol}</td>
                    <td style={{ padding:"10px 14px" }}><Badge color={d.market==="TW"?"#38bdf8":"#a78bfa"}>{d.market==="TW"?"台股":"美股"}</Badge></td>
                    <td style={{ padding:"10px 14px", textAlign:"right", color:"#e2e8f0" }}>{d.market==="TW"?"NT$":"$"}{(d.perShare||0).toFixed(2)}</td>
                    <td style={{ padding:"10px 14px", textAlign:"right", color:"#8892a8" }}>{fmt(d.sharesHeld||0)}</td>
                    <td style={{ padding:"10px 14px", textAlign:"right", color:"#34d399", fontWeight:700 }}>{d.market==="TW"?"NT$":"$"}{fmt(d.totalAmount,2)}</td>
                    <td style={{ padding:"10px 14px", textAlign:"right", color:"#e2e8f0" }}>NT${fmt(toTWD(d.totalAmount,d.market,usdTwd))}</td>
                    <td style={{ padding:"10px 14px", textAlign:"right" }}>
                      <button onClick={() => delDiv(d.id)}
                        style={{ background:"#2d1515", border:"1px solid #f8717133", borderRadius:6, color:"#f87171", padding:"3px 10px", cursor:"pointer", fontSize:11 }}>
                        刪除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        );
      })()}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── ADD TAB ──                                                        */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab==="add" && (
        <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
          <AddTradeForm onAdd={addTrade} />
          <AddDivForm   onAdd={addDividend} positions={positions} />
        </div>
      )}



      {/* ── EDIT TRADE MODAL ── */}
      {editingTrade && (
        <EditTradeModal
          trade={editingTrade}
          onSave={saveEditTrade}
          onDelete={deleteEditTrade}
          onClose={() => setEditingTrade(null)}
        />
      )}

      {/* ── EDIT POSITION MODAL ── */}
      {editingPosition && (
        <EditPositionModal
          position={editingPosition}
          onSave={rebasePosition}
          onClose={() => setEditingPosition(null)}
        />
      )}

      {/* ── FOOTER ── */}
      <div style={{ marginTop:36, textAlign:"center", color:"#2a3045", fontSize:11 }}>
        資料同步至 Firebase Firestore（my-portfolio-db-76f01）· 雲端報價：Yahoo Finance API · USD/TWD 即時匯率 {usdTwd.toFixed(3)}（exchangerate-api.com）· 僅供個人追蹤，非投資建議
      </div>
    </div>
  );
}
