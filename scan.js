const fs = require("fs");
const https = require("https");

const coins = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "SUIUSDT"];

function getJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error("Parse Err"));
        }
      });
    }).on("error", (err) => reject(err));
  });
}

function ema(p, n) {
  let k = 2 / (n + 1);
  let e = p.at(0);
  for (let i = 1; i < p.length; i++) {
    e = p.at(i) * k + e * (1 - k);
  }
  return e;
}

function rsi(p) {
  let g = 0, l = 0, ag = 0, al = 0;
  for (let i = 1; i < p.length; i++) {
    let d = p.at(i) - p.at(i - 1);
    let gn = d > 0 ? d : 0;
    let ls = d < 0 ? -d : 0;
    if (i <= 14) {
      g += gn;
      l += ls;
      if (i === 14) { ag = g / 14; al = l / 14; }
    } else {
      ag = (ag * 13 + gn) / 14;
      al = (al * 13 + ls) / 14;
    }
  }
  return al === 0 ? 100 : 100 - (100 / (1 + ag / al));
}

async function getTF(s, iv) {
  const base = s.replace("USDT", "");
  const ep = iv === "15m"
    ? `histominute?fsym=${base}&tsym=USD&limit=210&aggregate=15`
    : `histohour?fsym=${base}&tsym=USD&limit=210&aggregate=${iv === "4h" ? 4 : 1}`;
  const url = `https://cryptocompare.com{ep}`;
  const j = await getJSON(url);
  if (!j.Data || !j.Data.Data || j.Data.Data.length === 0) throw new Error("No Data");
  const p = j.Data.Data.map((x) => parseFloat(x.close));
  const cp = p.at(-1);
  const e50 = ema(p, 50);
  const e200 = ema(p, 200);
  const r = rsi(p);
  const st = (cp > e50 && e50 > e200) ? "BUY" : (cp < e50 && e50 < e200) ? "SELL" : "SIDEWAYS";
  return { st, cp, r };
}

(async () => {
  const results = [];
  for (const c of coins) {
    try {
      const a = await getTF(c, "4h");
      const b = await getTF(c, "1h");
      const d = await getTF(c, "15m");
      let sig = "SIDEWAYS", code = "NONE";
      if (a.st === "BUY" && b.st === "BUY" && d.st === "BUY") {
        sig = d.r > 65 ? "BUY (RSI High)" : `STRONG BUY @ $${d.cp}`;
        if (d.r <= 65) code = "BUY";
      } else if (a.st === "SELL" && b.st === "SELL" && d.st === "SELL") {
        sig = d.r < 35 ? "SELL (RSI Low)" : `STRONG SELL @ $${d.cp}`;
        if (d.r >= 35) code = "SELL";
      }
      results.push({ c, cp: d.cp, t4: a.st, t1: b.st, t15: d.st, rsi: d.r.toFixed(1), sig, code });
    } catch (e) {
      results.push({ c, cp: 0, t4: "-", t1: "-", t15: "-", rsi: "-", sig: "Err: " + e.message, code: "ERR" });
    }
  }
  const out = { updated: new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" }), results };
  fs.writeFileSync("data.json", JSON.stringify(out, null, 2));
})();
