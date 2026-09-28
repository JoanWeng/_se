-- 001_init.sql — 校務系統 MVP 初始 schema
--
-- 與 專案架構.md 的差異都寫在這裡，改 schema 前請先讀：
--
--  1. users.role 刻意「不」加 CHECK 約束。日後要加家長等角色不必改 schema，
--     合法性改由應用層的 zod enum（lib/roles.ts）驗證。
--  2. 軟刪除（deleted_at / is_active）與唯一約束的衝突，用「部分索引」
--     (partial index) 解決：只有還沒被刪的列才參與唯一性檢查。
--  3. 所有 foreign key 欄位都手動建索引 —— SQLite 不會自動替 FK 建索引，
--     忘了建就會在 JOIN / WHERE 上全表掃描。
--  4. 全部使用 STRICT：欄位型別錯了會在寫入時直接報錯，而不是默默塞值進去。
--  5. 時間欄位一律存 ISO-8601 UTC 字串（TEXT），統一格式避免時區歧義。
--  6. 建表順序遵守 FK 依賴：users → teachers/students → semesters → classes
--     → courses → enrollments → grades。

-- ------------------------------------------------------------------ users

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL,
  name          TEXT NOT NULL,
  email         TEXT,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL,
  is_active     INTEGER NOT NULL DEFAULT 1,
  -- token_version：改密碼或停用帳號時 +1，讓已發出的 JWT 立即失效
  token_version INTEGER NOT NULL DEFAULT 0,
  deleted_at    TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT
) STRICT;

CREATE UNIQUE INDEX idx_users_username_alive
  ON users (username) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_users_email_alive
  ON users (email) WHERE deleted_at IS NULL AND email IS NOT NULL;

-- 可撤銷的 server-side session。id 存的是 token 的 SHA-256，
-- 資料庫外洩也無法直接拿去冒用。
CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users (id),
  user_agent TEXT,
  ip         TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL,
  revoked_at TEXT
) STRICT;

CREATE INDEX idx_sessions_user ON sessions (user_id);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);

-- -------------------------------------------------------------- semesters
-- is_current 用「部分唯一索引」保證全庫最多只有一筆為 1，
-- 單純用 boolean 欄位是約束不住的。

CREATE TABLE semesters (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 0,
  start_date TEXT NOT NULL,
  end_date   TEXT NOT NULL
) STRICT;

CREATE UNIQUE INDEX idx_semesters_single_current
  ON semesters (is_current) WHERE is_current = 1;

-- ---------------------------------------------------------------- teachers

CREATE TABLE teachers (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   INTEGER NOT NULL REFERENCES users (id),
  phone     TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
) STRICT;

CREATE UNIQUE INDEX idx_teachers_user ON teachers (user_id);

-- ----------------------------------------------------------------- classes

CREATE TABLE classes (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  name                TEXT NOT NULL,
  year                TEXT NOT NULL,
  homeroom_teacher_id INTEGER REFERENCES teachers (id)
) STRICT;

CREATE INDEX idx_classes_homeroom ON classes (homeroom_teacher_id);

-- ---------------------------------------------------------------- students
-- 學生用 is_active 停用、user 帳號用 deleted_at 軟刪除，兩者刻意分開：
-- 停讀學生不等於要刪掉登入帳號，反之亦然。

CREATE TABLE students (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id             INTEGER NOT NULL REFERENCES users (id),
  student_no          TEXT NOT NULL,
  birth_date          TEXT,
  phone               TEXT,
  emergency_contact   TEXT,
  class_id            INTEGER REFERENCES classes (id),
  is_active           INTEGER NOT NULL DEFAULT 1
) STRICT;

-- 學號不回收：停用後的學生仍佔用學號，避免日後查資料時撞號
CREATE UNIQUE INDEX idx_students_no ON students (student_no);
CREATE UNIQUE INDEX idx_students_user ON students (user_id);
CREATE INDEX idx_students_class ON students (class_id);

-- ----------------------------------------------------------------- courses
-- 一筆 course 代表「某學期开的某一门课」。所以 enrollments 不需要
-- semester_id —— 學期一律 join courses 取得，重修會是另一筆 course。

CREATE TABLE courses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  teacher_id  INTEGER NOT NULL REFERENCES teachers (id),
  class_id    INTEGER NOT NULL REFERENCES classes (id),
  schedule    TEXT,
  semester_id INTEGER NOT NULL REFERENCES semesters (id)
) STRICT;

CREATE INDEX idx_courses_teacher ON courses (teacher_id);
CREATE INDEX idx_courses_class ON courses (class_id);
CREATE INDEX idx_courses_semester ON courses (semester_id);

CREATE TABLE enrollments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students (id),
  course_id  INTEGER NOT NULL REFERENCES courses (id)
) STRICT;

CREATE UNIQUE INDEX idx_enrollments_unique
  ON enrollments (student_id, course_id);
CREATE INDEX idx_enrollments_course ON enrollments (course_id);

-- ------------------------------------------------------------------ grades
-- 唯一鍵擋掉重複登錄；updated_by / updated_at 讓「誰在什麼時候改的」
-- 不必去翻 audit_logs 也能直接看到。

CREATE TABLE grades (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id  INTEGER NOT NULL REFERENCES students (id),
  course_id   INTEGER NOT NULL REFERENCES courses (id),
  semester_id INTEGER NOT NULL REFERENCES semesters (id),
  score       REAL,
  comment     TEXT,
  updated_by  INTEGER REFERENCES users (id),
  updated_at  TEXT,
  CONSTRAINT grades_score_range CHECK (score IS NULL OR (score >= 0 AND score <= 100))
) STRICT;

CREATE UNIQUE INDEX idx_grades_unique
  ON grades (student_id, course_id, semester_id);
CREATE INDEX idx_grades_course ON grades (course_id);
CREATE INDEX idx_grades_semester ON grades (semester_id);

-- ----------------------------------------------------------- announcements
-- target_class_id 為 NULL 代表全校；teacher 只能發給自己班級。

CREATE TABLE announcements (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT NOT NULL,
  content         TEXT NOT NULL,
  target_class_id INTEGER REFERENCES classes (id),
  created_by      INTEGER NOT NULL REFERENCES users (id),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX idx_announcements_class ON announcements (target_class_id);
CREATE INDEX idx_announcements_created_at ON announcements (created_at);

CREATE TABLE announcement_reads (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  announcement_id INTEGER NOT NULL REFERENCES announcements (id),
  user_id         INTEGER NOT NULL REFERENCES users (id),
  read_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE UNIQUE INDEX idx_announcement_reads_unique
  ON announcement_reads (announcement_id, user_id);
CREATE INDEX idx_announcement_reads_user ON announcement_reads (user_id);

-- -------------------------------------------------------------- audit_logs
-- 全系統共用的通用稽核表。target_id 用 TEXT 因為不同資料表的 id 語意不同，
-- 統一存字串最省事。

CREATE TABLE audit_logs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER REFERENCES users (id),
  action       TEXT NOT NULL,
  target_table TEXT NOT NULL,
  target_id    TEXT,
  detail       TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX idx_audit_user ON audit_logs (user_id);
CREATE INDEX idx_audit_target ON audit_logs (target_table, target_id);
CREATE INDEX idx_audit_created_at ON audit_logs (created_at);
