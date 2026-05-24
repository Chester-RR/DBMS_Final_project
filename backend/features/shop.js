import express from "express";
import mysqlConnectionPool from "../lib/mysql.js";

const router = express.Router();

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

router.get("/:userId", async (req, res) => {
  try {
    const user = await getUserForShop(req.params.userId);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

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

    return res.json({
      success: true,
      user,
      equippedAvatar: await getEquippedAvatar(req.params.userId),
      items,
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
      "UPDATE User SET coin_balance = coin_balance - ? WHERE user_id = ?",
      [item.price, req.params.userId],
    );

    await connection.query(
      "INSERT INTO UserItem (user_id, item_id, purchased_at, is_equipped) VALUES (?, ?, NOW(), FALSE)",
      [req.params.userId, itemId],
    );

    await connection.query(
      "INSERT INTO PurchaseRecord (user_id, item_id, price_at_purchase, purchased_at) VALUES (?, ?, ?, NOW())",
      [req.params.userId, itemId, item.price],
    );

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
