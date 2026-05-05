/* /lib/mysql.js */
import mysql2 from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const access = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
};

const mysqlConnectionPool = mysql2.createPool(access);

export default mysqlConnectionPool;
