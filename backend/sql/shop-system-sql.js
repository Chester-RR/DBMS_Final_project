import mysqlConnectionPool from "../lib/mysql.js";

const LOYAL_CUSTOMER_TITLE_NAME = "\u5546\u5e97\u5e38\u5ba2";
const LOYAL_CUSTOMER_TITLE_DESCRIPTION =
  "\u7d2f\u7a4d\u8cfc\u8cb7 3 \u500b\u982d\u50cf\uff0c\u89e3\u9396\u5546\u5e97\u9650\u5b9a\u982d\u50cf\u3002";
const LOYAL_CUSTOMER_AVATAR_NAME = "\u5546\u5e97\u5e38\u5ba2\u9650\u5b9a\u982d\u50cf";
const LOYAL_CUSTOMER_AVATAR_DESCRIPTION =
  "\u53ea\u6709\u8cfc\u8cb7\u904e 3 \u500b\u982d\u50cf\u7684\u4f7f\u7528\u8005\u624d\u6703\u770b\u5230\u7684\u9650\u5b9a\u982d\u50cf\u3002";

async function indexExists(tableName, indexName) {
  const [rows] = await mysqlConnectionPool.query(
    `SELECT INDEX_NAME
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND INDEX_NAME = ?
     LIMIT 1`,
    [tableName, indexName],
  );

  return rows.length > 0;
}

try {
  await mysqlConnectionPool.query(`
    ALTER TABLE User
    MODIFY coin_balance INT NOT NULL DEFAULT 2000
  `);

  await mysqlConnectionPool.query(`
    UPDATE User
    SET coin_balance = 2000
    WHERE coin_balance = 0
  `);

  if (!(await indexExists("ShopItem", "uq_shopitem_name_type"))) {
    await mysqlConnectionPool.query(`
      CREATE UNIQUE INDEX uq_shopitem_name_type
      ON ShopItem (item_name, item_type)
    `);
  }

  await mysqlConnectionPool.query(`
    INSERT INTO ShopItem (
      item_name,
      description,
      item_type,
      price,
      image_url,
      is_available
    )
    VALUES
      ('初芽頭像', '一開始就能入手的清爽綠色頭像。', 'avatar', 0, 'account_circle', TRUE),
      ('葉影頭像', '帶一點森林感的葉片頭像。', 'avatar', 300, 'eco', TRUE),
      ('逗號頭像', '給累積生成玩家的俏皮標記。', 'avatar', 500, 'more_horiz', TRUE),
      ('星光頭像', '讓個人資料多一點亮度。', 'avatar', 800, 'stars', TRUE),
      ('皇冠頭像', '昂貴但很有存在感的商店頭像。', 'avatar', 1200, 'workspace_premium', TRUE)
    ON DUPLICATE KEY UPDATE
      description = VALUES(description),
      price = VALUES(price),
      image_url = VALUES(image_url),
      is_available = VALUES(is_available),
      updated_at = NOW()
  `);

  await mysqlConnectionPool.query(
    `
    INSERT INTO Title (title_name, description, requirement, icon)
    VALUES (?, ?, 'owned_avatar_count >= 3', 'storefront')
    ON DUPLICATE KEY UPDATE
      description = VALUES(description),
      requirement = VALUES(requirement),
      icon = VALUES(icon)
    `,
    [LOYAL_CUSTOMER_TITLE_NAME, LOYAL_CUSTOMER_TITLE_DESCRIPTION],
  );

  await mysqlConnectionPool.query(
    `
    INSERT INTO ShopItem (
      item_name,
      description,
      item_type,
      price,
      image_url,
      is_available
    )
    VALUES (?, ?, 'avatar', 0, 'verified', TRUE)
    ON DUPLICATE KEY UPDATE
      description = VALUES(description),
      price = VALUES(price),
      image_url = VALUES(image_url),
      is_available = VALUES(is_available),
      updated_at = NOW()
    `,
    [LOYAL_CUSTOMER_AVATAR_NAME, LOYAL_CUSTOMER_AVATAR_DESCRIPTION],
  );

  await mysqlConnectionPool.query(
    `
    INSERT IGNORE INTO TitleAward (user_id, title_id, is_equipped)
    SELECT ui.user_id, t.title_id, FALSE
    FROM UserItem ui
    JOIN ShopItem si
      ON ui.item_id = si.item_id
     AND si.item_type = 'avatar'
     AND si.item_name <> ?
    JOIN Title t
      ON t.title_name = ?
    GROUP BY ui.user_id, t.title_id
    HAVING COUNT(*) >= 3
    `,
    [LOYAL_CUSTOMER_AVATAR_NAME, LOYAL_CUSTOMER_TITLE_NAME],
  );

  console.log("shop system data created successfully.");
} catch (error) {
  console.error("Error creating shop system:", error);
} finally {
  await mysqlConnectionPool.end();
}
