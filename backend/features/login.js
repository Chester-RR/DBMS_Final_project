// features/login.js
// = login / signup 相關 API
// = 處理 request
// = 執行 SQL
// = 回傳 response

import express from "express";
import mysqlConnectionPool from "../lib/mysql.js";

const router = express.Router();

/*
  POST /user/signup

  用途：
  註冊使用者
  新增一筆 User
  回傳真正的 user_id 給前端
*/
router.post("/signup", async (req, res) => {
  const userName = req.body["user_name"] || req.body["name"];
  const email = req.body["email"];
  const password = req.body["password"];

  if (!userName || !email || !password) {
    return res.status(400).json({
      success: false,
      message: "user_name, email, password are required",
    });
  }

  try {
    const [result] = await mysqlConnectionPool.query(
      `
      INSERT INTO User (
        user_name,
        email,
        password,
        created_at,
        updated_at,
        admin,
        level,
        coin_balance
      )
      VALUES (?, ?, ?, NOW(), NOW(), 0, 1, 2000)
      `,
      [userName, email, password],
    );

    return res.status(201).json({
      success: true,
      message: "Signup successful",
      user: {
        user_id: result.insertId,
        user_name: userName,
        email: email,
        admin: 0,
        level: 1,
        coin_balance: 2000,
      },
    });
  } catch (error) {
    console.error("Signup failed:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Email already exists",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Signup failed",
    });
  }
});

/*
  POST /user/login

  用途：
  使用者登入
  查出 user_id
  回傳給前端
*/
router.post("/login", async (req, res) => {
  const email = req.body["email"];
  const password = req.body["password"];

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "email and password are required",
    });
  }

  try {
    const [users] = await mysqlConnectionPool.query(
      `
      SELECT
        user_id,
        user_name,
        email,
        admin,
        level,
        coin_balance
      FROM User
      WHERE email = ? AND password = ?
      LIMIT 1
      `,
      [email, password],
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    return res.json({
      success: true,
      message: "Login successful",
      user: users[0],
    });
  } catch (error) {
    console.error("Login failed:", error);

    return res.status(500).json({
      success: false,
      message: "Login failed",
    });
  }
});

export default router;
