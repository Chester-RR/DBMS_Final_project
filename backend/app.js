//這是主要啟動後端的code
// = 後端主入口
// = 設定 middleware
// = 掛載各個功能檔案
// = 啟動 server

import express from "express";
import mysqlConnectionPool from "./lib/mysql.js";

import loginRoutes from "./features/login.js"; //之後開發好的功能就import
import levelRoutes from "./features/level.js"; // level / title / avatar frame routes

const app = express();

// first middleware 把前端送來的 JSON 資料解析成 req.body
app.use(express.json());

// second middleware  允許前端網站向你的後端發送 request
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*"); // 設定前端網站的請求  事實上不會對所有的網站都開放  之後要改
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  next();
});

app.use("/user", loginRoutes); ////用到功能的middleware
app.use("/level", levelRoutes); //// 等級、稱號、頭像框功能

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// request logger middleware：用來測試每次 request 有沒有進入後端
app.use((req, res, next) => {
  console.log(req); // 印出前端送進來的 request，方便除錯
  next(); // middleware 處理完後，繼續往下一個 middleware 或 API route
});

// 測試 API：用來確認 server 是否正常運作
app.get("/ping", (req, res) => {
  // 如果成功進入 /ping，就回傳 Pong 給瀏覽器或前端
  return res.send("<h1>Pong!</h1>");
});

// 啟動後端 server，監聽 3000 port
app.listen(3000, () => {
  console.log("Server starts at port 3000");
});
