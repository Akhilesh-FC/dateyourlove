CREATE TABLE IF NOT EXISTS video_call_sessions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  call_uuid VARCHAR(100) NOT NULL UNIQUE,
  caller_id INT NOT NULL,
  callee_id INT NOT NULL,
  channel_name VARCHAR(200) NOT NULL,
  status ENUM('ringing','accepted','declined','busy','ended','missed') NOT NULL DEFAULT 'ringing',
  started_at DATETIME DEFAULT NULL,
  ended_at DATETIME DEFAULT NULL,
  duration_seconds INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
