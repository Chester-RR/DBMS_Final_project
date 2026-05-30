import express from "express";
import mysqlConnectionPool from "../lib/mysql.js";

const router = express.Router();
const FORUM_RESONANCE_TITLE_NAME = "論壇共鳴者";
const FORUM_RESONANCE_BADGE = {
  label: FORUM_RESONANCE_TITLE_NAME,
  icon: "campaign",
};

async function awardForumResonanceTitleIfEligible(connection, userId) {
  const [likeRows] = await connection.query(
    `
    SELECT COUNT(*) AS received_like_count
    FROM GibberishLike gl
    JOIN Gibberish g
      ON gl.gibberish_id = g.gibberish_id
    WHERE g.user_id = ?
      AND gl.user_id <> g.user_id
    `,
    [userId],
  );

  const receivedLikeCount = Number(likeRows[0].received_like_count);

  if (receivedLikeCount < 10) {
    return false;
  }

  const [result] = await connection.query(
    `
    INSERT IGNORE INTO TitleAward (user_id, title_id, is_equipped)
    SELECT ?, title_id, FALSE
    FROM Title
    WHERE title_name = ?
    `,
    [userId, FORUM_RESONANCE_TITLE_NAME],
  );

  return result.affectedRows > 0;
}

async function userHasForumResonanceTitle(connection, userId) {
  const [rows] = await connection.query(
    `
    SELECT ta.title_award_id
    FROM TitleAward ta
    JOIN Title title
      ON ta.title_id = title.title_id
    WHERE ta.user_id = ?
      AND title.title_name = ?
    LIMIT 1
    `,
    [userId, FORUM_RESONANCE_TITLE_NAME],
  );

  return rows.length > 0;
}

/*
  GET /forum?user_id=1

  用途：
  取得所有使用者釘選到論壇的亂語
  給 forum.html 的「全部亂語」區塊使用

  user_id 是目前登入者，用來判斷 liked_by_me
  如果沒有傳 user_id，也可以正常回傳論壇資料，只是 liked_by_me 會是 false
*/
router.get("/", async (req, res) => {
  const viewerUserId = Number(req.query.user_id) || 0;

  try {
    const [forumPosts] = await mysqlConnectionPool.query(
      `
      SELECT
        g.gibberish_id,
        g.user_id,
        u.user_name,
        g.template_id,
        t.template_name,
        g.content,
        g.created_at,
        g.pinned,
        EXISTS (
          SELECT 1
          FROM TitleAward ta
          JOIN Title title
            ON ta.title_id = title.title_id
          WHERE ta.user_id = g.user_id
            AND title.title_name = ?
        ) AS author_has_forum_resonance_badge,
        COUNT(gl.gibberish_like_id) AS like_count,
        MAX(
          CASE
            WHEN gl.user_id = ? THEN 1
            ELSE 0
          END
        ) AS liked_by_me
      FROM Gibberish g
      JOIN User u
        ON g.user_id = u.user_id
      JOIN Template t
        ON g.template_id = t.template_id
      LEFT JOIN GibberishLike gl
        ON g.gibberish_id = gl.gibberish_id
      WHERE g.pinned = TRUE
        AND g.is_hidden = FALSE
      GROUP BY
        g.gibberish_id,
        g.user_id,
        u.user_name,
        g.template_id,
        t.template_name,
        g.content,
        g.created_at,
        g.pinned
      ORDER BY g.created_at DESC
      `,
      [FORUM_RESONANCE_TITLE_NAME, viewerUserId],
    );

    res.json({
      success: true,
      posts: forumPosts.map((post) => ({
        gibberish_id: post.gibberish_id,
        user_id: post.user_id,
        user_name: post.user_name,
        template_id: post.template_id,
        template_name: post.template_name,
        content: post.content,
        created_at: post.created_at,
        pinned: Boolean(post.pinned),
        like_count: Number(post.like_count),
        liked_by_me: Boolean(post.liked_by_me),
        author_badge: post.author_has_forum_resonance_badge
          ? FORUM_RESONANCE_BADGE
          : null,
      })),
    });
  } catch (error) {
    console.error("Failed to get forum posts:", error);

    res.status(500).json({
      success: false,
      message: "Failed to get forum posts",
    });
  }
});

/*
  GET /forum/top-liked-today?user_id=1

  用途：
  取得今天收到最多愛心的前三名置頂亂語
  給 forum.html 的「今日人氣前三名」區塊使用
*/
router.get("/top-liked-today", async (req, res) => {
  const viewerUserId = Number(req.query.user_id) || 0;

  try {
    const [rankings] = await mysqlConnectionPool.query(
      `
      SELECT
        g.gibberish_id,
        g.user_id,
        u.user_name,
        g.template_id,
        t.template_name,
        g.content,
        g.created_at,
        g.pinned,
        EXISTS (
          SELECT 1
          FROM TitleAward ta
          JOIN Title title
            ON ta.title_id = title.title_id
          WHERE ta.user_id = g.user_id
            AND title.title_name = ?
        ) AS author_has_forum_resonance_badge,
        COUNT(today_like.gibberish_like_id) AS like_count,
        MAX(
          CASE
            WHEN my_like.user_id IS NOT NULL THEN 1
            ELSE 0
          END
        ) AS liked_by_me
      FROM Gibberish g
      JOIN User u
        ON g.user_id = u.user_id
      JOIN Template t
        ON g.template_id = t.template_id
      JOIN GibberishLike today_like
        ON g.gibberish_id = today_like.gibberish_id
        AND DATE(today_like.created_at) = CURDATE()
      LEFT JOIN GibberishLike my_like
        ON g.gibberish_id = my_like.gibberish_id
        AND my_like.user_id = ?
      WHERE g.pinned = TRUE
        AND g.is_hidden = FALSE
      GROUP BY
        g.gibberish_id,
        g.user_id,
        u.user_name,
        g.template_id,
        t.template_name,
        g.content,
        g.created_at,
        g.pinned
      ORDER BY like_count DESC, g.gibberish_id DESC
      LIMIT 3
      `,
      [FORUM_RESONANCE_TITLE_NAME, viewerUserId],
    );

    res.json({
      success: true,
      rankings: rankings.map((item, index) => ({
        rank: index + 1,
        gibberish_id: item.gibberish_id,
        user_id: item.user_id,
        user_name: item.user_name,
        template_id: item.template_id,
        template_name: item.template_name,
        content: item.content,
        created_at: item.created_at,
        pinned: Boolean(item.pinned),
        like_count: Number(item.like_count),
        liked_by_me: Boolean(item.liked_by_me),
        author_badge: item.author_has_forum_resonance_badge
          ? FORUM_RESONANCE_BADGE
          : null,
      })),
    });
  } catch (error) {
    console.error("Failed to get today's top liked forum posts:", error);

    res.status(500).json({
      success: false,
      message: "Failed to get today's top liked forum posts",
    });
  }
});

/*
  POST /forum/likes/toggle

  用途：
  對論壇中的置頂亂語按讚 / 取消讚

  body:
  {
    "user_id": 1,
    "gibberish_id": 5
  }
*/
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

  const connection = await mysqlConnectionPool.getConnection();

  try {
    await connection.beginTransaction();

    /*
      錨點 1：
      這裡不只查 gibberish_id，
      也查 owner_user_id 和 content，
      因為等等新增通知時需要知道通知要給誰。
    */
    const [gibberishes] = await connection.query(
      `
      SELECT
        gibberish_id,
        user_id AS owner_user_id,
        content
      FROM Gibberish
      WHERE gibberish_id = ?
        AND pinned = TRUE
        AND is_hidden = FALSE
      LIMIT 1
      `,
      [gibberishId],
    );

    if (gibberishes.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Pinned gibberish not found",
      });
    }

    const gibberishOwnerId = Number(gibberishes[0].owner_user_id);
    const gibberishContent = gibberishes[0].content;

    const [existingLikes] = await connection.query(
      `
      SELECT gibberish_like_id
      FROM GibberishLike
      WHERE user_id = ?
        AND gibberish_id = ?
      LIMIT 1
      `,
      [userId, gibberishId],
    );

    let liked = false;

    if (existingLikes.length > 0) {
      /*
        取消愛心：
        只刪除 GibberishLike。
        依照你的需求，取消愛心不新增 Notification，也不刪 Notification。
      */
      await connection.query(
        `
        DELETE FROM GibberishLike
        WHERE user_id = ?
          AND gibberish_id = ?
        `,
        [userId, gibberishId],
      );
    } else {
      /*
        錨點 2：
        新增愛心，並取得這次新增的 gibberish_like_id。
        這個 id 會記錄到 Notification.gibberish_like_id。
      */
      const [likeResult] = await connection.query(
        `
        INSERT INTO GibberishLike (
          user_id,
          gibberish_id,
          created_at
        )
        VALUES (?, ?, NOW())
        `,
        [userId, gibberishId],
      );

      const gibberishLikeId = likeResult.insertId;
      liked = true;

      /*
        錨點 3：
        新增 like 通知。
        注意：Notification.user_id 要放亂語作者，不是按讚的人。
        自己按自己的亂語，不通知自己。
      */
      if (gibberishOwnerId !== userId) {
        await connection.query(
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
          VALUES (?, ?, ?, 'like', FALSE, ?, NOW())
          `,
          [
            gibberishOwnerId,
            gibberishId,
            gibberishLikeId,
            `有人按讚了你的亂語：「${gibberishContent}」`,
          ],
        );
      }
    }

    const [countRows] = await connection.query(
      `
      SELECT COUNT(*) AS like_count
      FROM GibberishLike
      WHERE gibberish_id = ?
      `,
      [gibberishId],
    );

    const likeCount = Number(countRows[0].like_count);

    /*
      錨點 4：
      成就通知。
      只有「這次是真的新增愛心」才檢查成就。
      取消愛心不會觸發成就。
    */
    if (liked && gibberishOwnerId !== userId) {
      await awardForumResonanceTitleIfEligible(connection, gibberishOwnerId);

      let achievementContent = "";

      if (likeCount === 1) {
        achievementContent = `你的亂語第一次收到愛心：「${gibberishContent}」`;
      } else if (likeCount === 3) {
        achievementContent = `你的亂語人氣突破 3 個愛心：「${gibberishContent}」`;
      } else if (likeCount === 10) {
        achievementContent = `你的亂語人氣突破 10 個愛心：「${gibberishContent}」`;
      }

      /*
        避免同一個成就重複出現。
        例如有人取消讚後又按回來，like_count 又回到 3，
        這裡會先檢查是否已經有同樣的 achievement 通知。
      */
      if (achievementContent) {
        const [existingAchievementNotifications] = await connection.query(
          `
          SELECT notification_id
          FROM Notification
          WHERE user_id = ?
            AND gibberish_id = ?
            AND notification_type = 'achievement'
            AND content = ?
          LIMIT 1
          `,
          [gibberishOwnerId, gibberishId, achievementContent],
        );

        if (existingAchievementNotifications.length === 0) {
          await connection.query(
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
            VALUES (?, ?, NULL, 'achievement', FALSE, ?, NOW())
            `,
            [gibberishOwnerId, gibberishId, achievementContent],
          );
        }
      }
    }

    const authorHasForumResonanceBadge = await userHasForumResonanceTitle(
      connection,
      gibberishOwnerId,
    );

    await connection.commit();

    res.json({
      success: true,
      gibberish_id: gibberishId,
      liked,
      like_count: likeCount,
      author_badge: authorHasForumResonanceBadge ? FORUM_RESONANCE_BADGE : null,
    });
  } catch (error) {
    await connection.rollback();

    console.error("Failed to toggle forum like:", error);

    if (error.code === "ER_NO_REFERENCED_ROW_2") {
      return res.status(404).json({
        success: false,
        message: "User or gibberish not found",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to toggle forum like",
    });
  } finally {
    connection.release();
  }
});

export default router;
