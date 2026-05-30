import express from "express";
import mysqlConnectionPool from "../lib/mysql.js";
import { CoinTransactionError, recordCoinTransaction } from "./coin.js";

const router = express.Router();

const LOYAL_CUSTOMER_TITLE_NAME = "商店常客";
const LOYAL_CUSTOMER_AVATAR_NAME = "商店常客限定頭像";
const LOYAL_CUSTOMER_UNLOCK_COUNT = 3;

async function getUserForShop(userId, connection = mysqlConnectionPool) {
  const [users] = await connection.query(
    "SELECT user_id, user_name, coin_balance FROM User WHERE user_id = ?",
    [userId],
  );

  return users[0];
}

async function getEquippedAvatar(userId, connection = mysqlConnectionPool) {
  const [avatars] = await connection.query(
    `SELECT si.item_id, si.item_name, si.description, si.image_url, ui.purchased_at, ui.is_equipped
     FROM UserItem ui
     JOIN ShopItem si ON ui.item_id = si.item_id
     WHERE ui.user_id = ?
       AND si.item_type = 'avatar'
       AND ui.is_equipped = TRUE
     LIMIT 1`,
    [userId],
  );

  return avatars[0] || null;
}

async function getOwnedAvatarCount(userId, connection = mysqlConnectionPool) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS owned_avatar_count
     FROM UserItem ui
     JOIN ShopItem si ON ui.item_id = si.item_id
     WHERE ui.user_id = ?
       AND si.item_type = 'avatar'
       AND si.item_name <> ?`,
    [userId, LOYAL_CUSTOMER_AVATAR_NAME],
  );

  return Number(rows[0]?.owned_avatar_count) || 0;
}

async function userHasLoyalCustomerTitle(userId, connection = mysqlConnectionPool) {
  const [rows] = await connection.query(
    `SELECT ta.title_award_id
     FROM TitleAward ta
     JOIN Title t ON ta.title_id = t.title_id
     WHERE ta.user_id = ?
       AND t.title_name = ?
     LIMIT 1`,
    [userId, LOYAL_CUSTOMER_TITLE_NAME],
  );

  return rows.length > 0;
}

async function awardLoyalCustomerTitleIfEligible(userId, connection = mysqlConnectionPool) {
  const ownedAvatarCount = await getOwnedAvatarCount(userId, connection);

  if (ownedAvatarCount < LOYAL_CUSTOMER_UNLOCK_COUNT) {
    return false;
  }

  await connection.query(
    `INSERT IGNORE INTO TitleAward (user_id, title_id, is_equipped)
     SELECT ?, title_id, FALSE
     FROM Title
     WHERE title_name = ?
     LIMIT 1`,
    [userId, LOYAL_CUSTOMER_TITLE_NAME],
  );

  return true;
}

async function canAccessLoyalCustomerAvatar(userId, connection = mysqlConnectionPool) {
  if (await userHasLoyalCustomerTitle(userId, connection)) return true;
  return awardLoyalCustomerTitleIfEligible(userId, connection);
}

router.get("/:userId", async (req, res) => {
  try {
    const user = await getUserForShop(req.params.userId);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const canAccessLimitedAvatar = await canAccessLoyalCustomerAvatar(req.params.userId);

    const [items] = await mysqlConnectionPool.query(
      `SELECT
         si.item_id,
         si.item_name,
         si.description,
         si.item_type,
         si.price,
         si.image_url,
         si.is_available,
         ui.user_item_id IS NOT NULL AS is_owned,
         COALESCE(ui.is_equipped, FALSE) AS is_equipped,
         ui.purchased_at
       FROM ShopItem si
       LEFT JOIN UserItem ui
         ON ui.item_id = si.item_id
        AND ui.user_id = ?
       WHERE si.is_available = TRUE
         AND si.item_type = 'avatar'
       ORDER BY si.price ASC, si.item_id ASC`,
      [req.params.userId],
    );

    const visibleItems = items.filter(
      (item) =>
        item.item_name !== LOYAL_CUSTOMER_AVATAR_NAME ||
        item.is_owned ||
        canAccessLimitedAvatar,
    );

    return res.json({
      success: true,
      user,
      equippedAvatar: await getEquippedAvatar(req.params.userId),
      items: visibleItems,
      unlocks: {
        loyalCustomerAvatar: canAccessLimitedAvatar,
      },
    });
  } catch (error) {
    console.error("Failed to load shop:", error);
    return res.status(500).json({ success: false, message: "Load shop failed" });
  }
});

router.get("/:userId/equipped-avatar", async (req, res) => {
  try {
    const user = await getUserForShop(req.params.userId);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.json({
      success: true,
      avatar: await getEquippedAvatar(req.params.userId),
    });
  } catch (error) {
    console.error("Failed to load equipped avatar:", error);
    return res.status(500).json({ success: false, message: "Load equipped avatar failed" });
  }
});

router.post("/:userId/purchase", async (req, res) => {
  const itemId = req.body["item_id"];

  if (!itemId) {
    return res.status(400).json({ success: false, message: "item_id is required" });
  }

  const connection = await mysqlConnectionPool.getConnection();

  try {
    await connection.beginTransaction();

    const user = await getUserForShop(req.params.userId, connection);

    if (!user) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const [items] = await connection.query(
      `SELECT item_id, item_name, item_type, price, is_available
       FROM ShopItem
       WHERE item_id = ?
       LIMIT 1`,
      [itemId],
    );

    const item = items[0];

    if (!item || !item.is_available || item.item_type !== "avatar") {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Item not available" });
    }

    if (
      item.item_name === LOYAL_CUSTOMER_AVATAR_NAME &&
      !(await canAccessLoyalCustomerAvatar(req.params.userId, connection))
    ) {
      await connection.rollback();
      return res.status(403).json({
        success: false,
        message: `Purchase ${LOYAL_CUSTOMER_UNLOCK_COUNT} avatars to unlock this item`,
      });
    }

    const [ownedItems] = await connection.query(
      "SELECT user_item_id FROM UserItem WHERE user_id = ? AND item_id = ? LIMIT 1",
      [req.params.userId, itemId],
    );

    if (ownedItems.length > 0) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: "Item already owned" });
    }

    if (user.coin_balance < item.price) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Not enough coins" });
    }

    await connection.query(
      "INSERT INTO UserItem (user_id, item_id, purchased_at, is_equipped) VALUES (?, ?, NOW(), FALSE)",
      [req.params.userId, itemId],
    );

    const [purchaseResult] = await connection.query(
      "INSERT INTO PurchaseRecord (user_id, item_id, price_at_purchase, purchased_at) VALUES (?, ?, ?, NOW())",
      [req.params.userId, itemId, item.price],
    );

    if (item.price > 0) {
      await recordCoinTransaction(connection, {
        userId: req.params.userId,
        amount: -Number(item.price),
        reasonType: "purchase",
        reasonDescription: `購買頭像：${item.item_name}`,
        purchaseId: purchaseResult.insertId,
      });
    }

    await awardLoyalCustomerTitleIfEligible(req.params.userId, connection);

    await connection.commit();

    const updatedUser = await getUserForShop(req.params.userId);

    return res.json({
      success: true,
      message: "Purchase successful",
      user: updatedUser,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Failed to purchase item:", error);

    if (error instanceof CoinTransactionError && error.code === "INSUFFICIENT_COINS") {
      return res.status(400).json({ success: false, message: "Not enough coins" });
    }

    return res.status(500).json({ success: false, message: "Purchase failed" });
  } finally {
    connection.release();
  }
});

router.post("/:userId/equip", async (req, res) => {
  const itemId = req.body["item_id"];

  if (!itemId) {
    return res.status(400).json({ success: false, message: "item_id is required" });
  }

  const connection = await mysqlConnectionPool.getConnection();

  try {
    await connection.beginTransaction();

    const [ownedItems] = await connection.query(
      `SELECT ui.user_item_id, si.item_id, si.item_name, si.item_type, si.image_url
       FROM UserItem ui
       JOIN ShopItem si ON ui.item_id = si.item_id
       WHERE ui.user_id = ?
         AND ui.item_id = ?
         AND si.item_type = 'avatar'
       LIMIT 1`,
      [req.params.userId, itemId],
    );

    const ownedItem = ownedItems[0];

    if (!ownedItem) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Avatar not owned" });
    }

    await connection.query(
      `UPDATE UserItem ui
       JOIN ShopItem si ON ui.item_id = si.item_id
       SET ui.is_equipped = FALSE
       WHERE ui.user_id = ?
         AND si.item_type = 'avatar'`,
      [req.params.userId],
    );

    await connection.query(
      "UPDATE UserItem SET is_equipped = TRUE WHERE user_id = ? AND item_id = ?",
      [req.params.userId, itemId],
    );

    await connection.commit();

    return res.json({
      success: true,
      message: "Avatar equipped",
      avatar: await getEquippedAvatar(req.params.userId),
    });
  } catch (error) {
    await connection.rollback();
    console.error("Failed to equip avatar:", error);
    return res.status(500).json({ success: false, message: "Equip avatar failed" });
  } finally {
    connection.release();
  }
});

export default router;
