// features/notification.js
import express from "express";
import mysqlConnectionPool from "../lib/mysql.js";

const router = express.Router();

// GET: 取得使用者的通知列表
router.get("/", async (req, res) => {
  const userId = req.query.user_id || 101; 

  try {
    const [rows] = await mysqlConnectionPool.query(
      `SELECT 
        notification_id AS id, 
        notification_type AS type, 
        content, 
        is_read AS isRead, 
        created_time AS createdAt,
        gibberish_id
       FROM Notification 
       WHERE user_id = ? 
       ORDER BY created_time DESC`,
      [userId]
    );

    const formattedData = rows.map(notification => {
      const upperType = notification.type.toUpperCase();
      let defaultTitle = "📢 系統通知";
      if (upperType === "LIKE") defaultTitle = "👍 有人懂你的幽默！";
      if (upperType === "ACHIEVEMENT") defaultTitle = "🏆 修仙突破！";

      return {
        ...notification,
        type: upperType,
        title: defaultTitle,
        isRead: Boolean(notification.isRead),
        createdAt: new Date(notification.createdAt).toLocaleDateString("zh-TW")
      };
    });

    res.json({
      success: true,
      data: formattedData
    });

  } catch (error) {
    console.error("撈取資料庫通知失敗:", error);
    res.status(500).json({ success: false, message: "資料庫連線錯誤" });
  }
});

// PATCH: 將單一通知標記為已讀
router.patch("/:id/read", async (req, res) => {
  const notificationId = req.params.id;

  try {
    const [result] = await mysqlConnectionPool.query(
      "UPDATE Notification SET is_read = TRUE WHERE notification_id = ?",
      [notificationId]
    );

    if (result.affectedRows > 0) {
      res.json({ success: true, message: "標記已讀成功" });
    } else {
      res.status(404).json({ success: false, message: "找不到該筆通知紀錄" });
    }
  } catch (error) {
    console.error("更新單一已讀失敗:", error);
    res.status(500).json({ success: false, message: "資料庫更新失敗" });
  }
});

// PATCH: 將單一通知復原為未讀
router.patch("/:id/unread", async (req, res) => {
  const notificationId = req.params.id;

  try {
    const [result] = await mysqlConnectionPool.query(
      "UPDATE Notification SET is_read = FALSE WHERE notification_id = ?",
      [notificationId]
    );

    if (result.affectedRows > 0) {
      res.json({ success: true, message: "復原未讀成功" });
    } else {
      res.status(404).json({ success: false, message: "找不到該筆通知紀錄" });
    }
  } catch (error) {
    console.error("復原未讀失敗:", error);
    res.status(500).json({ success: false, message: "資料庫更新失敗" });
  }
});

// PATCH: 全部標記為已讀
router.patch("/read-all", async (req, res) => {
  const userId = req.body?.user_id || 101;

  try {
    await mysqlConnectionPool.query(
      "UPDATE Notification SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE",
      [userId]
    );

    res.json({ success: true, message: "全部標記已讀成功" });
  } catch (error) {
    console.error("全部標記已讀失敗:", error);
    res.status(500).json({ success: false, message: "資料庫批量更新失敗" });
  }
});

export default router;