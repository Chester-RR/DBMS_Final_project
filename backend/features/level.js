// features/level.js
// ============================================================
// 等級 / 稱號 / 頭像框 API 模組
// ------------------------------------------------------------
// 這個檔案是後端等級系統的核心邏輯，會被 app.js 掛載到 /level 路徑底下。
//
// 主要負責的事情：
// 1. 根據 User.generation_count 計算玩家目前等級。
// 2. 確認玩家是否達成稱號 Title 的 requirement 條件，達成就寫入 TitleAward。
// 3. 確認玩家等級是否達到頭像框 AvatarFrame.unlock_level，達成就寫入 UserAvatarFrame。
// 4. 回傳前端右上角使用者卡片需要的完整資料，例如名稱、等級、目前稱號、目前頭像框。
// 5. 提供更換已擁有稱號與頭像框的 API。
//
// 整體資料流可以想成：
// 前端按下生成按鈕 -> POST /level/:userId/generation -> generation_count + 1
// -> 重新同步 level / rewards -> 回傳最新 profile -> 前端更新使用者卡片。
// ============================================================

import express from "express";
import mysqlConnectionPool from "../lib/mysql.js";

// 建立 Express Router，讓這個檔案只專心定義 /level 底下的路由。
// 實際掛載點在 app.js：app.use("/level", levelRoutes)。
const router = express.Router();

// 等級規則集中放在這裡，之後如果要調整遊戲平衡，只需要先看這兩個常數。
// MAX_LEVEL：最高等級，目前限制為 50。
// GENERATIONS_PER_LEVEL：每幾次生成可以提升 1 級，目前是每 5 次生成升 1 級。
// 目前公式：level = floor(generation_count / 5) + 1，並且不超過 50 級。
const MAX_LEVEL = 50;
const GENERATIONS_PER_LEVEL = 5;

// 將使用者累積生成句子的次數轉換成等級。
//
// 參數：
// generationCount：User.generation_count，代表玩家成功生成句子的累積次數。
//
// 設計細節：
// - Number(generationCount) || 0 可以避免資料是 null、undefined、空字串時讓計算壞掉。
// - Math.floor 代表未滿 5 次不升級，例如 0-4 次都是 Lv.1。
// - +1 是因為玩家預設從 Lv.1 開始，不是 Lv.0。
// - Math.min 會把等級壓在 MAX_LEVEL 以內，避免超出前端或資料表預期。
//
// 範例：
// 0-4 次   => Lv.1
// 5-9 次   => Lv.2
// 20-24 次 => Lv.5
// 245 次以上在目前規則下會到 Lv.50 上限。
function calculateLevel(generationCount) {
  const safeCount = Number(generationCount) || 0;
  return Math.min(MAX_LEVEL, Math.floor(safeCount / GENERATIONS_PER_LEVEL) + 1);
}

// 計算帳號已建立幾天，用來判斷「帳號年資」類型的稱號。
//
// createdAt 來自 User.created_at，這樣就不需要另外新增 account_age_days 欄位。
// 如果日期格式錯誤，會回傳 0，避免稱號判斷因為 NaN 出錯。
function getAccountAgeDays(createdAt) {
  const createdTime = new Date(createdAt).getTime();
  if (Number.isNaN(createdTime)) return 0;
  return Math.floor((Date.now() - createdTime) / 86400000);
}

// 判斷某個稱號 requirement 是否被使用者達成。
//
// Title.requirement 在資料庫裡是用可讀文字保存，例如：
// - "level >= 5"
// - "generation_count >= 30"
// - "account_age_days >= 30"
//
// 這個函式扮演「文字條件 -> 實際程式判斷」的轉換層。
// 目前支援的 requirement 都寫死在這裡；如果之後 Title 表新增其他條件，
// 例如 coin_balance >= 500 或 like_count >= 10，就需要在這裡加新的 if 判斷。
//
// 注意：這裡使用 includes，是為了讓 requirement 字串可以保留人類可讀性；
// 但也代表 requirement 文字必須和這些判斷片段一致，否則不會發放稱號。
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

  // 不認得的 requirement 一律視為未達成，避免錯發獎勵。
  return false;
}

// 從資料庫讀取等級系統需要的使用者欄位。
//
// 只 SELECT 需要的欄位，而不是 SELECT *，好處是：
// - API 邏輯比較清楚知道自己依賴哪些資料。
// - 不會不小心把 password 等敏感欄位帶進後續回傳資料。
// - 後續 User 表增加欄位時，這裡不會被無關欄位影響。
async function getUser(userId) {
  const [rows] = await mysqlConnectionPool.query(
    "SELECT user_id, user_name, email, created_at, level, coin_balance, generation_count FROM User WHERE user_id = ?",
    [userId],
  );

  // user_id 是主鍵，所以最多只會有一筆；找不到時 rows[0] 會是 undefined。
  return rows[0];
}

// 發放使用者已達成條件的稱號。
//
// 流程：
// 1. 讀出 Title 表中所有稱號。
// 2. 逐一用 titleRequirementIsMet 判斷玩家是否符合 requirement。
// 3. 符合就寫入 TitleAward，代表玩家擁有這個稱號。
// 4. 回傳「這次新發放」的稱號，方便 API 告訴前端是否有新獎勵。
//
// 為什麼使用 INSERT IGNORE：
// TitleAward 有 UNIQUE(user_id, title_id) 限制，同一玩家同一稱號只能拿一次。
// INSERT IGNORE 可以讓重複發放時不丟錯，而是 affectedRows = 0。
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

    // affectedRows > 0 代表這次真的新增成功，不是使用者原本就有。
    if (result.affectedRows > 0) {
      awardedTitles.push(title);
    }
  }

  return awardedTitles;
}

// 發放使用者已達到等級門檻的頭像框。
//
// AvatarFrame.unlock_level 是解鎖等級，例如 10、20、30、40、50。
// 只要 user.level >= unlock_level，就代表使用者應該擁有這個頭像框。
//
// 和稱號一樣，UserAvatarFrame 有 UNIQUE(user_id, frame_id)，所以 INSERT IGNORE
// 可以避免同一個頭像框被重複寫入。
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

// 同步使用者的等級與獎勵狀態。
//
// 這是 level.js 的核心協調函式，會確保三件事彼此一致：
// - User.level 必須符合 User.generation_count 推算出的等級。
// - TitleAward 必須包含目前已達成的稱號。
// - UserAvatarFrame 必須包含目前已解鎖的頭像框。
//
// 這個函式會在 GET profile 和 POST generation 都被呼叫。
// 也就是說，即使測試時直接改資料庫 generation_count，只要下一次讀 profile，
// 系統就會自動補更新 level 和獎勵。
async function syncUserRewards(userId) {
  const user = await getUser(userId);
  if (!user) return null;

  const level = calculateLevel(user.generation_count);

  // 如果資料庫中的 User.level 與計算結果不同，就立即更新資料庫，
  // 並同步修改記憶體中的 user.level，讓後續稱號/頭像框判斷使用最新等級。
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

// 組出前端使用者卡片需要的完整 profile。
//
// 回傳內容包含：
// - user：基本資訊、等級、生成次數、滿級、下一級需要到幾次生成。
// - currentTitle：目前顯示的稱號。
// - currentFrame：目前顯示的頭像框。
// - earnedTitles：玩家已擁有的所有稱號。
// - earnedFrames：玩家已擁有的所有頭像框。
// - newlyAwarded：這次同步時新拿到的稱號/頭像框。
//
// 排序設計：
// TitleAward / UserAvatarFrame 都有 is_equipped 欄位。
// ORDER BY is_equipped DESC 會把正在裝備的項目排第一個，前端直接拿第 1 筆顯示。
// 如果玩家尚未裝備任何東西，後面的排序會讓較新的/較高等級的獎勵優先出現。
async function getUserLevelProfile(userId) {
  const syncResult = await syncUserRewards(userId);
  if (!syncResult) return null;

  const { user, awardedTitles, awardedFrames } = syncResult;

  // 取得玩家已擁有的稱號，並把目前裝備的稱號排在第一筆。
  const [titleRows] = await mysqlConnectionPool.query(
    `SELECT t.title_id, t.title_name, t.description, t.requirement, ta.earned_at, ta.is_equipped
     FROM TitleAward ta
     JOIN Title t ON ta.title_id = t.title_id
     WHERE ta.user_id = ?
     ORDER BY ta.is_equipped DESC, t.title_id DESC`,
    [userId],
  );

  // 取得玩家已擁有的頭像框，包含前端渲染外觀需要的 CSS 顏色與背景欄位。
  const [frameRows] = await mysqlConnectionPool.query(
    `SELECT af.frame_id, af.frame_name, af.description, af.unlock_level, af.rarity,
            af.border_color, af.glow_color, af.background_css, uaf.earned_at, uaf.is_equipped
     FROM UserAvatarFrame uaf
     JOIN AvatarFrame af ON uaf.frame_id = af.frame_id
     WHERE uaf.user_id = ?
     ORDER BY uaf.is_equipped DESC, af.unlock_level DESC`,
    [userId],
  );

  // 新使用者可能還沒有任何稱號或頭像框，因此提供預設顯示值。
  // 這裡用 Unicode escape 保留中文，是為了讓原始碼保持 ASCII 也能回傳中文文字。
  const currentTitle = titleRows[0] || {
    title_name: "\u7121\u540d\u751f\u6210\u8005",
    description: "\u5c1a\u672a\u7372\u5f97\u7a31\u865f",
    requirement: "level >= 5",
  };

  // 預設頭像框的欄位名稱要和 AvatarFrame 查詢結果一致，
  // 這樣前端 applyUserProfile 可以用同一套程式處理預設值與資料庫資料。
  const currentFrame = frameRows[0] || {
    frame_name: "\u65b0\u82bd\u908a\u6846",
    unlock_level: 1,
    rarity: "common",
    border_color: "#82b8a4",
    glow_color: "rgba(0, 105, 68, 0.18)",
    background_css: "linear-gradient(135deg, rgba(255,255,255,0.92), rgba(192,254,229,0.82))",
  };

  // 下一級需要達到的 generation_count。
  // 例如目前 Lv.3，下一級 Lv.4 需要 generation_count 到 15。
  // 如果已經滿級，回傳 null，讓前端知道不需要再顯示下一級門檻。
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

// GET /level/:userId
//
// 讀取某個使用者的等級 profile。
// 使用時機：
// - interface.html 載入頁面時會呼叫，更新右上角使用者卡片。
// - 測試時手動修改資料庫 generation_count 後，也可以呼叫這支 API 讓系統重新同步。
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

// POST /level/:userId/generation
//
// 記錄一次成功的句子生成。
// 這支 API 會先把 User.generation_count + 1，再重新呼叫 getUserLevelProfile。
// 因此回傳的 profile 一定是更新過等級、稱號、頭像框之後的狀態。
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

// POST /level/:userId/title
//
// 更換目前裝備的稱號。
// 前端需要在 body 傳入 { "title_id": 某個稱號 ID }。
//
// 設計方式：
// 1. 先把該使用者所有稱號 is_equipped 設成 FALSE。
// 2. 再把指定 title_id 的那筆 TitleAward 設成 TRUE。
// 3. 如果第二步 affectedRows = 0，代表使用者沒有這個稱號，回傳 404。
//
// 注意：目前這裡沒有使用 transaction。如果非常在意中途失敗造成短暫無裝備狀態，
// 可以之後改成同一個交易處理。
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

// POST /level/:userId/frame
//
// 更換目前裝備的頭像框。
// 前端需要在 body 傳入 { "frame_id": 某個頭像框 ID }。
//
// 流程和更換稱號相同：先取消所有裝備，再裝備指定項目。
// UserAvatarFrame 表只會有使用者已解鎖的頭像框，所以如果 UPDATE 不到資料，
// 就代表玩家尚未擁有該 frame_id。
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

// 匯出 router 給 app.js 使用。
export default router;
