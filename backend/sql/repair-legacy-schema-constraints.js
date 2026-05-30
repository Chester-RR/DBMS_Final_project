import mysqlConnectionPool from "../lib/mysql.js";

async function tableExists(tableName) {
  const [rows] = await mysqlConnectionPool.query(
    `
    SELECT TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
    LIMIT 1
    `,
    [tableName],
  );

  return rows.length > 0;
}

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

async function recreateWordVocabularyPackForeignKey() {
  if (await tableConstraintExists("Word", "fk_word_vocabulary_pack")) {
    await mysqlConnectionPool.query(`
      ALTER TABLE Word
      DROP FOREIGN KEY fk_word_vocabulary_pack
    `);
  }

  await mysqlConnectionPool.query(`
    ALTER TABLE Word
    ADD CONSTRAINT fk_word_vocabulary_pack
    FOREIGN KEY (vocabulary_pack_id) REFERENCES VocabularyPack(vocabulary_pack_id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
  `);
}

async function recreateTrigger(triggerName, createSql) {
  await mysqlConnectionPool.query(`DROP TRIGGER IF EXISTS ${triggerName}`);
  await mysqlConnectionPool.query(createSql);
}

try {
  if (!(await tableExists("CoinRecord"))) {
    await mysqlConnectionPool.query(`
      CREATE TABLE CoinRecord (
        coin_record_id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        amount INT NOT NULL,
        balance_after INT NOT NULL,
        reason_type VARCHAR(50) NOT NULL,
        reason_description TEXT,
        gibberish_id INT NULL,
        purchase_id INT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT fk_coinrecord_user
          FOREIGN KEY (user_id) REFERENCES User(user_id)
          ON DELETE CASCADE
          ON UPDATE CASCADE,

        CONSTRAINT fk_coinrecord_gibberish
          FOREIGN KEY (gibberish_id) REFERENCES Gibberish(gibberish_id),

        CONSTRAINT fk_coinrecord_purchase
          FOREIGN KEY (purchase_id) REFERENCES PurchaseRecord(purchase_id),

        CONSTRAINT uq_coinrecord_generation
          UNIQUE (reason_type, gibberish_id),

        CONSTRAINT uq_coinrecord_purchase
          UNIQUE (reason_type, purchase_id),

        CONSTRAINT chk_coinrecord_amount
          CHECK (amount <> 0),

        CONSTRAINT chk_coinrecord_balance_after
          CHECK (balance_after >= 0),

        CONSTRAINT chk_coinrecord_reason_type
          CHECK (reason_type IN ('signup_bonus', 'generation_reward', 'purchase')),

        CONSTRAINT chk_coinrecord_reason_amount
          CHECK (
            (reason_type IN ('signup_bonus', 'generation_reward') AND amount > 0)
            OR (reason_type = 'purchase' AND amount < 0)
          ),

        CONSTRAINT chk_coinrecord_reason_target
          CHECK (
            (
              reason_type = 'signup_bonus'
              AND gibberish_id IS NULL
              AND purchase_id IS NULL
            )
            OR (
              reason_type = 'generation_reward'
              AND gibberish_id IS NOT NULL
              AND purchase_id IS NULL
            )
            OR (
              reason_type = 'purchase'
              AND gibberish_id IS NULL
              AND purchase_id IS NOT NULL
            )
          )
      )
    `);
  }

  if (!(await tableExists("VocabularyPack"))) {
    await mysqlConnectionPool.query(`
      CREATE TABLE VocabularyPack (
        vocabulary_pack_id INT AUTO_INCREMENT PRIMARY KEY,
        pack_name VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        unlock_title_id INT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        CONSTRAINT fk_vocabularypack_unlock_title
          FOREIGN KEY (unlock_title_id) REFERENCES Title(title_id)
          ON DELETE RESTRICT
          ON UPDATE CASCADE
      )
    `);
  }

  if (!(await columnExists("Word", "vocabulary_pack_id"))) {
    await mysqlConnectionPool.query(`
      ALTER TABLE Word
      ADD COLUMN vocabulary_pack_id INT NULL
    `);
  }

  await recreateWordVocabularyPackForeignKey();

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

  console.log("legacy schema constraints repaired successfully.");
} catch (error) {
  console.error("Legacy schema repair failed:", error);
} finally {
  await mysqlConnectionPool.end();
}
