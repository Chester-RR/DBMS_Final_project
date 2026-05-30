import mysqlConnectionPool from "../lib/mysql.js";

try {
  await mysqlConnectionPool.query(`
    INSERT INTO Title (title_name, description, requirement, icon)
    VALUES
      ('無名生成者', '預設稱號，所有使用者一開始都會擁有。', 'level >= 1', 'person'),
      ('句子點火者', '開始把荒謬句子點亮的人。', 'level >= 5', 'spark'),
      ('孤句研究員', '已經能穩定量產孤獨又有趣的句子。', 'level >= 15', 'science'),
      ('語意迷航員', '在文字迷宮裡走得很遠，還帶著一點從容。', 'level >= 25', 'explore'),
      ('混沌修辭師', '能把混亂變成風格，讓句子長出自己的脾氣。', 'level >= 35', 'auto_awesome'),
      ('終極廢文鍊金術士', '接近滿級的生成大師，把無意義煉成了作品。', 'level >= 45', 'workspace_premium'),
      ('資深孤獨者', '帳號創建滿 30 天，仍然在這裡默默生成。', 'account_age_days >= 30', 'hourglass'),
      ('逗號召喚師', '累積生成 30 句，開始懂得呼吸與停頓。', 'generation_count >= 30', 'more_horiz'),
      ('百句鍛造者', '累積生成 100 句，文字肌肉已經很明顯。', 'generation_count >= 100', 'fitness_center')
    ON DUPLICATE KEY UPDATE
      description = VALUES(description),
      requirement = VALUES(requirement),
      icon = VALUES(icon)
  `);

  await mysqlConnectionPool.query(`
    INSERT INTO AvatarFrame (
      frame_name, description, requirement, unlock_level, rarity,
      border_color, glow_color, background_css
    )
    VALUES
      ('新芽邊框', '預設邊框，所有使用者一開始都會擁有。', 'level >= 1', 1, 'common', '#82b8a4', 'rgba(0,105,68,0.18)', 'linear-gradient(135deg, rgba(255,255,255,0.92), rgba(192,254,229,0.82))'),
      ('新芽相框', '10 級解鎖，清爽的綠色新芽邊框。', 'level >= 10', 10, 'common', '#2f8f6b', 'rgba(47,143,107,0.25)', 'linear-gradient(135deg, rgba(255,255,255,0.94), rgba(192,254,229,0.86))'),
      ('翡翠相框', '20 級解鎖，顏色更沉穩的翡翠邊框。', 'level >= 20', 20, 'rare', '#006944', 'rgba(0,105,68,0.35)', 'linear-gradient(135deg, rgba(217,255,238,0.96), rgba(126,253,190,0.82))'),
      ('霧金相框', '30 級解鎖，綠色底上帶一點金色光。', 'level >= 30', 30, 'epic', '#c49a2c', 'rgba(196,154,44,0.42)', 'linear-gradient(135deg, rgba(255,255,255,0.96), rgba(169,241,214,0.78), rgba(255,222,128,0.62))'),
      ('星森相框', '40 級解鎖，深綠與星光層次更華麗。', 'level >= 40', 40, 'legendary', '#0f4f3a', 'rgba(15,79,58,0.48)', 'linear-gradient(135deg, rgba(217,255,238,0.98), rgba(0,105,68,0.24), rgba(255,255,255,0.72))'),
      ('皇冠藤蔓相框', '50 級解鎖，滿級使用者的皇冠藤蔓邊框。', 'level >= 50', 50, 'mythic', '#f3c74f', 'rgba(243,199,79,0.58)', 'linear-gradient(135deg, rgba(255,255,255,0.98), rgba(126,253,190,0.74), rgba(243,199,79,0.68))')
    ON DUPLICATE KEY UPDATE
      frame_name = VALUES(frame_name),
      description = VALUES(description),
      requirement = VALUES(requirement),
      rarity = VALUES(rarity),
      border_color = VALUES(border_color),
      glow_color = VALUES(glow_color),
      background_css = VALUES(background_css)
  `);

  await mysqlConnectionPool.query(`
    INSERT IGNORE INTO TitleAward (user_id, title_id, is_equipped)
    SELECT u.user_id, t.title_id, FALSE
    FROM User u
    JOIN Title t ON t.title_name = '無名生成者'
  `);

  await mysqlConnectionPool.query(`
    UPDATE TitleAward default_award
    JOIN Title t ON default_award.title_id = t.title_id
    LEFT JOIN TitleAward equipped_award
      ON equipped_award.user_id = default_award.user_id
     AND equipped_award.is_equipped = TRUE
     AND equipped_award.title_award_id <> default_award.title_award_id
    SET default_award.is_equipped = TRUE
    WHERE t.title_name = '無名生成者'
      AND equipped_award.title_award_id IS NULL
  `);

  await mysqlConnectionPool.query(`
    INSERT IGNORE INTO UserAvatarFrame (user_id, frame_id, is_equipped)
    SELECT u.user_id, af.frame_id, FALSE
    FROM User u
    JOIN AvatarFrame af ON af.frame_name = '新芽邊框'
  `);

  await mysqlConnectionPool.query(`
    UPDATE UserAvatarFrame default_frame
    JOIN AvatarFrame af ON default_frame.frame_id = af.frame_id
    LEFT JOIN UserAvatarFrame equipped_frame
      ON equipped_frame.user_id = default_frame.user_id
     AND equipped_frame.is_equipped = TRUE
     AND equipped_frame.user_frame_id <> default_frame.user_frame_id
    SET default_frame.is_equipped = TRUE
    WHERE af.frame_name = '新芽邊框'
      AND equipped_frame.user_frame_id IS NULL
  `);

  console.log("level seed data initialized successfully.");
} catch (error) {
  console.error("Error initializing level seed data:", error);
} finally {
  await mysqlConnectionPool.end();
}
