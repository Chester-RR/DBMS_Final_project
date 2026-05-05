// features/login.js
// = login / signup 相關 API
// = 處理 request
// = 執行 SQL
// = 回傳 response

import express from "express";
import mysqlConnectionPool from "../lib/mysql.js";

const router = express.Router();

// sign up 路由：處理註冊功能邏輯
router.post("/signup", async (req, res) => {
  // 1. 從前端 request body 拿資料
  const name = req.body["name"];
  const email = req.body["email"];
  const password = req.body["password"];

  // 2. 執行 SQL，把資料存進資料庫
  await mysqlConnectionPool.query(
    "INSERT INTO User (user_name, email, password) VALUES (?, ?, ?)",
    [name, email, password],
  );

  // 3. 回傳結果給前端
  return res.status(201).json({ success: true });
});

export default router;
