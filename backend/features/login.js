// features/login.js
// = login / signup 相關 API
// = 處理 request
// = 執行 SQL
// = 回傳 response

import express from "express";
import mysqlConnectionPool from "../lib/mysql.js";

const router = express.Router();
const DEFAULT_TITLE_NAME = "無名生成者";
const DEFAULT_FRAME_NAME = "新芽邊框";

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

  let connection;

  try {
    connection = await mysqlConnectionPool.getConnection();
    await connection.beginTransaction();

    const [result] = await connection.query(
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

    const userId = result.insertId;

    await connection.query(
      `
      INSERT INTO TitleAward (user_id, title_id, is_equipped)
      SELECT ?, title_id, TRUE
      FROM Title
      WHERE title_name = ?
      ON DUPLICATE KEY UPDATE is_equipped = VALUES(is_equipped)
      `,
      [userId, DEFAULT_TITLE_NAME],
    );

    await connection.query(
      `
      INSERT INTO UserAvatarFrame (user_id, frame_id, is_equipped)
      SELECT ?, frame_id, TRUE
      FROM AvatarFrame
      WHERE frame_name = ?
      ON DUPLICATE KEY UPDATE is_equipped = VALUES(is_equipped)
      `,
      [userId, DEFAULT_FRAME_NAME],
    );

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: "Signup successful",
      user: {
        user_id: userId,
        user_name: userName,
        email: email,
        admin: 0,
        level: 1,
        coin_balance: 2000,
      },
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

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
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

/*
  POST /user/login

  用途：
  使用者登入
  查出 user_id
  回傳給前端

  額外功能：
  登入成功後，新增一筆 system 通知到 Notification table。
  同一天只新增一次，避免通知中心被登入紀錄洗版。
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

    const user = users[0];

    /*
      錨點 1：
      登入成功後，先檢查今天是否已經有登入通知。
      有的話就不重複新增。
    */
    const loginNotificationContent = "你今天已成功登入 While The AI Thinks。";

    const [todayLoginNotifications] = await mysqlConnectionPool.query(
      `
      SELECT notification_id
      FROM Notification
      WHERE user_id = ?
        AND notification_type = 'system'
        AND content = ?
        AND DATE(created_time) = CURDATE()
      LIMIT 1
      `,
      [user.user_id, loginNotificationContent],
    );

    /*
      錨點 2：
      如果今天還沒有登入通知，就新增一筆 system 通知。
    */
    if (todayLoginNotifications.length === 0) {
      await mysqlConnectionPool.query(
        `
        INSERT INTO Notification (
          user_id,
          gibberish_id,
          gibberish_like_id,
          notification_type,
          is_read,
          content,
          created_time
        )
        VALUES (?, NULL, NULL, 'system', FALSE, ?, NOW())
        `,
        [user.user_id, loginNotificationContent],
      );
    }

    return res.json({
      success: true,
      message: "Login successful",
      user,
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
