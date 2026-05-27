import mysqlConnectionPool from "../lib/mysql.js";

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

  console.log("shop system data created successfully.");
} catch (error) {
  console.error("Error creating shop system:", error);
} finally {
  await mysqlConnectionPool.end();
}
