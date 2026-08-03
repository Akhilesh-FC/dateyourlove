-- Migration: Add superlike support and free-user like limits

ALTER TABLE user_likes
  MODIFY status ENUM('like','unlike','superlike') NOT NULL;

CREATE TABLE IF NOT EXISTS like_limits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type VARCHAR(50) NOT NULL UNIQUE,
  max_daily_likes INT NOT NULL DEFAULT 3,
  max_daily_superlikes INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO like_limits (type, max_daily_likes, max_daily_superlikes)
VALUES ('free_user', 3, 1)
ON DUPLICATE KEY UPDATE
  max_daily_likes = VALUES(max_daily_likes),
  max_daily_superlikes = VALUES(max_daily_superlikes),
  updated_at = NOW();
