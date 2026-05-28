import express from "express";
import mysqlConnectionPool from "../lib/mysql.js";

const router = express.Router();

/* =========================
   錨點 1：檢查是否為管理員
========================= */
async function checkIsAdmin(userId) {
  const [users] = await mysqlConnectionPool.query(
    `
    SELECT admin
    FROM User
    WHERE user_id = ?
    `,
    [userId],
  );

  if (users.length === 0) {
    return false;
  }

  return Number(users[0].admin) === 1;
}

/* =========================
   錨點 2：一般使用者送出檢舉
   POST /report/gibberish
========================= */
router.post("/gibberish", async (req, res) => {
  try {
    const { user_id, gibberish_id, reason } = req.body;

    if (!user_id || !gibberish_id || !reason) {
      return res.status(400).json({
        success: false,
        message: "缺少 user_id、gibberish_id 或 reason",
      });
    }

    await mysqlConnectionPool.query(
      `
      INSERT INTO GibberishReport (
        user_id,
        gibberish_id,
        reason
      )
      VALUES (?, ?, ?)
      `,
      [user_id, gibberish_id, reason],
    );

    res.json({
      success: true,
      message: "檢舉成功",
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "你已經檢舉過這則亂語",
      });
    }

    console.error("Failed to report gibberish:", error);

    res.status(500).json({
      success: false,
      message: error.sqlMessage || error.message || "檢舉失敗",
    });
  }
});

/* =========================
   錨點 3：管理員取得待審核檢舉
   GET /report/pending?admin_user_id=2
========================= */
router.get("/pending", async (req, res) => {
  try {
    const { admin_user_id } = req.query;

    if (!admin_user_id) {
      return res.status(400).json({
        success: false,
        message: "缺少 admin_user_id",
      });
    }

    const isAdmin = await checkIsAdmin(admin_user_id);

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: "沒有管理員權限",
      });
    }

    const [reports] = await mysqlConnectionPool.query(
      `
      SELECT
        gr.report_id,
        gr.user_id AS reporter_id,
        reporter.user_name AS reporter_name,
        gr.gibberish_id,
        g.content,
        author.user_id AS author_id,
        author.user_name AS author_name,
        gr.reason,
        gr.status,
        gr.created_at
      FROM GibberishReport gr
      JOIN User reporter
        ON gr.user_id = reporter.user_id
      JOIN Gibberish g
        ON gr.gibberish_id = g.gibberish_id
      JOIN User author
        ON g.user_id = author.user_id
      WHERE gr.status = 'pending'
      ORDER BY gr.created_at DESC
      `,
    );

    res.json({
      success: true,
      reports,
    });
  } catch (error) {
    console.error("Failed to get pending reports:", error);

    res.status(500).json({
      success: false,
      message: error.sqlMessage || error.message || "取得檢舉列表失敗",
    });
  }
});

/* =========================
   錨點 4：管理員判定檢舉成立
   POST /report/:report_id/approve
========================= */
router.post("/:report_id/approve", async (req, res) => {
  try {
    const { report_id } = req.params;
    const { admin_user_id } = req.body;

    if (!admin_user_id) {
      return res.status(400).json({
        success: false,
        message: "缺少 admin_user_id",
      });
    }

    const isAdmin = await checkIsAdmin(admin_user_id);

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: "沒有管理員權限",
      });
    }

    const [reports] = await mysqlConnectionPool.query(
      `
      SELECT gibberish_id
      FROM GibberishReport
      WHERE report_id = ?
      `,
      [report_id],
    );

    if (reports.length === 0) {
      return res.status(404).json({
        success: false,
        message: "找不到這筆檢舉",
      });
    }

    const gibberishId = reports[0].gibberish_id;

    await mysqlConnectionPool.query(
      `
      UPDATE Gibberish
      SET is_hidden = TRUE
      WHERE gibberish_id = ?
      `,
      [gibberishId],
    );

    await mysqlConnectionPool.query(
      `
      UPDATE GibberishReport
      SET status = 'reviewed'
      WHERE gibberish_id = ?
        AND status = 'pending'
      `,
      [gibberishId],
    );

    res.json({
      success: true,
      message: "已判定檢舉成立，亂語已隱藏",
    });
  } catch (error) {
    console.error("Failed to approve report:", error);

    res.status(500).json({
      success: false,
      message: error.sqlMessage || error.message || "審核檢舉失敗",
    });
  }
});

/* =========================
   錨點 5：管理員判定檢舉不成立
   POST /report/:report_id/reject
========================= */
router.post("/:report_id/reject", async (req, res) => {
  try {
    const { report_id } = req.params;
    const { admin_user_id } = req.body;

    if (!admin_user_id) {
      return res.status(400).json({
        success: false,
        message: "缺少 admin_user_id",
      });
    }

    const isAdmin = await checkIsAdmin(admin_user_id);

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: "沒有管理員權限",
      });
    }

    await mysqlConnectionPool.query(
      `
      UPDATE GibberishReport
      SET status = 'rejected'
      WHERE report_id = ?
      `,
      [report_id],
    );

    res.json({
      success: true,
      message: "已判定檢舉不成立",
    });
  } catch (error) {
    console.error("Failed to reject report:", error);

    res.status(500).json({
      success: false,
      message: error.sqlMessage || error.message || "駁回檢舉失敗",
    });
  }
});

export default router;
