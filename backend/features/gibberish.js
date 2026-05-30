import express from "express";
import mysqlConnectionPool from "../lib/mysql.js";
import { syncUserRewards } from "./level.js";

const router = express.Router();

function parsePositiveInteger(value) {
  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue) || parsedValue <= 0) return null;
  return parsedValue;
}

async function getTemplatesForUser(userId = null, connection = mysqlConnectionPool) {
  const [templates] = await connection.query(
    `
    SELECT
      tm.template_id,
      tm.template_name,
      tm.structure,
      tm.genre,
      tm.is_special,
      tm.unlock_title_id,
      tt.title_name AS unlock_title_name,
      tt.requirement AS unlock_requirement,
      CASE
        WHEN tm.is_special = FALSE THEN TRUE
        WHEN ta.title_award_id IS NOT NULL THEN TRUE
        ELSE FALSE
      END AS is_unlocked
    FROM Template tm
    LEFT JOIN Title tt
      ON tm.unlock_title_id = tt.title_id
    LEFT JOIN TitleAward ta
      ON ta.user_id = ?
     AND ta.title_id = tm.unlock_title_id
    ORDER BY tm.template_id
    `,
    [userId],
  );

  return templates.map((template) => ({
    ...template,
    is_special: Boolean(template.is_special),
    is_unlocked: Boolean(template.is_unlocked),
    is_locked: !Boolean(template.is_unlocked),
  }));
}

async function getTemplateAccessForUser(userId, templateId, connection = mysqlConnectionPool) {
  const [templates] = await connection.query(
    `
    SELECT
      tm.template_id,
      tm.template_name,
      tm.structure,
      tm.genre,
      tm.is_special,
      tm.unlock_title_id,
      tt.title_name AS unlock_title_name,
      tt.requirement AS unlock_requirement,
      ta.title_award_id
    FROM Template tm
    LEFT JOIN Title tt
      ON tm.unlock_title_id = tt.title_id
    LEFT JOIN TitleAward ta
      ON ta.user_id = ?
     AND ta.title_id = tm.unlock_title_id
    WHERE tm.template_id = ?
    LIMIT 1
    `,
    [userId, templateId],
  );

  const template = templates[0];
  if (!template) return null;

  const isUnlocked = !template.is_special || Boolean(template.title_award_id);

  return {
    ...template,
    is_special: Boolean(template.is_special),
    is_unlocked: isUnlocked,
    is_locked: !isUnlocked,
  };
}
/*
  POST /gibberish/pin

  用途：
  將某一筆亂語設為目前使用者的置頂亂語

  額外功能：
  1. 每次成功置頂時，在 Notification 裡新增一筆 system 紀錄
  2. 用這些 PINLOG 紀錄來計算使用者累積置頂次數
  3. 達到 1、3、5、10 次時，新增 achievement 通知
*/
router.post("/pin", async (req, res) => {
  const { user_id, gibberish_id } = req.body;

  if (!user_id || !gibberish_id) {
    return res.status(400).json({
      success: false,
      message: "Missing user_id or gibberish_id",
    });
  }

  const connection = await mysqlConnectionPool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `
      SELECT
        gibberish_id,
        user_id,
        content,
        pinned
      FROM Gibberish
      WHERE gibberish_id = ?
        AND user_id = ?
      LIMIT 1
      `,
      [gibberish_id, user_id],
    );

    if (rows.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Gibberish not found or does not belong to this user",
      });
    }

    const selectedGibberish = rows[0];
    const alreadyPinned = Boolean(selectedGibberish.pinned);

    /*
      如果這句本來就已經是置頂，
      不要重複增加 PINLOG，也不要重複算成就。
    */
    if (alreadyPinned) {
      await connection.commit();

      return res.json({
        success: true,
        message: "This gibberish is already pinned",
        pinnedGibberish: {
          gibberish_id: selectedGibberish.gibberish_id,
          user_id: selectedGibberish.user_id,
          content: selectedGibberish.content,
          pinned: true,
        },
      });
    }

    // 先把這個使用者以前置頂的亂語取消
    await connection.query(
      `
      UPDATE Gibberish
      SET pinned = FALSE
      WHERE user_id = ?
      `,
      [user_id],
    );

    // 再把這一句設為置頂
    await connection.query(
      `
      UPDATE Gibberish
      SET pinned = TRUE
      WHERE gibberish_id = ?
        AND user_id = ?
      `,
      [gibberish_id, user_id],
    );

    /*
      錨點 1：
      新增一筆 system 類型的紀錄。
      這筆不是給使用者看的，是拿來計算「累積置頂次數」。
    */
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
      VALUES (?, ?, NULL, 'system', TRUE, ?, NOW())
      `,
      [
        user_id,
        gibberish_id,
        `PINLOG: user ${user_id} pinned gibberish ${gibberish_id}`,
      ],
    );

    /*
      錨點 2：
      直接從 Notification table 數 PINLOG。
      這樣不用新增 table，也不用修改原本 table 欄位。
    */
    const [pinCountRows] = await connection.query(
      `
      SELECT COUNT(*) AS pin_count
      FROM Notification
      WHERE user_id = ?
        AND notification_type = 'system'
        AND content LIKE 'PINLOG:%'
      `,
      [user_id],
    );

    const pinCount = Number(pinCountRows[0].pin_count);

    /*
      錨點 3：
      根據累積置頂次數，產生成就通知。
    */
    let achievementContent = "";

    if (pinCount === 1) {
      achievementContent = `你第一次將亂語設為今日至理名言：「${selectedGibberish.content}」`;
    } else if (pinCount === 3) {
      achievementContent =
        "你已累積置頂 3 次亂語，今日至理名言越來越有份量了。";
    } else if (pinCount === 5) {
      achievementContent = "你已累積置頂 5 次亂語，亂語收藏家正式誕生。";
    } else if (pinCount === 10) {
      achievementContent = "你已累積置頂 10 次亂語，今日至理名言大師降臨。";
    }

    if (achievementContent) {
      const [existingAchievementNotifications] = await connection.query(
        `
        SELECT notification_id
        FROM Notification
        WHERE user_id = ?
          AND notification_type = 'achievement'
          AND content = ?
        LIMIT 1
        `,
        [user_id, achievementContent],
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
          [user_id, gibberish_id, achievementContent],
        );
      }
    }

    await connection.commit();

    res.json({
      success: true,
      pinnedGibberish: {
        gibberish_id: selectedGibberish.gibberish_id,
        user_id: selectedGibberish.user_id,
        content: selectedGibberish.content,
        pinned: true,
      },
      pin_count: pinCount,
    });
  } catch (error) {
    await connection.rollback();

    console.error("Failed to pin gibberish:", error);

    res.status(500).json({
      success: false,
      message: "Failed to pin gibberish",
    });
  } finally {
    connection.release();
  }
});
/*
  GET /gibberish/pinned?user_id=1

  用途：
  取得目前使用者置頂的亂語，給「今天的至理名言」顯示
*/
router.get("/pinned", async (req, res) => {
  const { user_id } = req.query;

  if (!user_id) {
    return res.status(400).json({
      success: false,
      message: "Missing user_id",
    });
  }

  try {
    const [rows] = await mysqlConnectionPool.query(
      `
      SELECT gibberish_id, content, created_at, pinned
      FROM Gibberish
      WHERE user_id = ?
        AND pinned = TRUE
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [user_id],
    );

    res.json({
      success: true,
      pinnedGibberish: rows[0] || null,
    });
  } catch (error) {
    console.error("Failed to get pinned gibberish:", error);

    res.status(500).json({
      success: false,
      message: "Failed to get pinned gibberish",
    });
  }
});
/*
  GET /gibberish/templates?user_id=1

  用途：
  取得模板與目前使用者的解鎖狀態，給前端右下角模板選擇區使用
*/
router.get("/templates", async (req, res) => {
  try {
    const userId = req.query.user_id
      ? parsePositiveInteger(req.query.user_id)
      : null;

    if (req.query.user_id && !userId) {
      return res.status(400).json({
        success: false,
        message: "user_id must be a positive integer",
      });
    }

    if (userId) {
      const syncResult = await syncUserRewards(userId);

      if (!syncResult) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }
    }

    const templates = await getTemplatesForUser(userId);

    res.json({
      success: true,
      templates,
    });
  } catch (error) {
    console.error("Failed to get templates:", error);

    res.status(500).json({
      success: false,
      message: "Failed to get templates",
    });
  }
});
/*
  GET /gibberish/my

  用途：
  取得目前使用者以前產生過的亂語
*/
router.get("/my", async (req, res) => {
  const userId = req.query.user_id;

  if (!userId) {
    return res.status(400).json({
      message: "user_id is required",
    });
  }

  try {
    const [gibberishes] = await mysqlConnectionPool.query(
      `
      SELECT
        gibberish_id,
        user_id,
        template_id,
        content,
        created_at,
        pinned
      FROM Gibberish
      WHERE user_id = ?
      ORDER BY created_at ASC
      LIMIT 100
      `,
      [userId],
    );

    res.json(gibberishes);
  } catch (error) {
    console.error("Failed to get my gibberishes:", error);

    res.status(500).json({
      message: "Failed to get my gibberishes",
    });
  }
});
/*
  POST /gibberish/generate

  用途：
  根據使用者選的 template_id，
  隨機抽 Word，
  產生一句 Gibberish
*/
router.post("/generate", async (req, res) => {
  const templateId = parsePositiveInteger(req.body?.template_id);
  const userId = parsePositiveInteger(req.body?.user_id);

  if (!templateId) {
    return res.status(400).json({
      message: "template_id is required",
    });
  }

  if (!userId) {
    return res.status(400).json({
      message: "user_id is required",
    });
  }

  const syncResult = await syncUserRewards(userId);

  if (!syncResult) {
    return res.status(404).json({
      message: "User not found",
    });
  }

  const connection = await mysqlConnectionPool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. 找到使用者選的模板
    const template = await getTemplateAccessForUser(userId, templateId, connection);

    if (!template) {
      await connection.rollback();

      return res.status(404).json({
        message: "Template not found",
      });
    }

    if (!template.is_unlocked) {
      await connection.rollback();

      return res.status(403).json({
        message: "Template is locked",
        unlock_title_name: template.unlock_title_name,
        unlock_requirement: template.unlock_requirement,
      });
    }

    // 2. 找這個模板需要填哪些空格
    const [blanks] = await connection.query(
      `
      SELECT
        blank_id,
        blank_order,
        part_of_speech
      FROM TemplateBlank
      WHERE template_id = ?
      ORDER BY blank_order
      `,
      [templateId],
    );

    let content = template.structure;
    const usedWords = [];

    // 3. 根據每個空格的詞性，隨機抽一個 Word
    for (const blank of blanks) {
      const [words] = await connection.query(
        `
        SELECT
          word_id,
          word_text,
          part_of_speech
        FROM Word
        WHERE part_of_speech = ?
        ORDER BY RAND()
        LIMIT 1
        `,
        [blank.part_of_speech],
      );

      if (words.length === 0) {
        await connection.rollback();

        return res.status(400).json({
          message: `No word found for part_of_speech: ${blank.part_of_speech}`,
        });
      }

      const word = words[0];

      // 把 {1}、{2}、{3} 替換成抽到的單字
      content = content.replace(`{${blank.blank_order}}`, word.word_text);

      usedWords.push({
        word_id: word.word_id,
        word_text: word.word_text,
        word_order: blank.blank_order,
      });
    }

    // 4. 把產生出來的亂語存進 Gibberish table
    const [gibberishResult] = await connection.query(
      `
      INSERT INTO Gibberish (
        user_id,
        template_id,
        content,
        created_at,
        pinned
      )
      VALUES (?, ?, ?, NOW(), 0)
      `,
      [userId, templateId, content],
    );

    const gibberishId = gibberishResult.insertId;

    // 5. 把這句亂語用了哪些 Word 存進 Composition table
    for (const usedWord of usedWords) {
      await connection.query(
        `
        INSERT INTO Composition (
          gibberish_id,
          word_id,
          word_order,
          created_at
        )
        VALUES (?, ?, ?, NOW())
        `,
        [gibberishId, usedWord.word_id, usedWord.word_order],
      );
    }

    await connection.commit();

    // 6. 回傳給前端
    res.json({
      gibberish_id: gibberishId,
      user_id: userId,
      template_id: template.template_id,
      template_name: template.template_name,
      is_special: template.is_special,
      content,
      words: usedWords,
    });
  } catch (error) {
    await connection.rollback();

    console.error("Failed to generate gibberish:", error);

    res.status(500).json({
      message: "Failed to generate gibberish",
    });
  } finally {
    connection.release();
  }
});

export default router;
