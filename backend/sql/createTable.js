//初始化table 的地方  只要執行一次就可以了  啟動前記得drop掉資料庫所有的table
import mysqlConnectionPool from "../lib/mysql.js";

try {
  await mysqlConnectionPool.query(`
  CREATE TABLE IF NOT EXISTS User (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    user_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    admin BOOLEAN NOT NULL DEFAULT FALSE,
    level INT NOT NULL DEFAULT 1,
    coin_balance INT NOT NULL DEFAULT 0,
    generation_count INT NOT NULL DEFAULT 0,
    

    CONSTRAINT chk_user_admin
      CHECK (admin IN (0, 1)),

    CONSTRAINT chk_user_level
      CHECK (level >= 1),

    CONSTRAINT chk_user_coin_balance
      CHECK (coin_balance >= 0),

    CONSTRAINT chk_user_generation_count
      CHECK (generation_count >= 0)
  )
`);
  await mysqlConnectionPool.query(`
    CREATE TABLE IF NOT EXISTS Template (
    template_id INT AUTO_INCREMENT PRIMARY KEY,
    template_name VARCHAR(100) NOT NULL,
    structure TEXT NOT NULL,
    genre VARCHAR(50) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
`);
  await mysqlConnectionPool.query(`
  CREATE TABLE IF NOT EXISTS TemplateBlank (
    blank_id INT AUTO_INCREMENT PRIMARY KEY,
    template_id INT NOT NULL,
    blank_order INT NOT NULL,
    part_of_speech VARCHAR(50) NOT NULL,

    CONSTRAINT fk_templateblank_template
      FOREIGN KEY (template_id) REFERENCES Template(template_id)
      ON DELETE CASCADE
      ON UPDATE CASCADE,

    CONSTRAINT uq_templateblank_order
      UNIQUE (template_id, blank_order),

    CONSTRAINT chk_templateblank_order
      CHECK (blank_order > 0)
  )
`);
  await mysqlConnectionPool.query(`
  CREATE TABLE IF NOT EXISTS Word (
    word_id INT AUTO_INCREMENT PRIMARY KEY,
    word_text VARCHAR(100) NOT NULL,
    part_of_speech VARCHAR(50) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )
`);
  await mysqlConnectionPool.query(`
    CREATE TABLE IF NOT EXISTS Gibberish (
    gibberish_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    template_id INT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    pinned BOOLEAN NOT NULL DEFAULT FALSE,
    is_hidden BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT fk_gibberish_user
    FOREIGN KEY (user_id) REFERENCES User(user_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,

    CONSTRAINT fk_gibberish_template
    FOREIGN KEY (template_id) REFERENCES Template(template_id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

    CONSTRAINT chk_gibberish_pinned
    CHECK (pinned IN (0, 1)),

    CONSTRAINT chk_gibberish_is_hidden
    CHECK (is_hidden IN (0, 1))
    );
`);
  await mysqlConnectionPool.query(`
  CREATE TABLE IF NOT EXISTS Composition (
    composition_id INT AUTO_INCREMENT PRIMARY KEY,
    gibberish_id INT NOT NULL,
    word_id INT NOT NULL,
    word_order INT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_composition_gibberish
      FOREIGN KEY (gibberish_id) REFERENCES Gibberish(gibberish_id)
      ON DELETE CASCADE
      ON UPDATE CASCADE,

    CONSTRAINT fk_composition_word
      FOREIGN KEY (word_id) REFERENCES Word(word_id)
      ON DELETE RESTRICT
      ON UPDATE CASCADE,

    CONSTRAINT uq_composition_word_order
      UNIQUE (gibberish_id, word_order),

    CONSTRAINT chk_composition_word_order
      CHECK (word_order > 0)
  )
`);
  await mysqlConnectionPool.query(`
  CREATE TABLE IF NOT EXISTS Title (
    title_id INT AUTO_INCREMENT PRIMARY KEY,
    title_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    requirement TEXT NOT NULL,
    icon VARCHAR(255),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
  await mysqlConnectionPool.query(`
  CREATE TABLE IF NOT EXISTS TitleAward (
    title_award_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title_id INT NOT NULL,
    earned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_equipped BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT fk_titleaward_user
      FOREIGN KEY (user_id) REFERENCES User(user_id)
      ON DELETE CASCADE
      ON UPDATE CASCADE,

    CONSTRAINT fk_titleaward_title
      FOREIGN KEY (title_id) REFERENCES Title(title_id)
      ON DELETE RESTRICT
      ON UPDATE CASCADE,

    CONSTRAINT uq_titleaward_user_title
      UNIQUE (user_id, title_id),

    CONSTRAINT chk_titleaward_is_equipped
      CHECK (is_equipped IN (0, 1))
  )
`);
  await mysqlConnectionPool.query(`
  CREATE TABLE IF NOT EXISTS AvatarFrame (
    frame_id INT AUTO_INCREMENT PRIMARY KEY,
    frame_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    requirement TEXT NOT NULL,
    unlock_level INT NOT NULL UNIQUE,
    rarity VARCHAR(50) NOT NULL DEFAULT 'common',
    border_color VARCHAR(50) NOT NULL,
    glow_color VARCHAR(100) NOT NULL,
    background_css VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT chk_avatarframe_unlock_level
      CHECK (unlock_level >= 1 AND unlock_level <= 50)
  )
`);
  await mysqlConnectionPool.query(`
  CREATE TABLE IF NOT EXISTS UserAvatarFrame (
    user_frame_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    frame_id INT NOT NULL,
    earned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_equipped BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT fk_useravatarframe_user
      FOREIGN KEY (user_id) REFERENCES User(user_id)
      ON DELETE CASCADE
      ON UPDATE CASCADE,

    CONSTRAINT fk_useravatarframe_frame
      FOREIGN KEY (frame_id) REFERENCES AvatarFrame(frame_id)
      ON DELETE RESTRICT
      ON UPDATE CASCADE,

    CONSTRAINT uq_useravatarframe_user_frame
      UNIQUE (user_id, frame_id),

    CONSTRAINT chk_useravatarframe_is_equipped
      CHECK (is_equipped IN (0, 1))
  )
`);
  await mysqlConnectionPool.query(`
  CREATE TABLE IF NOT EXISTS GibberishLike (
    gibberish_like_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    gibberish_id INT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_gibberishlike_user
      FOREIGN KEY (user_id) REFERENCES User(user_id)
      ON DELETE CASCADE
      ON UPDATE CASCADE,

    CONSTRAINT fk_gibberishlike_gibberish
      FOREIGN KEY (gibberish_id) REFERENCES Gibberish(gibberish_id)
      ON DELETE CASCADE
      ON UPDATE CASCADE,

    CONSTRAINT uq_gibberishlike_user_gibberish
      UNIQUE (user_id, gibberish_id)
  )
`);
  await mysqlConnectionPool.query(`
  CREATE TABLE IF NOT EXISTS GibberishReport (
    report_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    gibberish_id INT NOT NULL,
    reason VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_gibberishreport_user
      FOREIGN KEY (user_id) REFERENCES User(user_id)
      ON DELETE CASCADE
      ON UPDATE CASCADE,

    CONSTRAINT fk_gibberishreport_gibberish
      FOREIGN KEY (gibberish_id) REFERENCES Gibberish(gibberish_id)
      ON DELETE CASCADE
      ON UPDATE CASCADE,

    CONSTRAINT uq_gibberishreport_user_gibberish
      UNIQUE (user_id, gibberish_id),

    CONSTRAINT chk_gibberishreport_reason
      CHECK (reason IN (
        '不適當內容',
        '冒犯或騷擾',
        '垃圾訊息',
        '仇恨或歧視',
        '其他原因'
      )),

    CONSTRAINT chk_gibberishreport_status
      CHECK (status IN ('pending', 'reviewed', 'rejected'))
  )
`);
  await mysqlConnectionPool.query(`
  CREATE TABLE IF NOT EXISTS Notification (
    notification_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    gibberish_id INT NULL,
    gibberish_like_id INT NULL,
    notification_type VARCHAR(50) NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    content TEXT NOT NULL,
    created_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_notification_user
      FOREIGN KEY (user_id) REFERENCES User(user_id)
      ON DELETE CASCADE
      ON UPDATE CASCADE,

    CONSTRAINT fk_notification_gibberish
      FOREIGN KEY (gibberish_id) REFERENCES Gibberish(gibberish_id)
      ON DELETE SET NULL
      ON UPDATE CASCADE,

    CONSTRAINT fk_notification_gibberish_like
      FOREIGN KEY (gibberish_like_id) REFERENCES GibberishLike(gibberish_like_id)
      ON DELETE SET NULL
      ON UPDATE CASCADE,

    CONSTRAINT chk_notification_type
      CHECK (notification_type IN ('system', 'achievement', 'like')),

    CONSTRAINT chk_notification_is_read
      CHECK (is_read IN (0, 1))
  )
`);
  await mysqlConnectionPool.query(`
  CREATE TABLE IF NOT EXISTS ShopItem (
    item_id INT AUTO_INCREMENT PRIMARY KEY,
    item_name VARCHAR(100) NOT NULL,
    description TEXT,
    item_type VARCHAR(50) NOT NULL,
    price INT NOT NULL,
    image_url VARCHAR(255),
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT chk_shopitem_price
      CHECK (price >= 0),

    CONSTRAINT chk_shopitem_is_available
      CHECK (is_available IN (0, 1))
  )
`);
  await mysqlConnectionPool.query(`
  CREATE TABLE IF NOT EXISTS UserItem (
    user_item_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    item_id INT NOT NULL,
    purchased_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_equipped BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT fk_useritem_user
      FOREIGN KEY (user_id) REFERENCES User(user_id)
      ON DELETE CASCADE
      ON UPDATE CASCADE,

    CONSTRAINT fk_useritem_shopitem
      FOREIGN KEY (item_id) REFERENCES ShopItem(item_id)
      ON DELETE RESTRICT
      ON UPDATE CASCADE,

    CONSTRAINT uq_useritem_user_item
      UNIQUE (user_id, item_id),

    CONSTRAINT chk_useritem_is_equipped
      CHECK (is_equipped IN (0, 1))
  )
`);

  await mysqlConnectionPool.query(`
  CREATE TABLE IF NOT EXISTS PurchaseRecord (
    purchase_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    item_id INT NOT NULL,
    price_at_purchase INT NOT NULL,
    purchased_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_purchaserecord_user
      FOREIGN KEY (user_id) REFERENCES User(user_id)
      ON DELETE CASCADE
      ON UPDATE CASCADE,

    CONSTRAINT fk_purchaserecord_shopitem
      FOREIGN KEY (item_id) REFERENCES ShopItem(item_id)
      ON DELETE RESTRICT
      ON UPDATE CASCADE,

    CONSTRAINT chk_purchaserecord_price
      CHECK (price_at_purchase >= 0)
  )
`);
  console.log("tables created successfully.");
} catch (error) {
  console.error("Error creating tables:", error);
} finally {
  await mysqlConnectionPool.end();
}
