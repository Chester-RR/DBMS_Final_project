# DBMS_Final_project

資料庫管理期末專案

# DBMS_Final_project

資料庫管理期末專案。

本專案包含：

DBMS_Final_project
├── backend # 後端 Express + MySQL
├── frontend # 前端 HTML 頁面
├── .gitignore
└── README.md

---

## 一、下載專案

```bash
git clone https://github.com/Chester-RR/DBMS_Final_project.git
cd DBMS_Final_project
```

---

## 二、安裝後端套件

進入後端資料夾：

```bash
cd backend
```

安裝套件：

```bash
pnpm install
```

如果沒有安裝 pnpm，可以先安裝：

```bash
npm install -g pnpm
```

---

## 三、設定資料庫連線

因為每個人的 MySQL 帳號、密碼、資料庫名稱都可能不同，所以真正的 `.env` 不會上傳到 GitHub。

專案裡面只會放一份範例檔案：

```text
backend/.env.example
```

請在 `backend` 資料夾裡複製一份 `.env.example`，並命名成 `.env`：

```bash
cp .env.example .env
```

接著打開 `backend/.env`，改成自己的 MySQL 設定。

範例：

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=你的資料庫密碼
DB_NAME=你的資料庫名稱
```

說明：

```text
DB_HOST      資料庫主機位置，本機通常是 127.0.0.1 或 localhost
DB_PORT      MySQL 連接埠，預設通常是 3306
DB_USER      MySQL 使用者名稱
DB_PASSWORD  MySQL 密碼
DB_NAME      要連接的資料庫名稱
```

注意：  
`.env` 裡面會放自己的資料庫密碼，所以不要把 `.env` push 到 GitHub。

---

## 四、建立資料庫

請先確認自己的 MySQL Server 已經啟動。

並確定
DB_HOST  
DB_PORT  
DB_USER  
DB_PASSWORD  
DB_NAME  
都和你設定的相同

---

## 五、測試資料庫連線

在 `backend` 資料夾底下執行：

```bash
node -e "import('./lib/mysql.js').then(async ({ default: db }) => { const [rows] = await db.query('SELECT 1 AS ok'); console.log(rows); await db.end(); }).catch(err => { console.error(err); process.exit(1); })"
```

如果成功，會看到：

```bash
[ { ok: 1 } ]
```

代表：

```text
dotenv 可以正常讀取 .env
mysql.js 可以正常建立連線
MySQL 帳號密碼正確
資料庫可以成功連接
```

---

## 六、建立table

如果需要建立專案用的資料表，可以在 `backend` 資料夾底下執行：

```bash
node sql/createTable.js
```

注意：  
執行前請先確認 `createTable.js` 裡面的 SQL 是你要建立的資料表內容。

---

## 七、啟動後端伺服器

在 `backend` 資料夾底下執行：

```bash
node app.js
```

如果有設定 scripts，也可以使用：

```bash
pnpm start
```

後端啟動後，前端就可以透過 API 路由和後端互動。

---

## 八、前端檔案

前端檔案放在：

```text
frontend
```

目前主要頁面包含：

```text
forum.html
fruitNinja.html
interface.html
login.html
```

可以直接用 VS Code 的 Live Server 開啟前端頁面。

---

## 九、常見錯誤

### 1. Access denied for user

代表 MySQL 使用者名稱或密碼錯誤。

請檢查：

```env
DB_USER=
DB_PASSWORD=
```

---

### 2. Unknown database

代表 `.env` 裡面的資料庫名稱不存在。

請檢查：

```env
DB_NAME=
```

或先建立資料庫：

```sql
CREATE DATABASE 你的資料庫名稱;
```

---

### 3. ECONNREFUSED

代表 MySQL 沒有啟動，或是主機 / port 設定錯誤。

請檢查：

```env
DB_HOST=
DB_PORT=
```

---

### 4. Cannot find package 'dotenv'

代表後端套件沒有安裝成功。

請在 `backend` 裡重新執行：

```bash
pnpm install
```

---

## 十、Git 注意事項

以下檔案不應該 push 到 GitHub：

```text
.env
node_modules
.DS_Store
```

可以 push 的範例環境檔是：

```text
.env.example
```

如果要確認 `.env` 是否被 Git 忽略，可以在專案最外層執行：

```bash
git check-ignore -v backend/.env
```

如果有顯示 `.gitignore` 規則，代表 `.env` 不會被上傳。
