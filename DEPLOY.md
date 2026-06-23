# Dual-Engine Portfolio — 部署指南

把這個工具變成一個有固定網址、手機可以穩定打開的真正網站。整個過程約 10–15 分鐘，全程免費。

---

## 步驟 1：在電腦上整理專案資料夾

把這個壓縮包解壓縮後，你會看到這樣的結構：

```
portfolio-app/
├── index.html
├── package.json
├── vite.config.js
├── .gitignore
├── public/
│   └── manifest.json
└── src/
    ├── main.jsx
    ├── index.css
    └── App.jsx
```

打開終端機（Mac 用「終端機」App），切換到這個資料夾：

```bash
cd 路徑/portfolio-app
```

---

## 步驟 2：安裝套件並本機測試（建議先測試再部署）

```bash
npm install
npm run dev
```

終端機會顯示一個網址，通常是 `http://localhost:5173`，用瀏覽器打開，確認登入畫面正常顯示、能成功登入。測試完按 `Ctrl + C` 結束。

---

## 步驟 3：把專案推上 GitHub

如果你還沒有 GitHub 帳號，先到 [github.com](https://github.com) 免費註冊一個。

```bash
git init
git add .
git commit -m "Initial commit: Dual-Engine Portfolio"
```

到 GitHub 網站右上角「+」→「New repository」，建立一個新的 repo（例如取名 `portfolio-dashboard`），**不要**勾選「Add a README」。建立後，GitHub 會顯示一段指令，貼到終端機執行，大概長這樣：

```bash
git remote add origin https://github.com/你的帳號/portfolio-dashboard.git
git branch -M main
git push -u origin main
```

---

## 步驟 4：用 Vercel 一鍵部署

1. 前往 [vercel.com](https://vercel.com)，點選「Sign Up」，選擇「Continue with GitHub」直接用 GitHub 帳號登入（最簡單）
2. 登入後點選「Add New...」→「Project」
3. 在清單中找到你剛剛建立的 `portfolio-dashboard` repo，點選「Import」
4. Vercel 會自動偵測到這是 Vite 專案，所有設定（Build Command、Output Directory）都會自動帶好，**不需要更改任何設定**
5. 點選「Deploy」，等待 1–2 分鐘

部署完成後，Vercel 會給你一個網址，類似：

```
https://portfolio-dashboard-你的帳號.vercel.app
```

這就是你的固定網址，之後 Mac 跟 iPhone 都用這個網址打開即可，不會再有「伺服器不在線上」的問題（Vercel 是企業級的全球 CDN，穩定性遠高於 Artifact 預覽環境）。

---

## 步驟 5：⚠️ 重要 — 把新網址加入 Firebase 授權清單

這一步**一定要做**，否則 Google 登入會失敗：

1. 前往 [Firebase Console](https://console.firebase.google.com/) → 選擇專案 `my-portfolio-db-76f01`
2. 左側選單 **Authentication** → 上方頁籤 **Settings** → 找到 **Authorized domains**
3. 點選「Add domain」，貼上你的 Vercel 網址（不用加 `https://`，只要網域本身，例如 `portfolio-dashboard-你的帳號.vercel.app`）
4. 儲存

---

## 步驟 6：手機加入主畫面（變成像 App 一樣）

**iPhone (Safari)：**
打開你的 Vercel 網址 → 點下方分享圖示 → 「加入主畫面」→ 完成後桌面會出現一個圖示，點擊直接全螢幕打開，不會看到瀏覽器網址列。

**Android (Chrome)：**
打開網址 → 右上角選單「⋮」→「加到主畫面」。

---

## 之後如何更新程式碼？

每次你想更新功能（例如我再幫你改程式碼），流程是：

1. 把新的 `App.jsx` 覆蓋掉 `src/App.jsx`
2. 在終端機執行：
   ```bash
   git add .
   git commit -m "更新功能"
   git push
   ```
3. Vercel 會自動偵測到 GitHub 有新的 commit，**自動重新部署**，1 分鐘內網址會更新成最新版本，完全不需要手動操作 Vercel 介面。

---

## 常見問題

**Q: npm install 失敗怎麼辦？**
先確認電腦有安裝 Node.js（到 [nodejs.org](https://nodejs.org) 下載 LTS 版本），安裝完重開終端機再試一次。

**Q: Vercel 部署後畫面空白？**
打開瀏覽器開發者工具（F12）看 Console 有沒有紅色錯誤訊息，最常見是 Firebase 設定問題，截圖錯誤訊息給我即可協助排查。

**Q: 想用自己的網域名稱（例如 myportfolio.com）而不是 vercel.app？**
Vercel 專案設定裡的「Domains」可以綁定自訂網域，需要你自己持有該網域，綁定後同樣記得把新網域加進 Firebase Authorized domains。
