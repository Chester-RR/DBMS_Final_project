// app.js
import express from "express";
import mysqlConnectionPool from "./lib/mysql.js";

import loginRoutes from "./features/login.js"; 
// === 新增：匯入通知功能路由 ===
import notificationRoutes from "./features/notification.js"; 

const app = express();

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*"); 
  res.setHeader("Access-Control-Allow-Headers", "*");
  // 如果有用到 PUT, DELETE 方法，記得加上 Allow-Methods
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE");
  next();
});

app.use("/user", loginRoutes); 
// === 新增：掛載通知的 API ===
app.use("/api/notifications", notificationRoutes);

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`); 
  next(); 
});

app.get("/ping", (req, res) => {
  return res.send("<h1>Pong!</h1>");
});

app.listen(3000, () => {
  console.log("Server starts at port 3000");
});