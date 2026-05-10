// features/level.js
// = User level / title / avatar frame APIs
// = Updates level from generation_count
// = Awards titles and avatar frames from current user data
// = Returns the profile data used by the top-right user card

import express from "express";
import mysqlConnectionPool from "../lib/mysql.js";

const router = express.Router();

// Level rule center. Change these two constants if the game balance changes later.
// Current rule: every 5 generated sentences gives 1 level, capped at level 50.
const MAX_LEVEL = 50;
const GENERATIONS_PER_LEVEL = 5;

// Convert total generated sentence count into a level.
// Examples: 0-4 => Lv.1, 5-9 => Lv.2, 20-24 => Lv.5.
function calculateLevel(generationCount) {
  const safeCount = Number(generationCount) || 0;
  return Math.min(MAX_LEVEL, Math.floor(safeCount / GENERATIONS_PER_LEVEL) + 1);
}

// Account-age titles use the existing User.created_at column, so no extra table field is needed.
function getAccountAgeDays(createdAt) {
  const createdTime = new Date(createdAt).getTime();
  if (Number.isNaN(createdTime)) return 0;
  return Math.floor((Date.now() - createdTime) / 86400000);
}

// Title.requirement is stored as readable text in the database.
// This function maps the supported requirement strings to actual checks.
// If new requirement types are added to Title later, add their check here.
function titleRequirementIsMet(requirement, user) {
  const accountAgeDays = getAccountAgeDays(user.created_at);

  if (requirement.includes("level >= 45")) return user.level >= 45;
  if (requirement.includes("level >= 35")) return user.level >= 35;
  if (requirement.includes("level >= 25")) return user.level >= 25;
  if (requirement.includes("level >= 15")) return user.level >= 15;
  if (requirement.includes("level >= 5")) return user.level >= 5;
  if (requirement.includes("account_age_days >= 30")) return accountAgeDays >= 30;
  if (requirement.includes("generation_count >= 100")) return user.generation_count >= 100;
  if (requirement.includes("generation_count >= 30")) return user.generation_count >= 30;

  return false;
}

// Load only the user fields needed by the level system.
async function getUser(userId) {
  const [rows] = await mysqlConnectionPool.query(
    "SELECT user_id, user_name, email, created_at, level, coin_balance, generation_count FROM User WHERE user_id = ?",
    [userId],
  );

  return rows[0];
}

// Award every title that the user qualifies for.
// INSERT IGNORE avoids duplicate awards because TitleAward has UNIQUE(user_id, title_id).
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

// Award avatar frames by level threshold.
// AvatarFrame.unlock_level controls when a frame becomes available.
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

// Keep User.level, TitleAward, and UserAvatarFrame consistent with generation_count.
// Calling this from GET is intentional: manually edited test data will sync on read.
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

// Build the complete payload needed by the frontend user card.
// The first title/frame row is treated as currently equipped; if none is equipped,
// the highest unlocked reward appears first because of the ORDER BY fallback.
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

  // Default display values for a brand-new user with no unlocked title/frame yet.
  // Unicode escapes keep this file ASCII-safe while still returning Chinese text.
  const currentTitle = titleRows[0] || {
    title_name: "\u7121\u540d\u751f\u6210\u8005",
    description: "\u5c1a\u672a\u7372\u5f97\u7a31\u865f",
    requirement: "level >= 5",
  };

  const currentFrame = frameRows[0] || {
    frame_name: "\u65b0\u82bd\u908a\u6846",
    unlock_level: 1,
    rarity: "common",
    border_color: "#82b8a4",
    glow_color: "rgba(0, 105, 68, 0.18)",
    background_css: "linear-gradient(135deg, rgba(255,255,255,0.92), rgba(192,254,229,0.82))",
  };

  // Null means the user is already max level.
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

// Read profile API. Useful for page load and for testing after manual SQL updates.
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

// Record one successful sentence generation, then return the refreshed profile.
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

// Equip a title the user already owns. Only one title is equipped at a time.
router.post("/:userId/title", async (req, res) => {
  try {
    const titleId = req.body["title_id"];

    await mysqlConnectionPool.query(
      "UPDATE TitleAward SET is_equipped = FALSE WHERE user_id = ?",
      [req.params.userId],
    );

    const [result] = await mysqlConnectionPool.query(
      "UPDATE TitleAward SET is_equipped = TRUE WHERE user_id = ? AND title_id = ?",
      [req.params.userId, titleId],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Title not owned" });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("Error equipping title:", error);
    return res.status(500).json({ success: false, message: "Equip title failed" });
  }
});

// Equip an avatar frame the user already owns. Only one frame is equipped at a time.
router.post("/:userId/frame", async (req, res) => {
  try {
    const frameId = req.body["frame_id"];

    await mysqlConnectionPool.query(
      "UPDATE UserAvatarFrame SET is_equipped = FALSE WHERE user_id = ?",
      [req.params.userId],
    );

    const [result] = await mysqlConnectionPool.query(
      "UPDATE UserAvatarFrame SET is_equipped = TRUE WHERE user_id = ? AND frame_id = ?",
      [req.params.userId, frameId],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Frame not owned" });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("Error equipping frame:", error);
    return res.status(500).json({ success: false, message: "Equip frame failed" });
  }
});

export default router;