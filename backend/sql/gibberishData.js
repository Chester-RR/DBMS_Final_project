import mysqlConnectionPool from "../lib/mysql.js";

/*
  Gibberish 正式初始資料

  這個檔案負責新增：
  1. Template
  2. TemplateBlank
  3. VocabularyPack
  4. Word

  維護方式：
  - 要新增模板，只改 templates
  - 要新增詞彙庫，只改 vocabularyPacks
  - 要新增單字，只改 wordsByPartOfSpeech
  - 要新增特殊詞彙，只改 wordsByVocabularyPack
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
  {
    template_name: "時間災難",
    structure: "{1}，{2} 突然 {3}，整個場面變得很 {4}",
    genre: "daily",
    blanks: ["time_phrase", "noun", "verb", "adjective"],
  },
  {
    template_name: "工程師低語",
    structure: "工程師看著 {1}，開始 {2} {3}，最後只說：{4}",
    genre: "tech",
    blanks: ["noun", "adverb", "verb", "ending_phrase"],
  },
  {
    template_name: "成語失控",
    structure: "今天的 {1} 進入了 {2} 狀態，還在 {3}",
    genre: "absurd",
    blanks: ["noun", "idiom", "verb"],
  },
  {
    template_name: "期末結論",
    structure: "{1} 的狀態已經很 {2}，但還是只能 {3}，{4}",
    genre: "school",
    blanks: ["noun", "adjective", "verb", "ending_phrase"],
  },
  {
    template_name: "玄學祭祀",
    structure: "我對著 {1} 進行 {2}，希望 {3} 可以自己 {4}",
    genre: "mystic",
    is_special: true,
    unlock_title_name: "通靈 Debugger",
    blanks: ["noun", "ritual_verb", "noun", "verb"],
  },
  {
    template_name: "高階混沌模板",
    structure: "當 {1} 遇上 {2}，整個系統開始 {3}，最後只剩下 {4}",
    genre: "chaos",
    is_special: true,
    unlock_title_name: "百句鍛造者",
    blanks: ["noun", "noun", "verb", "ending_phrase"],
  },
];

const vocabularyPacks = [
  {
    pack_name: "生活哲學詞彙庫",
    description: "使用生活哲學模板生成 20 句後解鎖，讓哲學類亂語出現更多抽象詞彙。",
    unlock_title_name: "生活哲學家",
  },
  {
    pack_name: "高階混沌詞彙庫",
    description: "使用高階混沌模板生成 30 句後解鎖，讓混沌類亂語出現更失控的詞彙。",
    unlock_title_name: "混沌語彙師",
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
    "隔夜便當",
    "塑膠袋",
    "會發抖的吐司",
    "教授的水壺",
    "凌晨三點的冰箱",
    "沒有靈魂的簡報",
    "壞掉的 API",
    "卡住的資料庫",
    "沒有 commit 的人生",
    "忘記存檔的 VS Code",
    "看不懂的 error message",
    "merge conflict",
    "localhost",
    "資料庫連線",
    "沒有註解的程式碼",
    "期末專題",
    "小組報告",
    "教授的點名表",
    "爆掉的 deadline",
    "半夜的 GitHub",
    "助教的眼神",
    "早八的靈魂",
    "沒交的作業",
    "遲到的報告",
    "斷掉的網路",
    "爆音的耳機",
    "打結的充電線",
    "走失的發票",
    "月底的錢包",
    "冷掉的雞塊",
    "早餐店阿姨",
    "便利商店店員",
    "自動門",
    "影印機",
    "會議室的白板",
    "公車椅背",
    "室友的拖鞋",
    "群組裡的貼圖",
    "突然安靜的聊天室",
    "沒有存檔的報告",
    "被風吹走的尊嚴",
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
    "原地解壓縮",
    "假裝沒事",
    "開始冒煙",
    "低速旋轉",
    "突然請辭",
    "對空氣道歉",
    "用力發呆",
    "集體沉默",
    "反覆登入失敗",
    "邊哭邊更新",
    "往右滑行",
    "自動放棄",
    "假裝很懂",
    "默默發霉",
    "開始同步",
    "亂數尖叫",
    "緩慢融化",
    "把自己關機",
    "偷偷重開機",
    "對著牆壁點頭",
    "毫無意義地鼓掌",
    "發出塑膠聲",
    "在心裡排隊",
    "突然變成公告",
    "用眼神求救",
    "滑進垃圾桶",
    "被現實刷新",
    "用鼻子確認",
    "安靜地爆炸",
    "假裝有在運作",
    "瘋狂轉圈",
    "自動生成藉口",
    "被風吹到懷疑人生",
    "在角落更新系統",
    "把氣氛弄壞",
    "對自己按讚",
    "用力思考早餐",
    "偷走大家的注意力",
    "開始懷疑 Wi-Fi",
    "把問題交給明天",
    "瘋狂 debug",
    "重新部署",
    "忘記 commit",
    "直接 crash",
    "默默 rollback",
    "開始噴錯",
    "假裝可以跑",
    "被助教退回",
    "臨時改需求",
    "在 deadline 前燃燒",
    "把 bug 推給昨天的自己",
    "對著錯誤訊息沉默",
    "把資料庫弄醒",
    "在 terminal 裡迷路",
    "把專題救回來",
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
  adverb: [
    "偷偷",
    "突然",
    "安靜地",
    "用力地",
    "毫無意義地",
    "自信地",
    "像剛 debug 完一樣",
    "像 deadline 前一晚一樣",
    "在沒有人理解的情況下",
    "以一種很工程師的方式",
  ],

  idiom: [
    "雞飛狗跳",
    "一敗塗地",
    "自相矛盾",
    "莫名其妙",
    "胡言亂語",
    "臨陣磨槍",
    "欲哭無淚",
    "無中生有",
    "亂中有序",
    "畫蛇添足",
  ],

  time_phrase: [
    "凌晨三點",
    "期末前一晚",
    "早八前五分鐘",
    "deadline 前十秒",
    "剛下課的瞬間",
    "老師開始點名的時候",
    "GitHub 壞掉的那一刻",
    "簡報開始前兩分鐘",
  ],

  ending_phrase: [
    "這就是人生",
    "但我選擇沉默",
    "問題不大，先睡覺",
    "請不要問我為什麼",
    "總之先 commit",
    "這不是 bug，是特色",
    "助教應該看不出來",
    "明天的我會處理",
  ],

  ritual_verb: [
    "重啟祭祀",
    "縮排祈福",
    "部署占卜",
    "快取淨化",
    "錯誤碼超渡",
    "鍵盤結界",
  ],
};

const wordsByVocabularyPack = {
  生活哲學詞彙庫: {
    noun: [
      "存在感稀薄的鬧鐘",
      "會反思的便當",
      "沒有答案的選擇題",
      "被時間醃過的夢",
      "靈魂裡的備忘錄",
      "過期的熱情",
      "正在冥想的鍵盤",
      "人生的暫存檔",
    ],
    adjective: [
      "空洞",
      "深邃",
      "矛盾",
      "清醒",
      "疲憊",
      "溫柔",
      "荒涼",
      "難以名狀",
    ],
    verb: [
      "凝視自己",
      "慢慢放下",
      "反覆懷疑",
      "學會沉默",
      "接受混亂",
      "重新理解",
      "溫柔崩解",
      "和現實談判",
    ],
  },
  高階混沌詞彙庫: {
    noun: [
      "遞迴宇宙",
      "失控的服務容器",
      "自我增殖的 bug",
      "被污染的暫存記憶",
      "多執行緒焦慮",
      "崩壞中的需求文件",
      "無法回滾的人生版本",
      "正在冒煙的資料流",
    ],
    verb: [
      "無限遞迴",
      "交叉感染",
      "自動膨脹",
      "同步崩潰",
      "瘋狂 fork",
      "拒絕編譯",
      "吞掉例外",
      "產生第二個自己",
    ],
    ending_phrase: [
      "而且沒有人敢重開機",
      "直到 log 開始自己寫詩",
      "最後連錯誤訊息都放棄了",
      "這時候只能相信玄學",
      "然後資料庫開始低聲尖叫",
      "結果 rollback 也迷路了",
      "留下了一份看不懂的 commit",
      "所有人決定先去買咖啡",
    ],
  },
};

async function getVocabularyPackId(connection, packName) {
  const [packs] = await connection.query(
    `
    SELECT vocabulary_pack_id
    FROM VocabularyPack
    WHERE pack_name = ?
    LIMIT 1
    `,
    [packName],
  );

  if (packs.length === 0) {
    throw new Error(`Vocabulary pack not found: ${packName}`);
  }

  return packs[0].vocabulary_pack_id;
}

async function insertWordList(connection, wordsByPartOfSpeechList, vocabularyPackId = null) {
  for (const partOfSpeech in wordsByPartOfSpeechList) {
    const words = wordsByPartOfSpeechList[partOfSpeech];

    for (const wordText of words) {
      const [existingWords] = await connection.query(
        `
        SELECT word_id
        FROM Word
        WHERE word_text = ?
          AND part_of_speech = ?
          AND vocabulary_pack_id <=> ?
        LIMIT 1
        `,
        [wordText, partOfSpeech, vocabularyPackId],
      );

      if (existingWords.length === 0) {
        await connection.query(
          `
          INSERT INTO Word (
            word_text,
            part_of_speech,
            vocabulary_pack_id,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, NOW(), NOW())
          `,
          [wordText, partOfSpeech, vocabularyPackId],
        );
      } else {
        await connection.query(
          `
          UPDATE Word
          SET updated_at = NOW()
          WHERE word_id = ?
          `,
          [existingWords[0].word_id],
        );
      }
    }
  }
}

async function insertVocabularyPacks(connection) {
  for (const pack of vocabularyPacks) {
    const [titles] = await connection.query(
      `
      SELECT title_id
      FROM Title
      WHERE title_name = ?
      LIMIT 1
      `,
      [pack.unlock_title_name],
    );

    if (titles.length === 0) {
      throw new Error(`Unlock title not found: ${pack.unlock_title_name}`);
    }

    const unlockTitleId = titles[0].title_id;

    const [existingPacks] = await connection.query(
      `
      SELECT vocabulary_pack_id
      FROM VocabularyPack
      WHERE pack_name = ?
      LIMIT 1
      `,
      [pack.pack_name],
    );

    if (existingPacks.length > 0) {
      await connection.query(
        `
        UPDATE VocabularyPack
        SET
          description = ?,
          unlock_title_id = ?,
          updated_at = NOW()
        WHERE vocabulary_pack_id = ?
        `,
        [pack.description, unlockTitleId, existingPacks[0].vocabulary_pack_id],
      );
    } else {
      await connection.query(
        `
        INSERT INTO VocabularyPack (
          pack_name,
          description,
          unlock_title_id,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, NOW(), NOW())
        `,
        [pack.pack_name, pack.description, unlockTitleId],
      );
    }
  }
}

async function insertWords(connection) {
  await insertWordList(connection, wordsByPartOfSpeech);

  for (const packName in wordsByVocabularyPack) {
    const vocabularyPackId = await getVocabularyPackId(connection, packName);
    await insertWordList(connection, wordsByVocabularyPack[packName], vocabularyPackId);
  }
}

async function insertTemplates(connection) {
  for (const template of templates) {
    const isSpecial = Boolean(template.is_special);
    let unlockTitleId = null;

    if (isSpecial) {
      const [titles] = await connection.query(
        `
        SELECT title_id
        FROM Title
        WHERE title_name = ?
        LIMIT 1
        `,
        [template.unlock_title_name],
      );

      if (titles.length === 0) {
        throw new Error(`Unlock title not found: ${template.unlock_title_name}`);
      }

      unlockTitleId = titles[0].title_id;
    }

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
          is_special = ?,
          unlock_title_id = ?,
          updated_at = NOW()
        WHERE template_id = ?
        `,
        [template.structure, template.genre, isSpecial, unlockTitleId, templateId],
      );
    } else {
      const [templateResult] = await connection.query(
        `
        INSERT INTO Template (
          template_name,
          structure,
          genre,
          is_special,
          unlock_title_id,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, NOW(), NOW())
        `,
        [
          template.template_name,
          template.structure,
          template.genre,
          isSpecial,
          unlockTitleId,
        ],
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

    await insertTemplates(connection);
    await insertVocabularyPacks(connection);
    await insertWords(connection);

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
