import mysqlConnectionPool from "../lib/mysql.js";

try {
  await mysqlConnectionPool.query(`
    ALTER TABLE Gibberish
    ADD COLUMN is_hidden BOOLEAN NOT NULL DEFAULT FALSE
  `);

  console.log("Migration completed successfully.");
} catch (error) {
  if (error.code === "ER_DUP_FIELDNAME") {
    console.log("is_hidden already exists, skip migration.");
  } else {
    console.error("Migration failed:", error);
  }
} finally {
  await mysqlConnectionPool.end();
}
