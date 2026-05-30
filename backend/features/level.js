import express from "express";
import mysqlConnectionPool from "../lib/mysql.js";

const router = express.Router();

const MAX_LEVEL = 50;
const GENERATIONS_PER_LEVEL = 5;
const LOYAL_CUSTOMER_AVATAR_NAME = "\u5546\u5e97\u5e38\u5ba2\u9650\u5b9a\u982d\u50cf";

function calculateLevel(generationCount) {
  const safeCount = Number(generationCount) || 0;
  return Math.min(MAX_LEVEL, Math.floor(safeCount / GENERATIONS_PER_LEVEL) + 1);
}

function getAccountAgeDays(createdAt) {
  const createdTime = new Date(createdAt).getTime();
  if (Number.isNaN(createdTime)) return 0;
  return Math.floor((Date.now() - createdTime) / 86400000);
}

function titleRequirementIsMet(requirement, user) {
  const accountAgeDays = getAccountAgeDays(user.created_at);

  if (requirement.includes("level >= 45")) return user.level >= 45;
  if (requirement.includes("level >= 35")) return user.level >= 35;
  if (requirement.includes("level >= 25")) return user.level >= 25;
  if (requirement.includes("level >= 15")) return user.level >= 15;
  if (requirement.includes("level >= 5")) return user.level >= 5;
  if (requirement.includes("level >= 1")) return user.level >= 1;
  if (requirement.includes("account_age_days >= 30")) return accountAgeDays >= 30;
  if (requirement.includes("received_like_count >= 10")) {
    return Number(user.received_like_count) >= 10;
  }
  if (requirement.includes("owned_avatar_count >= 3")) {
    return Number(user.owned_avatar_count) >= 3;
  }
  if (requirement.includes("generation_count >= 100")) return user.generation_count >= 100;
  if (requirement.includes("generation_count >= 50")) return user.generation_count >= 50;
  if (requirement.includes("generation_count >= 30")) return user.generation_count >= 30;

  return false;
}

function parsePositiveInteger(value) {
  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue) || parsedValue <= 0) return null;
  return parsedValue;
}

async function getUser(userId) {
  const [rows] = await mysqlConnectionPool.query(
    `SELECT
       u.user_id,
       u.user_name,
       u.email,
       u.created_at,
       u.level,
       u.coin_balance,
       u.generation_count,
       COALESCE((
         SELECT COUNT(*)
         FROM GibberishLike gl
         JOIN Gibberish g
           ON gl.gibberish_id = g.gibberish_id
         WHERE g.user_id = u.user_id
           AND gl.user_id <> u.user_id
       ), 0) AS received_like_count,
       COALESCE((
         SELECT COUNT(*)
         FROM UserItem ui
         JOIN ShopItem si
           ON ui.item_id = si.item_id
         WHERE ui.user_id = u.user_id
           AND si.item_type = 'avatar'
           AND si.item_name <> ?
       ), 0) AS owned_avatar_count
     FROM User u
     WHERE u.user_id = ?`,
    [LOYAL_CUSTOMER_AVATAR_NAME, userId],
  );

  return rows[0];
}

async function awardEligibleTitles(user) {
  const [titles] = await mysqlConnectionPool.query(
    "SELECT title_id, title_name, requirement FROM Title",
  );

  const awardedTitles = [];

  for (const title of titles) {
    if (!titleRequirementIsMet(title.requirement, user)) continue;

    const [result] = await mysqlConnectionPool.query(
      "INSERT IGNORE INTO TitleAward (user_id, title_id) VALUES (?, ?)",
      [user.user_id, title.title_id],
    );

    if (result.affectedRows > 0) {
      awardedTitles.push(title);
    }
  }

  return awardedTitles;
}

async function awardEligibleFrames(user) {
  const [frames] = await mysqlConnectionPool.query(
    "SELECT frame_id, frame_name, unlock_level FROM AvatarFrame WHERE unlock_level <= ?",
    [user.level],
  );

  const awardedFrames = [];

  for (const frame of frames) {
    const [result] = await mysqlConnectionPool.query(
      "INSERT IGNORE INTO UserAvatarFrame (user_id, frame_id) VALUES (?, ?)",
      [user.user_id, frame.frame_id],
    );

    if (result.affectedRows > 0) {
      awardedFrames.push(frame);
    }
  }

  return awardedFrames;
}

async function syncUserRewards(userId) {
  const user = await getUser(userId);
  if (!user) return null;

  const level = calculateLevel(user.generation_count);

  if (level !== user.level) {
    await mysqlConnectionPool.query(
      "UPDATE User SET level = ? WHERE user_id = ?",
      [level, userId],
    );
    user.level = level;
  }

  const awardedTitles = await awardEligibleTitles(user);
  const awardedFrames = await awardEligibleFrames(user);

  return { user, awardedTitles, awardedFrames };
}

async function getUserLevelProfile(userId) {
  const syncResult = await syncUserRewards(userId);
  if (!syncResult) return null;

  const { user, awardedTitles, awardedFrames } = syncResult;

  const [titleRows] = await mysqlConnectionPool.query(
    `SELECT t.title_id, t.title_name, t.description, t.requirement, ta.earned_at, ta.is_equipped
     FROM TitleAward ta
     JOIN Title t ON ta.title_id = t.title_id
     WHERE ta.user_id = ?
     ORDER BY ta.is_equipped DESC, t.title_id DESC`,
    [userId],
  );

  const [frameRows] = await mysqlConnectionPool.query(
    `SELECT af.frame_id, af.frame_name, af.description, af.unlock_level, af.rarity,
            af.border_color, af.glow_color, af.background_css, uaf.earned_at, uaf.is_equipped
     FROM UserAvatarFrame uaf
     JOIN AvatarFrame af ON uaf.frame_id = af.frame_id
     WHERE uaf.user_id = ?
     ORDER BY uaf.is_equipped DESC, af.unlock_level DESC`,
    [userId],
  );

  const currentTitle = titleRows[0] || {
    title_name: "無名生成者",
    description: "尚未獲得稱號",
    requirement: "level >= 5",
  };

  const currentFrame = frameRows[0] || {
    frame_name: "新芽邊框",
    unlock_level: 1,
    rarity: "common",
    border_color: "#82b8a4",
    glow_color: "rgba(0, 105, 68, 0.18)",
    background_css: "linear-gradient(135deg, rgba(255,255,255,0.92), rgba(192,254,229,0.82))",
  };

  const nextLevelGenerationTarget = user.level >= MAX_LEVEL
    ? null
    : user.level * GENERATIONS_PER_LEVEL;

  return {
    user: {
      id: user.user_id,
      name: user.user_name,
      email: user.email,
      level: user.level,
      generation_count: user.generation_count,
      max_level: MAX_LEVEL,
      next_level_generation_target: nextLevelGenerationTarget,
    },
    currentTitle,
    currentFrame,
    earnedTitles: titleRows,
    earnedFrames: frameRows,
    newlyAwarded: {
      titles: awardedTitles,
      frames: awardedFrames,
    },
  };
}

// 裝備類 API 先同步獎勵，再用 transaction 驗證擁有權與切換裝備狀態。
async function equipOwnedTitle(userId, titleId) {
  const connection = await mysqlConnectionPool.getConnection();

  try {
    await connection.beginTransaction();

    const [ownedTitles] = await connection.query(
      "SELECT title_award_id, title_id FROM TitleAward WHERE user_id = ? FOR UPDATE",
      [userId],
    );

    const ownsTitle = ownedTitles.some((title) => title.title_id === titleId);

    if (!ownsTitle) {
      await connection.rollback();
      return false;
    }

    await connection.query(
      "UPDATE TitleAward SET is_equipped = FALSE WHERE user_id = ?",
      [userId],
    );

    await connection.query(
      "UPDATE TitleAward SET is_equipped = TRUE WHERE user_id = ? AND title_id = ?",
      [userId, titleId],
    );

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function equipOwnedFrame(userId, frameId) {
  const connection = await mysqlConnectionPool.getConnection();

  try {
    await connection.beginTransaction();

    const [ownedFrames] = await connection.query(
      "SELECT user_frame_id, frame_id FROM UserAvatarFrame WHERE user_id = ? FOR UPDATE",
      [userId],
    );

    const ownsFrame = ownedFrames.some((frame) => frame.frame_id === frameId);

    if (!ownsFrame) {
      await connection.rollback();
      return false;
    }

    await connection.query(
      "UPDATE UserAvatarFrame SET is_equipped = FALSE WHERE user_id = ?",
      [userId],
    );

    await connection.query(
      "UPDATE UserAvatarFrame SET is_equipped = TRUE WHERE user_id = ? AND frame_id = ?",
      [userId, frameId],
    );

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

router.get("/:userId/history", async (req, res) => {
  try {
    const profile = await getUserLevelProfile(req.params.userId);

    if (!profile) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const titleHistory = profile.earnedTitles.map((title) => ({
      type: "title",
      id: title.title_id,
      name: title.title_name,
      reason: title.description || title.requirement,
      requirement: title.requirement,
      earned_at: title.earned_at,
      is_equipped: Boolean(title.is_equipped),
    }));

    const frameHistory = profile.earnedFrames.map((frame) => ({
      type: "frame",
      id: frame.frame_id,
      name: frame.frame_name,
      reason: frame.description || `level >= ${frame.unlock_level}`,
      requirement: `level >= ${frame.unlock_level}`,
      earned_at: frame.earned_at,
      is_equipped: Boolean(frame.is_equipped),
    }));

    const [purchaseRows] = await mysqlConnectionPool.query(
      `SELECT
         pr.purchase_id,
         pr.item_id,
         pr.price_at_purchase,
         pr.purchased_at,
         si.item_name,
         si.description,
         si.item_type,
         si.image_url,
         COALESCE(ui.is_equipped, FALSE) AS is_equipped
       FROM PurchaseRecord pr
       JOIN ShopItem si
         ON pr.item_id = si.item_id
       LEFT JOIN UserItem ui
         ON ui.user_id = pr.user_id
        AND ui.item_id = pr.item_id
       WHERE pr.user_id = ?
         AND si.item_type = 'avatar'
       ORDER BY pr.purchased_at DESC`,
      [req.params.userId],
    );

    const purchaseHistory = purchaseRows.map((purchase) => ({
      type: "purchase",
      id: purchase.purchase_id,
      item_id: purchase.item_id,
      name: purchase.item_name,
      reason: purchase.description || `購買頭像，花費 ${purchase.price_at_purchase} coins`,
      requirement: `商店購買，花費 ${purchase.price_at_purchase} coins`,
      earned_at: purchase.purchased_at,
      is_equipped: Boolean(purchase.is_equipped),
      icon: purchase.image_url,
      price_at_purchase: purchase.price_at_purchase,
    }));

    const history = [...titleHistory, ...frameHistory, ...purchaseHistory].sort(
      (a, b) => new Date(b.earned_at).getTime() - new Date(a.earned_at).getTime(),
    );

    return res.json({
      success: true,
      user: profile.user,
      history,
    });
  } catch (error) {
    console.error("Error getting level history:", error);
    return res.status(500).json({ success: false, message: "Level history failed" });
  }
});

router.get("/:userId", async (req, res) => {
  try {
    const profile = await getUserLevelProfile(req.params.userId);

    if (!profile) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.json({ success: true, profile });
  } catch (error) {
    console.error("Error getting level profile:", error);
    return res.status(500).json({ success: false, message: "Level profile failed" });
  }
});

router.post("/:userId/generation", async (req, res) => {
  try {
    await mysqlConnectionPool.query(
      "UPDATE User SET generation_count = generation_count + 1 WHERE user_id = ?",
      [req.params.userId],
    );

    const profile = await getUserLevelProfile(req.params.userId);

    if (!profile) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.json({ success: true, profile });
  } catch (error) {
    console.error("Error recording generation:", error);
    return res.status(500).json({ success: false, message: "Record generation failed" });
  }
});

router.post("/:userId/title", async (req, res) => {
  try {
    const titleId = parsePositiveInteger(req.body?.title_id);

    if (!titleId) {
      return res.status(400).json({ success: false, message: "title_id is required" });
    }

    const existingProfile = await getUserLevelProfile(req.params.userId);

    if (!existingProfile) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const equipped = await equipOwnedTitle(req.params.userId, titleId);

    if (!equipped) {
      return res.status(404).json({ success: false, message: "Title not owned" });
    }

    const profile = await getUserLevelProfile(req.params.userId);
    return res.json({ success: true, profile });
  } catch (error) {
    console.error("Error equipping title:", error);
    return res.status(500).json({ success: false, message: "Equip title failed" });
  }
});

router.post("/:userId/frame", async (req, res) => {
  try {
    const frameId = parsePositiveInteger(req.body?.frame_id);

    if (!frameId) {
      return res.status(400).json({ success: false, message: "frame_id is required" });
    }

    const existingProfile = await getUserLevelProfile(req.params.userId);

    if (!existingProfile) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const equipped = await equipOwnedFrame(req.params.userId, frameId);

    if (!equipped) {
      return res.status(404).json({ success: false, message: "Frame not owned" });
    }

    const profile = await getUserLevelProfile(req.params.userId);
    return res.json({ success: true, profile });
  } catch (error) {
    console.error("Error equipping frame:", error);
    return res.status(500).json({ success: false, message: "Equip frame failed" });
  }
});

export default router;
