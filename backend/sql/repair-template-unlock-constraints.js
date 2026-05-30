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

async function tableConstraintExists(tableName, constraintName) {
  const [rows] = await mysqlConnectionPool.query(
    `
    SELECT CONSTRAINT_NAME
    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND CONSTRAINT_NAME = ?
    LIMIT 1
    `,
    [tableName, constraintName],
  );

  return rows.length > 0;
}

async function recreateUnlockTitleForeignKey() {
  if (await tableConstraintExists("Template", "fk_template_unlock_title")) {
    await mysqlConnectionPool.query(`
      ALTER TABLE Template
      DROP FOREIGN KEY fk_template_unlock_title
    `);
  }

  await mysqlConnectionPool.query(`
    ALTER TABLE Template
    ADD CONSTRAINT fk_template_unlock_title
    FOREIGN KEY (unlock_title_id) REFERENCES Title(title_id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
  `);
}

async function recreateTrigger(triggerName, createSql) {
  await mysqlConnectionPool.query(`DROP TRIGGER IF EXISTS ${triggerName}`);
  await mysqlConnectionPool.query(createSql);
}

try {
  if (!(await columnExists("Template", "is_special"))) {
    await mysqlConnectionPool.query(`
      ALTER TABLE Template
      ADD COLUMN is_special BOOLEAN NOT NULL DEFAULT FALSE
    `);
  }

  if (!(await columnExists("Template", "unlock_title_id"))) {
    await mysqlConnectionPool.query(`
      ALTER TABLE Template
      ADD COLUMN unlock_title_id INT NULL
    `);
  }

  await recreateUnlockTitleForeignKey();

  if (!(await tableConstraintExists("Template", "chk_template_is_special"))) {
    await mysqlConnectionPool.query(`
      ALTER TABLE Template
      ADD CONSTRAINT chk_template_is_special
      CHECK (is_special IN (0, 1))
    `);
  }

  await recreateTrigger(
    "trg_template_unlock_rule_insert",
    `
    CREATE TRIGGER trg_template_unlock_rule_insert
    BEFORE INSERT ON Template
    FOR EACH ROW
    BEGIN
      IF NEW.is_special = TRUE AND NEW.unlock_title_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'Special template requires unlock_title_id';
      END IF;

      IF NEW.is_special = FALSE AND NEW.unlock_title_id IS NOT NULL THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'Normal template cannot have unlock_title_id';
      END IF;
    END
    `,
  );

  await recreateTrigger(
    "trg_template_unlock_rule_update",
    `
    CREATE TRIGGER trg_template_unlock_rule_update
    BEFORE UPDATE ON Template
    FOR EACH ROW
    BEGIN
      IF NEW.is_special = TRUE AND NEW.unlock_title_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'Special template requires unlock_title_id';
      END IF;

      IF NEW.is_special = FALSE AND NEW.unlock_title_id IS NOT NULL THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'Normal template cannot have unlock_title_id';
      END IF;
    END
    `,
  );

  console.log("template unlock migration completed successfully.");
} catch (error) {
  console.error("Template unlock migration failed:", error);
} finally {
  await mysqlConnectionPool.end();
}
