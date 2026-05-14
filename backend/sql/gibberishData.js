import mysqlConnectionPool from "../lib/mysql.js";

/*
  Gibberish 正式初始資料

  這個檔案負責新增：
  1. Template
  2. TemplateBlank
  3. Word

  維護方式：
  - 要新增模板，只改 templates
  - 要新增單字，只改 wordsByPartOfSpeech
  - 不需要改下面的新增邏輯
*/

// Template 詞句模板
const templates = [
  {
    template_name: "日常亂語",
    structure: "今天的我像 {1} 一樣 {2}",
    genre: "daily",
    blanks: ["noun", "verb"],
  },
  {
    template_name: "荒謬宣言",
    structure: "請大家一起 {1} 那個 {2} 的 {3}",
    genre: "absurd",
    blanks: ["verb", "adjective", "noun"],
  },
  {
    template_name: "職場亂語",
    structure: "我的老闆正在用 {1} {2}",
    genre: "workplace",
    blanks: ["noun", "verb"],
  },
  {
    template_name: "生活哲學",
    structure: "人生就像 {1}，越 {2} 越 {3}",
    genre: "philosophy",
    blanks: ["noun", "adjective", "verb"],
  },
  {
    template_name: "校園亂語",
    structure: "教授突然拿著 {1} 開始 {2}",
    genre: "school",
    blanks: ["noun", "verb"],
  },
];

// Word 用來放進模板的單字
const wordsByPartOfSpeech = {
  noun: [
    "香蕉",
    "貓咪",
    "老闆",
    "馬桶",
    "披薩",
    "外星人",
    "鍵盤",
    "冰箱",
    "教授",
    "電風扇",
  ],

  verb: [
    "跳舞",
    "尖叫",
    "發光",
    "逃跑",
    "爆炸",
    "睡覺",
    "旋轉",
    "打噴嚏",
    "滑行",
    "思考人生",
  ],

  adjective: [
    "瘋狂",
    "憂鬱",
    "閃亮",
    "暴躁",
    "神秘",
    "尷尬",
    "離譜",
    "安靜",
    "透明",
    "過度自信",
  ],
};

async function insertWords(connection) {
  for (const partOfSpeech in wordsByPartOfSpeech) {
    const words = wordsByPartOfSpeech[partOfSpeech];

    for (const wordText of words) {
      const [existingWords] = await connection.query(
        `
        SELECT word_id
        FROM Word
        WHERE word_text = ? AND part_of_speech = ?
        LIMIT 1
        `,
        [wordText, partOfSpeech],
      );

      if (existingWords.length === 0) {
        await connection.query(
          `
          INSERT INTO Word (
            word_text,
            part_of_speech,
            created_at,
            updated_at
          )
          VALUES (?, ?, NOW(), NOW())
          `,
          [wordText, partOfSpeech],
        );
      }
    }
  }
}

async function insertTemplates(connection) {
  for (const template of templates) {
    const [existingTemplates] = await connection.query(
      `
      SELECT template_id
      FROM Template
      WHERE template_name = ?
      LIMIT 1
      `,
      [template.template_name],
    );

    let templateId;

    if (existingTemplates.length > 0) {
      templateId = existingTemplates[0].template_id;

      await connection.query(
        `
        UPDATE Template
        SET
          structure = ?,
          genre = ?,
          updated_at = NOW()
        WHERE template_id = ?
        `,
        [template.structure, template.genre, templateId],
      );
    } else {
      const [templateResult] = await connection.query(
        `
        INSERT INTO Template (
          template_name,
          structure,
          genre,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, NOW(), NOW())
        `,
        [template.template_name, template.structure, template.genre],
      );

      templateId = templateResult.insertId;
    }

    await connection.query(
      `
      DELETE FROM TemplateBlank
      WHERE template_id = ?
      `,
      [templateId],
    );

    for (let i = 0; i < template.blanks.length; i++) {
      await connection.query(
        `
        INSERT INTO TemplateBlank (
          template_id,
          blank_order,
          part_of_speech
        )
        VALUES (?, ?, ?)
        `,
        [templateId, i + 1, template.blanks[i]],
      );
    }
  }
}

async function insertGibberishData() {
  const connection = await mysqlConnectionPool.getConnection();

  try {
    await connection.beginTransaction();

    await insertWords(connection);
    await insertTemplates(connection);

    await connection.commit();

    console.log("Gibberish data inserted successfully");
  } catch (error) {
    await connection.rollback();

    console.error("Failed to insert gibberish data:", error);
  } finally {
    connection.release();
    await mysqlConnectionPool.end();
  }
}

insertGibberishData();
