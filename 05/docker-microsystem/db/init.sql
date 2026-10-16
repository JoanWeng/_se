-- Demo 資料表 (PostgreSQL)
CREATE TABLE IF NOT EXISTS visits (
  id SERIAL PRIMARY KEY,
  service TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO visits (service) VALUES ('system-init'), ('nginx'), ('api-node');
