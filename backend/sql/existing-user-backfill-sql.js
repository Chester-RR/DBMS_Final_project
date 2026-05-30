import mysqlConnectionPool from "../lib/mysql.js";
import { recordCoinTransaction, SIGNUP_BONUS_COINS } from "../features/coin.js";

const DEFAULT_TITLE_NAME = "無名生成者";
const DEFAULT_FRAME_NAME = "新芽邊框";
const LOYAL_CUSTOMER_TITLE_NAME = "商店常客";
const LOYAL_CUSTOMER_AVATAR_NAME = "商店常客限定頭像";
const FORUM_RESONANCE_TITLE_NAME = "論壇共鳴者";

const titleRequirementCases = [
  { requirement: "level >= 1", condition: "u.level >= 1" },
  { requirement: "level >= 5", condition: "u.level >= 5" },
  { requirement: "level >= 15", condition: "u.level >= 15" },
  { requirement: "level >= 25", condition: "u.level >= 25" },
  { requirement: "level >= 35", condition: "u.level >= 35" },
  { requirement: "level >= 45", condition: "u.level >= 45" },
  {
    requirement: "account_age_days >= 30",
    condition: "DATEDIFF(CURDATE(), DATE(u.created_at)) >= 30",
  },
  { requirement: "generation_count >= 30", condition: "u.generation_count >= 30" },
  { requirement: "generation_count >= 50", condition: "u.generation_count >= 50" },
  { requirement: "generation_count >= 100", condition: "u.generation_count >= 100" },
];

async function backfillRequirementTitles(connection) {
  const conditions = titleRequirementCases
    .map(({ requirement, condition }) => `(t.requirement = '${requirement}' AND ${condition})`)
    .join("\n       OR ");

  await connection.query(`
    INSERT IGNORE INTO TitleAward (user_id, title_id, is_equipped)
    SELECT u.user_id, t.title_id, FALSE
    FROM User u
    JOIN Title t
      ON ${conditions}
  `);
}

async function backfillDefaultEquippedTitle(connection) {
  await connection.query(
    `
    UPDATE TitleAward default_award
    JOIN Title t ON default_award.title_id = t.title_id
    LEFT JOIN TitleAward equipped_award
      ON equipped_award.user_id = default_award.user_id
     AND equipped_award.is_equipped = TRUE
     AND equipped_award.title_award_id <> default_award.title_award_id
    SET default_award.is_equipped = TRUE
    WHERE t.title_name = ?
      AND equipped_award.title_award_id IS NULL
    `,
    [DEFAULT_TITLE_NAME],
  );
}

async function backfillEligibleFrames(connection) {
  await connection.query(`
    INSERT IGNORE INTO UserAvatarFrame (user_id, frame_id, is_equipped)
    SELECT u.user_id, af.frame_id, FALSE
    FROM User u
    JOIN AvatarFrame af
      ON af.unlock_level <= u.level
  `);
}

async function backfillDefaultEquippedFrame(connection) {
  await connection.query(
    `
    UPDATE UserAvatarFrame default_frame
    JOIN AvatarFrame af ON default_frame.frame_id = af.frame_id
    LEFT JOIN UserAvatarFrame equipped_frame
      ON equipped_frame.user_id = default_frame.user_id
     AND equipped_frame.is_equipped = TRUE
     AND equipped_frame.user_frame_id <> default_frame.user_frame_id
    SET default_frame.is_equipped = TRUE
    WHERE af.frame_name = ?
      AND equipped_frame.user_frame_id IS NULL
    `,
    [DEFAULT_FRAME_NAME],
  );
}

async function backfillLoyalCustomerTitle(connection) {
  await connection.query(
    `
    INSERT IGNORE INTO TitleAward (user_id, title_id, is_equipped)
    SELECT ui.user_id, t.title_id, FALSE
    FROM UserItem ui
    JOIN ShopItem si
      ON ui.item_id = si.item_id
     AND si.item_type = 'avatar'
     AND si.item_name <> ?
    JOIN Title t
      ON t.title_name = ?
    GROUP BY ui.user_id, t.title_id
    HAVING COUNT(*) >= 3
    `,
    [LOYAL_CUSTOMER_AVATAR_NAME, LOYAL_CUSTOMER_TITLE_NAME],
  );
}

async function backfillForumResonanceTitle(connection) {
  await connection.query(
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
}

async function backfillSignupBonusForZeroBalanceUsers(connection) {
  const [users] = await connection.query(`
    SELECT u.user_id
    FROM User u
    LEFT JOIN CoinRecord cr
      ON cr.user_id = u.user_id
     AND cr.reason_type = 'signup_bonus'
    WHERE u.coin_balance = 0
      AND cr.coin_record_id IS NULL
  `);

  for (const user of users) {
    await recordCoinTransaction(connection, {
      userId: user.user_id,
      amount: SIGNUP_BONUS_COINS,
      reasonType: "signup_bonus",
      reasonDescription: "舊使用者補發新手啟動金",
    });
  }
}

const connection = await mysqlConnectionPool.getConnection();

try {
  await connection.beginTransaction();

  await backfillSignupBonusForZeroBalanceUsers(connection);
  await backfillRequirementTitles(connection);
  await backfillDefaultEquippedTitle(connection);
  await backfillEligibleFrames(connection);
  await backfillDefaultEquippedFrame(connection);
  await backfillLoyalCustomerTitle(connection);
  await backfillForumResonanceTitle(connection);

  await connection.commit();
  console.log("existing user backfill completed successfully.");
} catch (error) {
  await connection.rollback();
  console.error("Error backfilling existing users:", error);
} finally {
  connection.release();
  await mysqlConnectionPool.end();
}
