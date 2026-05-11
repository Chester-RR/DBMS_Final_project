import express from "express";
import mysqlConnectionPool from "../lib/mysql.js";

const router = express.Router();

/*
  GET /shop/avatar-items

  功能：
  取得所有可購買的頭像造型商品

  使用資料表：
  shopitem
*/
router.get("/avatar-items", async (req, res) => {
  try {
    const [items] = await mysqlConnectionPool.query(`
      SELECT
        item_id,
        item_name,
        description,
        item_type,
        price,
        image_url,
        is_available
      FROM shopitem
      WHERE is_available = TRUE
        AND item_type = 'avatar'
      ORDER BY price ASC
    `);

    return res.status(200).json({
      success: true,
      items: items,
    });
  } catch (error) {
    console.error("取得頭像商品失敗：", error);

    return res.status(500).json({
      success: false,
      message: "取得頭像商品失敗",
      error: error.message,
    });
  }
});

/*
  GET /shop/user/:userId/avatar-items

  功能：
  取得某位使用者已購買的頭像造型

  使用資料表：
  useritem
  shopitem
*/
router.get("/user/:userId/avatar-items", async (req, res) => {
  try {
    const userId = req.params.userId;

    const [items] = await mysqlConnectionPool.query(
      `
      SELECT
        ui.user_item_id,
        ui.user_id,
        ui.item_id,
        ui.purchased_at,
        ui.is_equipped,

        si.item_name,
        si.description,
        si.item_type,
        si.price,
        si.image_url
      FROM useritem ui
      JOIN shopitem si
        ON ui.item_id = si.item_id
      WHERE ui.user_id = ?
        AND si.item_type = 'avatar'
      ORDER BY ui.purchased_at DESC
      `,
      [userId],
    );

    return res.status(200).json({
      success: true,
      items: items,
    });
  } catch (error) {
    console.error("取得使用者頭像造型失敗：", error);

    return res.status(500).json({
      success: false,
      message: "取得使用者頭像造型失敗",
      error: error.message,
    });
  }
});

/*
  GET /shop/user/:userId/coin

  功能：
  取得使用者目前金幣數量

  使用資料表：
  user
*/
router.get("/user/:userId/coin", async (req, res) => {
  try {
    const userId = req.params.userId;

    const [users] = await mysqlConnectionPool.query(
      `
      SELECT
        user_id,
        user_name,
        coin_balance
      FROM user
      WHERE user_id = ?
      `,
      [userId],
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "找不到使用者",
      });
    }

    return res.status(200).json({
      success: true,
      user: users[0],
    });
  } catch (error) {
    console.error("取得使用者金幣失敗：", error);

    return res.status(500).json({
      success: false,
      message: "取得使用者金幣失敗",
      error: error.message,
    });
  }
});

/*
  POST /shop/purchase-avatar

  功能：
  使用金幣購買頭像造型

  前端 body：
  {
    "user_id": 1,
    "item_id": 2
  }

  使用資料表：
  user
  shopitem
  useritem
  purchaserecord
*/
router.post("/purchase-avatar", async (req, res) => {
  const connection = await mysqlConnectionPool.getConnection();

  try {
    const userId = req.body.user_id;
    const itemId = req.body.item_id;

    if (!userId || !itemId) {
      return res.status(400).json({
        success: false,
        message: "缺少 user_id 或 item_id",
      });
    }

    await connection.beginTransaction();

    /*
      1. 查使用者金幣
      FOR UPDATE 可以避免同時購買造成金幣計算錯亂
    */
    const [users] = await connection.query(
      `
      SELECT
        user_id,
        user_name,
        coin_balance
      FROM user
      WHERE user_id = ?
      FOR UPDATE
      `,
      [userId],
    );

    if (users.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "找不到使用者",
      });
    }

    const user = users[0];

    /*
      2. 查商品是否存在、是否為 avatar、是否上架
    */
    const [items] = await connection.query(
      `
      SELECT
        item_id,
        item_name,
        item_type,
        price,
        image_url,
        is_available
      FROM shopitem
      WHERE item_id = ?
        AND item_type = 'avatar'
      `,
      [itemId],
    );

    if (items.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "找不到此頭像造型",
      });
    }

    const item = items[0];

    if (!item.is_available) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message: "此頭像造型目前未上架",
      });
    }

    /*
      3. 檢查是否已經買過
    */
    const [ownedItems] = await connection.query(
      `
      SELECT user_item_id
      FROM useritem
      WHERE user_id = ?
        AND item_id = ?
      `,
      [userId, itemId],
    );

    if (ownedItems.length > 0) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message: "你已經擁有這個頭像造型",
      });
    }

    /*
      4. 檢查金幣是否足夠
    */
    if (user.coin_balance < item.price) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message: "金幣不足，無法購買",
      });
    }

    /*
      5. 扣除使用者金幣
    */
    await connection.query(
      `
      UPDATE user
      SET coin_balance = coin_balance - ?
      WHERE user_id = ?
      `,
      [item.price, userId],
    );

    /*
      6. 新增 useritem
      代表使用者已擁有這個頭像造型
    */
    await connection.query(
      `
      INSERT INTO useritem (
        user_id,
        item_id,
        purchased_at,
        is_equipped
      )
      VALUES (?, ?, NOW(), FALSE)
      `,
      [userId, itemId],
    );

    /*
      7. 新增 purchaserecord
      紀錄購買行為與購買當下價格
    */
    await connection.query(
      `
      INSERT INTO purchaserecord (
        user_id,
        item_id,
        price_at_purchase,
        purchased_at
      )
      VALUES (?, ?, ?, NOW())
      `,
      [userId, itemId, item.price],
    );

    const remainingCoin = user.coin_balance - item.price;

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: "購買頭像造型成功",
      item_name: item.item_name,
      remaining_coin: remainingCoin,
    });
  } catch (error) {
    await connection.rollback();

    console.error("購買頭像造型失敗：", error);

    return res.status(500).json({
      success: false,
      message: "購買頭像造型失敗",
      error: error.message,
    });
  } finally {
    connection.release();
  }
});

/*
  POST /shop/equip-avatar

  功能：
  裝備已購買的頭像造型

  前端 body：
  {
    "user_id": 1,
    "item_id": 2
  }

  使用資料表：
  useritem
  shopitem
*/
router.post("/equip-avatar", async (req, res) => {
  const connection = await mysqlConnectionPool.getConnection();

  try {
    const userId = req.body.user_id;
    const itemId = req.body.item_id;

    if (!userId || !itemId) {
      return res.status(400).json({
        success: false,
        message: "缺少 user_id 或 item_id",
      });
    }

    await connection.beginTransaction();

    /*
      1. 確認使用者真的擁有這個 avatar 商品
    */
    const [ownedItems] = await connection.query(
      `
      SELECT
        ui.user_item_id
      FROM useritem ui
      JOIN shopitem si
        ON ui.item_id = si.item_id
      WHERE ui.user_id = ?
        AND ui.item_id = ?
        AND si.item_type = 'avatar'
      `,
      [userId, itemId],
    );

    if (ownedItems.length === 0) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message: "你尚未擁有此頭像造型",
      });
    }

    /*
      2. 先取消這個使用者所有 avatar 的裝備狀態
      確保同一時間只有一個頭像造型被裝備
    */
    await connection.query(
      `
      UPDATE useritem ui
      JOIN shopitem si
        ON ui.item_id = si.item_id
      SET ui.is_equipped = FALSE
      WHERE ui.user_id = ?
        AND si.item_type = 'avatar'
      `,
      [userId],
    );

    /*
      3. 裝備指定頭像
    */
    await connection.query(
      `
      UPDATE useritem
      SET is_equipped = TRUE
      WHERE user_id = ?
        AND item_id = ?
      `,
      [userId, itemId],
    );

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: "頭像造型已裝備",
    });
  } catch (error) {
    await connection.rollback();

    console.error("裝備頭像造型失敗：", error);

    return res.status(500).json({
      success: false,
      message: "裝備頭像造型失敗",
      error: error.message,
    });
  } finally {
    connection.release();
  }
});

export default router;