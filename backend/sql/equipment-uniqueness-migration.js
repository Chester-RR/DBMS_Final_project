import mysqlConnectionPool from "../lib/mysql.js";

async function columnExists(tableName, columnName) {
  const [rows] = await mysqlConnectionPool.query(
    `
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND COLUMN_NAME = ?
    LIMIT 1
    `,
    [tableName, columnName],
  );

  return rows.length > 0;
}

async function indexExists(tableName, indexName) {
  const [rows] = await mysqlConnectionPool.query(
    `
    SELECT INDEX_NAME
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND INDEX_NAME = ?
    LIMIT 1
    `,
    [tableName, indexName],
  );

  return rows.length > 0;
}

async function dropGeneratedConstraintIfExists(tableName, indexName) {
  if (await indexExists(tableName, indexName)) {
    await mysqlConnectionPool.query(`ALTER TABLE ${tableName} DROP INDEX ${indexName}`);
  }

  if (await columnExists(tableName, "equipped_user_id")) {
    await mysqlConnectionPool.query(`ALTER TABLE ${tableName} DROP COLUMN equipped_user_id`);
  }
}

async function recreateTrigger(triggerName, createSql) {
  await mysqlConnectionPool.query(`DROP TRIGGER IF EXISTS ${triggerName}`);
  await mysqlConnectionPool.query(createSql);
}

try {
  await mysqlConnectionPool.query(`
    UPDATE TitleAward ta
    JOIN (
      SELECT user_id, MAX(title_id) AS keep_title_id
      FROM TitleAward
      WHERE is_equipped = TRUE
      GROUP BY user_id
      HAVING COUNT(*) > 1
    ) duplicate_equipped
      ON duplicate_equipped.user_id = ta.user_id
    SET ta.is_equipped = FALSE
    WHERE ta.is_equipped = TRUE
      AND ta.title_id <> duplicate_equipped.keep_title_id
  `);

  await mysqlConnectionPool.query(`
    UPDATE UserAvatarFrame uaf
    JOIN AvatarFrame af
      ON af.frame_id = uaf.frame_id
    JOIN (
      SELECT uaf_inner.user_id, MAX(af_inner.unlock_level) AS keep_unlock_level
      FROM UserAvatarFrame uaf_inner
      JOIN AvatarFrame af_inner
        ON af_inner.frame_id = uaf_inner.frame_id
      WHERE uaf_inner.is_equipped = TRUE
      GROUP BY uaf_inner.user_id
      HAVING COUNT(*) > 1
    ) duplicate_equipped
      ON duplicate_equipped.user_id = uaf.user_id
    SET uaf.is_equipped = FALSE
    WHERE uaf.is_equipped = TRUE
      AND af.unlock_level <> duplicate_equipped.keep_unlock_level
  `);

  await dropGeneratedConstraintIfExists("TitleAward", "uq_titleaward_one_equipped");
  await dropGeneratedConstraintIfExists("UserAvatarFrame", "uq_useravatarframe_one_equipped");

  await recreateTrigger(
    "trg_titleaward_one_equipped_insert",
    `
    CREATE TRIGGER trg_titleaward_one_equipped_insert
    BEFORE INSERT ON TitleAward
    FOR EACH ROW
    BEGIN
      DECLARE locked_user_id INT;

      IF NEW.is_equipped = TRUE THEN
        SELECT user_id INTO locked_user_id
        FROM User
        WHERE user_id = NEW.user_id
        FOR UPDATE;

        IF EXISTS (
          SELECT 1
          FROM TitleAward
          WHERE user_id = NEW.user_id
            AND is_equipped = TRUE
        ) THEN
          SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Only one title can be equipped per user';
        END IF;
      END IF;
    END
    `,
  );

  await recreateTrigger(
    "trg_titleaward_one_equipped_update",
    `
    CREATE TRIGGER trg_titleaward_one_equipped_update
    BEFORE UPDATE ON TitleAward
    FOR EACH ROW
    BEGIN
      DECLARE locked_user_id INT;

      IF NEW.is_equipped = TRUE THEN
        SELECT user_id INTO locked_user_id
        FROM User
        WHERE user_id = NEW.user_id
        FOR UPDATE;

        IF EXISTS (
          SELECT 1
          FROM TitleAward
          WHERE user_id = NEW.user_id
            AND is_equipped = TRUE
            AND title_award_id <> OLD.title_award_id
        ) THEN
          SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Only one title can be equipped per user';
        END IF;
      END IF;
    END
    `,
  );

  await recreateTrigger(
    "trg_useravatarframe_one_equipped_insert",
    `
    CREATE TRIGGER trg_useravatarframe_one_equipped_insert
    BEFORE INSERT ON UserAvatarFrame
    FOR EACH ROW
    BEGIN
      DECLARE locked_user_id INT;

      IF NEW.is_equipped = TRUE THEN
        SELECT user_id INTO locked_user_id
        FROM User
        WHERE user_id = NEW.user_id
        FOR UPDATE;

        IF EXISTS (
          SELECT 1
          FROM UserAvatarFrame
          WHERE user_id = NEW.user_id
            AND is_equipped = TRUE
        ) THEN
          SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Only one avatar frame can be equipped per user';
        END IF;
      END IF;
    END
    `,
  );

  await recreateTrigger(
    "trg_useravatarframe_one_equipped_update",
    `
    CREATE TRIGGER trg_useravatarframe_one_equipped_update
    BEFORE UPDATE ON UserAvatarFrame
    FOR EACH ROW
    BEGIN
      DECLARE locked_user_id INT;

      IF NEW.is_equipped = TRUE THEN
        SELECT user_id INTO locked_user_id
        FROM User
        WHERE user_id = NEW.user_id
        FOR UPDATE;

        IF EXISTS (
          SELECT 1
          FROM UserAvatarFrame
          WHERE user_id = NEW.user_id
            AND is_equipped = TRUE
            AND user_frame_id <> OLD.user_frame_id
        ) THEN
          SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Only one avatar frame can be equipped per user';
        END IF;
      END IF;
    END
    `,
  );

  console.log("equipment uniqueness triggers initialized successfully.");
} catch (error) {
  console.error("Equipment uniqueness migration failed:", error);
} finally {
  await mysqlConnectionPool.end();
}
