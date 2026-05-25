import express from "express";
import mysqlConnectionPool from "../lib/mysql.js";

const router = express.Router();

/*
  GET /gibberish/templates

  用途：
  取得所有模板，給前端右下角模板選擇區使用
*/
router.get("/templates", async (req, res) => {
  try {
    const [templates] = await mysqlConnectionPool.query(
      `
      SELECT
        template_id,
        template_name,
        structure,
        genre
      FROM Template
      ORDER BY template_id
      `,
    );

    res.json(templates);
  } catch (error) {
    console.error("Failed to get templates:", error);

    res.status(500).json({
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
  const { template_id, user_id } = req.body;

  if (!template_id) {
    return res.status(400).json({
      message: "template_id is required",
    });
  }

  if (!user_id) {
    return res.status(400).json({
      message: "user_id is required",
    });
  }

  const connection = await mysqlConnectionPool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. 找到使用者選的模板
    const [templates] = await connection.query(
      `
      SELECT
        template_id,
        template_name,
        structure,
        genre
      FROM Template
      WHERE template_id = ?
      LIMIT 1
      `,
      [template_id],
    );

    if (templates.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        message: "Template not found",
      });
    }

    const template = templates[0];

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
      [template_id],
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
      [user_id, template_id, content],
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
      user_id,
      template_id: template.template_id,
      template_name: template.template_name,
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