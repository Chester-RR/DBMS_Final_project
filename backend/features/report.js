import express from "express";
import mysqlConnectionPool from "../lib/mysql.js";

const router = express.Router();

async function ensureLikeTable() {
  await mysqlConnectionPool.query(`
    CREATE TABLE IF NOT EXISTS GibberishLike (
      gibberish_like_id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      gibberish_id INT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT uq_gibberishlike_user_gibberish
        UNIQUE (user_id, gibberish_id),

      CONSTRAINT fk_gibberishlike_user
        FOREIGN KEY (user_id) REFERENCES User(user_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

      CONSTRAINT fk_gibberishlike_gibberish
        FOREIGN KEY (gibberish_id) REFERENCES Gibberish(gibberish_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
    ) ENGINE=InnoDB
  `);
}

async function getAdminUser(userId) {
  const [users] = await mysqlConnectionPool.query(
    "SELECT user_id, admin FROM User WHERE user_id = ? LIMIT 1",
    [userId],
  );

  const user = users[0];
  if (!user || Number(user.admin) !== 1) return null;
  return user;
}

router.post("/", async (req, res) => {
  const { reporter_id, gibberish_id, reason } = req.body;

  if (!reporter_id) {
    return res.status(401).json({
      success: false,
      message: "Please log in before reporting",
    });
  }

  if (!gibberish_id || !reason || !String(reason).trim()) {
    return res.status(400).json({
      success: false,
      message: "gibberish_id and reason are required",
    });
  }

  try {
    const [result] = await mysqlConnectionPool.query(
      `
      INSERT INTO Report (
        reporter_id,
        gibberish_id,
        reason,
        status,
        created_at
      )
      VALUES (?, ?, ?, 'pending', NOW())
      `,
      [reporter_id, gibberish_id, String(reason).trim()],
    );

    return res.status(201).json({
      success: true,
      message: "Report submitted",
      report_id: result.insertId,
    });
  } catch (error) {
    console.error("Failed to submit report:", error);

    if (error.code === "ER_NO_REFERENCED_ROW_2") {
      return res.status(404).json({
        success: false,
        message: "Reporter or gibberish not found",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to submit report",
    });
  }
});

router.get("/likes", async (req, res) => {
  const gibberishIds = String(req.query.gibberish_ids || "")
    .split(",")
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
  const userId = Number(req.query.user_id);

  if (gibberishIds.length === 0) {
    return res.json({ success: true, likes: [] });
  }

  try {
    await ensureLikeTable();

    const [countRows] = await mysqlConnectionPool.query(
      `
      SELECT gibberish_id, COUNT(*) AS like_count
      FROM GibberishLike
      WHERE gibberish_id IN (?)
      GROUP BY gibberish_id
      `,
      [gibberishIds],
    );

    let likedRows = [];
    if (Number.isInteger(userId) && userId > 0) {
      const [rows] = await mysqlConnectionPool.query(
        `
        SELECT gibberish_id
        FROM GibberishLike
        WHERE user_id = ? AND gibberish_id IN (?)
        `,
        [userId, gibberishIds],
      );
      likedRows = rows;
    }

    const countById = new Map(
      countRows.map((row) => [Number(row.gibberish_id), Number(row.like_count)]),
    );
    const likedSet = new Set(likedRows.map((row) => Number(row.gibberish_id)));

    return res.json({
      success: true,
      likes: gibberishIds.map((id) => ({
        gibberish_id: id,
        like_count: countById.get(id) || 0,
        liked_by_me: likedSet.has(id),
      })),
    });
  } catch (error) {
    console.error("Failed to get likes:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get likes",
    });
  }
});

router.post("/likes/toggle", async (req, res) => {
  const userId = Number(req.body.user_id);
  const gibberishId = Number(req.body.gibberish_id);

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(401).json({
      success: false,
      message: "Please log in before liking",
    });
  }

  if (!Number.isInteger(gibberishId) || gibberishId <= 0) {
    return res.status(400).json({
      success: false,
      message: "gibberish_id is required",
    });
  }

  try {
    await ensureLikeTable();

    const [existingLikes] = await mysqlConnectionPool.query(
      "SELECT gibberish_like_id FROM GibberishLike WHERE user_id = ? AND gibberish_id = ? LIMIT 1",
      [userId, gibberishId],
    );

    let liked = false;

    if (existingLikes.length > 0) {
      await mysqlConnectionPool.query(
        "DELETE FROM GibberishLike WHERE user_id = ? AND gibberish_id = ?",
        [userId, gibberishId],
      );
    } else {
      await mysqlConnectionPool.query(
        "INSERT INTO GibberishLike (user_id, gibberish_id) VALUES (?, ?)",
        [userId, gibberishId],
      );
      liked = true;
    }

    const [countRows] = await mysqlConnectionPool.query(
      "SELECT COUNT(*) AS like_count FROM GibberishLike WHERE gibberish_id = ?",
      [gibberishId],
    );

    return res.json({
      success: true,
      gibberish_id: gibberishId,
      liked,
      like_count: Number(countRows[0].like_count),
    });
  } catch (error) {
    console.error("Failed to toggle like:", error);

    if (error.code === "ER_NO_REFERENCED_ROW_2") {
      return res.status(404).json({
        success: false,
        message: "User or gibberish not found",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to toggle like",
    });
  }
});

router.get("/", async (req, res) => {
  const adminId = req.query.admin_id;

  if (!adminId) {
    return res.status(401).json({
      success: false,
      message: "admin_id is required",
    });
  }

  try {
    const adminUser = await getAdminUser(adminId);

    if (!adminUser) {
      return res.status(403).json({
        success: false,
        message: "Admin permission required",
      });
    }

    const [reports] = await mysqlConnectionPool.query(
      `
      SELECT
        r.report_id,
        r.reporter_id,
        reporter.user_name AS reporter_name,
        r.gibberish_id,
        g.content,
        g.pinned,
        author.user_name AS author_name,
        r.reason,
        r.status,
        r.created_at
      FROM Report r
      LEFT JOIN User reporter ON r.reporter_id = reporter.user_id
      LEFT JOIN Gibberish g ON r.gibberish_id = g.gibberish_id
      LEFT JOIN User author ON g.user_id = author.user_id
      WHERE r.status = 'pending'
      ORDER BY r.created_at DESC
      `,
    );

    return res.json({
      success: true,
      reports,
    });
  } catch (error) {
    console.error("Failed to get reports:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get reports",
    });
  }
});

router.patch("/:reportId", async (req, res) => {
  const { admin_id, status } = req.body;
  const allowedStatuses = ["pending", "reviewed", "rejected", "resolved"];

  if (!admin_id) {
    return res.status(401).json({
      success: false,
      message: "admin_id is required",
    });
  }

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Invalid report status",
    });
  }

  const connection = await mysqlConnectionPool.getConnection();

  try {
    const adminUser = await getAdminUser(admin_id);

    if (!adminUser) {
      return res.status(403).json({
        success: false,
        message: "Admin permission required",
      });
    }

    await connection.beginTransaction();

    const [reports] = await connection.query(
      "SELECT report_id, gibberish_id FROM Report WHERE report_id = ? LIMIT 1",
      [req.params.reportId],
    );

    if (reports.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }

    const report = reports[0];

    const [result] = await connection.query(
      "UPDATE Report SET status = ? WHERE report_id = ?",
      [status, req.params.reportId],
    );

    if (status === "resolved") {
      await connection.query(
        "UPDATE Gibberish SET pinned = 0 WHERE gibberish_id = ?",
        [report.gibberish_id],
      );
    }

    await connection.commit();

    return res.json({
      success: true,
      message: "Report status updated",
      removed_from_forum: status === "resolved",
    });
  } catch (error) {
    await connection.rollback();
    console.error("Failed to update report:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update report",
    });
  } finally {
    connection.release();
  }
});

export default router;
