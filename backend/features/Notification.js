// features/notification.js
import express from "express";

const router = express.Router();

// 假資料：模擬資料庫中的通知紀錄
let mockNotifications = [
  {
    id: "n1",
    type: "SYSTEM",
    title: "⏰ 靈力已恢復",
    content: "你今天的 AI 詠唱額度與金幣上限已經重置，快來繼續切換模式吧！",
    isRead: false,
    createdAt: "10 分鐘前",
  },
  {
    id: "n2",
    type: "LIKE",
    title: "👍 有人懂你的幽默！",
    content: "有道友對你的置頂亂語「在凌晨三點，一位工程師...」按了讚！",
    isRead: false,
    createdAt: "2 小時前",
  },
  {
    id: "n3",
    type: "ACHIEVEMENT",
    title: "🏆 修仙突破：元嬰期詠唱者！",
    content: "你已經累計生成了 100 句幹話，獲得 500 枚金幣獎勵！",
    isRead: true,
    createdAt: "1 天前",
  }
];

// GET: 取得使用者的通知列表
router.get("/", (req, res) => {
  // 實務上這裡會加上驗證 (JWT / Session) 來判斷是哪個 User
  res.json({
    success: true,
    data: mockNotifications
  });
});

// PATCH: 將單一通知標記為已讀
router.patch("/:id/read", (req, res) => {
  const { id } = req.params;
  const target = mockNotifications.find(n => n.id === id);
  if (target) {
    target.isRead = true;
    res.json({ success: true, message: "標記已讀成功" });
  } else {
    res.status(404).json({ success: false, message: "找不到該通知" });
  }
});

// PATCH: 全部標記為已讀
router.patch("/read-all", (req, res) => {
  mockNotifications.forEach(n => n.isRead = true);
  res.json({ success: true, message: "全部標記已讀成功" });
});

export default router;