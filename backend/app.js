//這是主要啟動後端的code
// = 後端主入口
// = 設定 middleware
// = 掛載各個功能檔案
// = 啟動 server

import express from "express";
import mysqlConnectionPool from "./lib/mysql.js";

import loginRoutes from "./features/login.js";
import gibberishRoutes from "./features/gibberish.js";
import levelRoutes from "./features/level.js"; 
import notificationRoutes from "./features/notification.js"; 
import shopRoutes from "./features/shop.js";

const app = express();

app.use(express.json());


// request logger middleware：用來測試每次 request 有沒有進入後端
app.use((req, res, next) => {
  console.log("收到 request:", req.method, req.url);
  console.log("body:", req.body);
  next();
});

// CORS middleware：允許前端網站向你的後端發送 request
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  );
  next();
});

app.use("/user", loginRoutes);
app.use("/gibberish", gibberishRoutes);
app.use("/shop", shopRoutes);
app.use("/level", levelRoutes);
app.use("/api/notifications", notificationRoutes);

app.get("/ping", (req, res) => {
  return res.send("<h1>Pong!</h1>");
});

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// 啟動後端 server，監聽 3000 port

app.listen(3000, () => {
  console.log("Server starts at port 3000");
});