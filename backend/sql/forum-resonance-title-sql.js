import mysqlConnectionPool from "../lib/mysql.js";

const FORUM_RESONANCE_TITLE_NAME = "論壇共鳴者";
const FORUM_RESONANCE_DESCRIPTION =
  "自己的亂語累積收到 10 個讚，能在論壇顯示特殊標記。";

try {
  await mysqlConnectionPool.query(
    `
    INSERT INTO Title (title_name, description, requirement, icon)
    VALUES (?, ?, 'received_like_count >= 10', 'campaign')
    ON DUPLICATE KEY UPDATE
      description = VALUES(description),
      requirement = VALUES(requirement),
      icon = VALUES(icon)
    `,
    [FORUM_RESONANCE_TITLE_NAME, FORUM_RESONANCE_DESCRIPTION],
  );

  console.log("forum resonance title initialized successfully.");
} catch (error) {
  console.error("Error initializing forum resonance title:", error);
} finally {
  await mysqlConnectionPool.end();
}
