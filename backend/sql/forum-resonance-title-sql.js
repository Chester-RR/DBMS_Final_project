import mysqlConnectionPool from "../lib/mysql.js";

const FORUM_RESONANCE_TITLE_NAME = "\u8ad6\u58c7\u5171\u9cf4\u8005";
const FORUM_RESONANCE_DESCRIPTION =
  "\u81ea\u5df1\u7684\u4e82\u8a9e\u7d2f\u7a4d\u6536\u5230 10 \u500b\u8b9a\uff0c\u80fd\u5728\u8ad6\u58c7\u986f\u793a\u7279\u6b8a\u6a19\u8a18\u3002";

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

  await mysqlConnectionPool.query(
    `
    INSERT IGNORE INTO TitleAward (user_id, title_id, is_equipped)
    SELECT g.user_id, t.title_id, FALSE
    FROM Gibberish g
    JOIN GibberishLike gl
      ON gl.gibberish_id = g.gibberish_id
     AND gl.user_id <> g.user_id
    JOIN Title t
      ON t.title_name = ?
    GROUP BY g.user_id, t.title_id
    HAVING COUNT(*) >= 10
    `,
    [FORUM_RESONANCE_TITLE_NAME],
  );

  console.log("forum resonance title initialized successfully.");
} catch (error) {
  console.error("Error initializing forum resonance title:", error);
} finally {
  await mysqlConnectionPool.end();
}
