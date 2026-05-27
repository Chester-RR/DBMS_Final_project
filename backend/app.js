//這是主要啟動後端的code
// = 後端主入口
// = 設定 middleware
// = 掛載各個功能檔案
// = 啟動 server

import express from "express";
import mysqlConnectionPool from "./lib/mysql.js";

import loginRoutes from "./features/login.js"; //之後開發好的功能就import

import gibberishRoutes from "./features/gibberish.js";

import levelRoutes from "./features/level.js"; // level / title / avatar frame routes
import reportRoutes from "./features/report.js"; // report / like / forum ranking routes

const app = express();

// first middleware 把前端送來的 JSON 資料解析成 req.body
app.use(express.json());

// request logger middleware：用來測試每次 request 有沒有進入後端
app.use((req, res, next) => {
  console.log("收到 request:", req.method, req.url);
  console.log("body:", req.body); // 印出前端送進來的 request，方便除錯
  next(); // middleware 處理完後，繼續往下一個 middleware 或 API route
});

// second middleware  允許前端網站向你的後端發送 request
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*"); // 設定前端網站的請求  事實上不會對所有的網站都開放  之後要改
  res.setHeader("Access-Control-Allow-Headers", "*");

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use("/user", loginRoutes); ////用到功能的middleware
app.use("/gibberish", gibberishRoutes);
app.use("/level", levelRoutes); //// 等級、稱號、頭像框功能
app.use("/report", reportRoutes);

app.get("/forum", async (req, res) => {
  try {
    const [rows] = await mysqlConnectionPool.query(`
      SELECT
        g.gibberish_id,
        g.content,
        g.created_at,
        u.user_name
      FROM Gibberish g
      JOIN User u ON g.user_id = u.user_id
      WHERE g.pinned = 1
      ORDER BY g.created_at DESC
    `);

    return res.json(rows);
  } catch (error) {
    console.error("Failed to get forum posts:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get forum posts",
    });
  }
});

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// 啟動後端 server，監聽 3000 port
app.listen(3000, () => {
  console.log("Server starts at port 3000");
});
