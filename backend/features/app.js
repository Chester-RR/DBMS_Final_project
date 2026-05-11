// 這是主要啟動後端的 code
// = 後端主入口
// = 設定 middleware
// = 掛載各個功能檔案
// = 啟動 server

import express from "express";

import loginRoutes from "./features/login.js";
import shopRoutes from "./features/shop.js";

const app = express();

// 把前端送來的 JSON 資料解析成 req.body
app.use(express.json());

// 允許前端網站向你的後端發送 request
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// 掛載功能 route
app.use("/user", loginRoutes);
app.use("/shop", shopRoutes);

// 測試 API：用來確認 server 是否正常運作
app.get("/ping", (req, res) => {
  return res.send("<h1>Pong!</h1>");
});

// 啟動後端 server，監聽 3000 port
app.listen(3000, () => {
  console.log("Server starts at port 3000");
});