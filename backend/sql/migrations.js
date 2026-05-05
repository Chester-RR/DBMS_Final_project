//這個檔案是用來放未來要修改資料庫的檔案  非必要不要啟動
import mysqlConnectionPool from "../lib/mysql.js";

try {
  // Example 1: 新增欄位
  // await mysqlConnectionPool.query(`
  //   ALTER TABLE User
  //   ADD COLUMN bio TEXT
  // `);

  // Example 2: 修改欄位型別
  // await mysqlConnectionPool.query(`
  //   ALTER TABLE Word
  //   MODIFY COLUMN word_text VARCHAR(255) NOT NULL
  // `);

  // Example 3: 新增外鍵欄位
  // await mysqlConnectionPool.query(`
  //   ALTER TABLE Notification
  //   ADD COLUMN title_award_id INT NULL
  // `);

  // await mysqlConnectionPool.query(`
  //   ALTER TABLE Notification
  //   ADD CONSTRAINT fk_notification_title_award
  //   FOREIGN KEY (title_award_id) REFERENCES TitleAward(title_award_id)
  //   ON DELETE SET NULL
  //   ON UPDATE CASCADE
  // `);

  console.log("Migration file executed. No active migration currently.");
} catch (error) {
  console.error("Error running migration:", error);
} finally {
  await mysqlConnectionPool.end();
}
