// sql/levelSystem.js
// = Database migration and seed data for the level system
// = Adds User.generation_count
// = Creates AvatarFrame / UserAvatarFrame
// = Inserts default title and avatar frame rewards

import mysqlConnectionPool from "../lib/mysql.js";

async function addColumnIfMissing(tableName, columnName, columnSql) {
  const [rows] = await mysqlConnectionPool.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName],
  );

  if (rows.length > 0) return;

  await mysqlConnectionPool.query(
    `ALTER TABLE ${tableName} ADD COLUMN ${columnSql}`,
  );
}

try {
  await addColumnIfMissing(
    "User",
    "generation_count",
    "generation_count INT NOT NULL DEFAULT 0 AFTER coin_balance",
  );

  await mysqlConnectionPool.query(`
    CREATE TABLE IF NOT EXISTS AvatarFrame (
      frame_id INT AUTO_INCREMENT PRIMARY KEY,
      frame_name VARCHAR(100) NOT NULL UNIQUE,
      description TEXT,
      requirement TEXT NOT NULL,
      unlock_level INT NOT NULL UNIQUE,
      rarity VARCHAR(50) NOT NULL DEFAULT 'common',
      border_color VARCHAR(50) NOT NULL,
      glow_color VARCHAR(100) NOT NULL,
      background_css VARCHAR(255) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

      CONSTRAINT chk_avatarframe_unlock_level
        CHECK (unlock_level >= 1 AND unlock_level <= 50)
    )
  `);

  await mysqlConnectionPool.query(`
    CREATE TABLE IF NOT EXISTS UserAvatarFrame (
      user_frame_id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      frame_id INT NOT NULL,
      earned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      is_equipped BOOLEAN NOT NULL DEFAULT FALSE,

      CONSTRAINT fk_useravatarframe_user
        FOREIGN KEY (user_id) REFERENCES User(user_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

      CONSTRAINT fk_useravatarframe_frame
        FOREIGN KEY (frame_id) REFERENCES AvatarFrame(frame_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

      CONSTRAINT uq_useravatarframe_user_frame
        UNIQUE (user_id, frame_id),

      CONSTRAINT chk_useravatarframe_is_equipped
        CHECK (is_equipped IN (0, 1))
    )
  `);

  await mysqlConnectionPool.query(`
    INSERT INTO Title (title_name, description, requirement, icon)
    VALUES
      ('\u53e5\u5b50\u9ede\u706b\u8005', '\u958b\u59cb\u628a\u8352\u8b2c\u53e5\u5b50\u9ede\u4eae\u7684\u4eba\u3002', 'level >= 5', 'spark'),
      ('\u5b64\u53e5\u7814\u7a76\u54e1', '\u5df2\u7d93\u80fd\u7a69\u5b9a\u91cf\u7522\u5b64\u7368\u53c8\u6709\u8da3\u7684\u53e5\u5b50\u3002', 'level >= 15', 'science'),
      ('\u8a9e\u610f\u8ff7\u822a\u54e1', '\u5728\u6587\u5b57\u8ff7\u5bae\u88e1\u8d70\u5f97\u5f88\u9060\uff0c\u9084\u5e36\u8457\u4e00\u9ede\u5f9e\u5bb9\u3002', 'level >= 25', 'explore'),
      ('\u6df7\u6c8c\u4fee\u8fad\u5e2b', '\u80fd\u628a\u6df7\u4e82\u8b8a\u6210\u98a8\u683c\uff0c\u8b93\u53e5\u5b50\u9577\u51fa\u81ea\u5df1\u7684\u813e\u6c23\u3002', 'level >= 35', 'auto_awesome'),
      ('\u7d42\u6975\u5ee2\u6587\u934a\u91d1\u8853\u58eb', '\u63a5\u8fd1\u6eff\u7d1a\u7684\u751f\u6210\u5927\u5e2b\uff0c\u628a\u7121\u610f\u7fa9\u7149\u6210\u4e86\u4f5c\u54c1\u3002', 'level >= 45', 'workspace_premium'),
      ('\u8cc7\u6df1\u5b64\u7368\u8005', '\u5e33\u865f\u5275\u5efa\u6eff 30 \u5929\uff0c\u4ecd\u7136\u5728\u9019\u88e1\u9ed8\u9ed8\u751f\u6210\u3002', 'account_age_days >= 30', 'hourglass'),
      ('\u9017\u865f\u53ec\u559a\u5e2b', '\u7d2f\u7a4d\u751f\u6210 30 \u53e5\uff0c\u958b\u59cb\u61c2\u5f97\u547c\u5438\u8207\u505c\u9813\u3002', 'generation_count >= 30', 'more_horiz'),
      ('\u767e\u53e5\u935b\u9020\u8005', '\u7d2f\u7a4d\u751f\u6210 100 \u53e5\uff0c\u6587\u5b57\u808c\u8089\u5df2\u7d93\u5f88\u660e\u986f\u3002', 'generation_count >= 100', 'fitness_center')
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
      ('\u65b0\u82bd\u76f8\u6846', '10 \u7d1a\u89e3\u9396\uff0c\u6e05\u723d\u7684\u7da0\u8272\u65b0\u82bd\u908a\u6846\u3002', 'level >= 10', 10, 'common', '#2f8f6b', 'rgba(47,143,107,0.25)', 'linear-gradient(135deg, rgba(255,255,255,0.94), rgba(192,254,229,0.86))'),
      ('\u7fe1\u7fe0\u76f8\u6846', '20 \u7d1a\u89e3\u9396\uff0c\u984f\u8272\u66f4\u6c89\u7a69\u7684\u7fe1\u7fe0\u908a\u6846\u3002', 'level >= 20', 20, 'rare', '#006944', 'rgba(0,105,68,0.35)', 'linear-gradient(135deg, rgba(217,255,238,0.96), rgba(126,253,190,0.82))'),
      ('\u9727\u91d1\u76f8\u6846', '30 \u7d1a\u89e3\u9396\uff0c\u7da0\u8272\u5e95\u4e0a\u5e36\u4e00\u9ede\u91d1\u8272\u5149\u3002', 'level >= 30', 30, 'epic', '#c49a2c', 'rgba(196,154,44,0.42)', 'linear-gradient(135deg, rgba(255,255,255,0.96), rgba(169,241,214,0.78), rgba(255,222,128,0.62))'),
      ('\u661f\u68ee\u76f8\u6846', '40 \u7d1a\u89e3\u9396\uff0c\u6df1\u7da0\u8207\u661f\u5149\u5c64\u6b21\u66f4\u83ef\u9e97\u3002', 'level >= 40', 40, 'legendary', '#0f4f3a', 'rgba(15,79,58,0.48)', 'linear-gradient(135deg, rgba(217,255,238,0.98), rgba(0,105,68,0.24), rgba(255,255,255,0.72))'),
      ('\u738b\u51a0\u85e4\u8513\u76f8\u6846', '50 \u7d1a\u89e3\u9396\uff0c\u6eff\u7d1a\u4f7f\u7528\u8005\u7684\u7687\u51a0\u85e4\u8513\u908a\u6846\u3002', 'level >= 50', 50, 'mythic', '#f3c74f', 'rgba(243,199,79,0.58)', 'linear-gradient(135deg, rgba(255,255,255,0.98), rgba(126,253,190,0.74), rgba(243,199,79,0.68))')
    ON DUPLICATE KEY UPDATE
      description = VALUES(description),
      requirement = VALUES(requirement),
      rarity = VALUES(rarity),
      border_color = VALUES(border_color),
      glow_color = VALUES(glow_color),
      background_css = VALUES(background_css)
  `);

  console.log("level system tables and seed data created successfully.");
} catch (error) {
  console.error("Error creating level system:", error);
} finally {
  await mysqlConnectionPool.end();
}