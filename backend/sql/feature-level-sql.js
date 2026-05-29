// backend/sql/feature-level-sql.js

// 寫入等級系統的預設資料
// ============================================================
// 等級系統預設資料建立腳本
// ------------------------------------------------------------
// 這個檔案不是 API，而是一次性或可重複執行的 seed 腳本。
// 執行方式通常是在 backend 目錄下跑：node sql/feature-level-sql.js
//
// 資料表結構統一由 createTable.js 建立，這裡只負責寫入：
// 1. 預設稱號 Title 種子資料。
// 2. 預設頭像框 AvatarFrame 種子資料。
//
// 設計重點：
// - INSERT ... ON DUPLICATE KEY UPDATE 讓 seed 可以重跑，並同步更新描述或外觀設定。
// ============================================================

import mysqlConnectionPool from "../lib/mysql.js";

try {
  // 寫入預設稱號。
  //
  // Title 表本身在 createTable.js 已建立，這裡只負責補 seed data。
  // requirement 目前用可讀字串保存，實際判斷邏輯在 level.js 的 titleRequirementIsMet。
  // icon 是 Material Symbols 或前端可自行對應的圖示名稱。
  //
  // 使用 Unicode escape 是為了避免在不同終端機編碼下跑腳本時中文字被破壞。
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

  // 寫入預設頭像框。
  //
  // 解鎖規則目前是每 10 級一個框：10、20、30、40、50。
  // border_color / glow_color / background_css 會被 interface.html 讀取後套到 CSS 變數，
  // 所以資料庫不只保存名稱，也保存前端呈現需要的視覺參數。
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
  // 腳本執行完畢後關閉 pool，避免 node process 因連線池仍存在而不結束。
  await mysqlConnectionPool.end();
}
