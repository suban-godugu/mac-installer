export const MIGRATIONS: string[] = [
  `
  CREATE TABLE profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    dir TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_used_at TEXT
  );

  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    stage TEXT NOT NULL,
    profile_id TEXT,
    settings_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE checkpoints (
    task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE tabs (
    tab_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    purpose TEXT NOT NULL,
    url TEXT NOT NULL,
    company_id TEXT,
    status TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (task_id, tab_id)
  );

  CREATE TABLE companies (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    idx INTEGER NOT NULL,
    zoominfo_id TEXT NOT NULL,
    name TEXT NOT NULL,
    website TEXT NOT NULL,
    domain TEXT NOT NULL,
    industry TEXT NOT NULL,
    naics TEXT NOT NULL,
    location TEXT NOT NULL,
    employee_count TEXT NOT NULL,
    technology TEXT NOT NULL,
    description TEXT NOT NULL,
    profile_url TEXT NOT NULL,
    source TEXT NOT NULL,
    status TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    error TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX companies_task ON companies(task_id, idx);
  CREATE UNIQUE INDEX companies_task_key ON companies(task_id, zoominfo_id, name);

  CREATE TABLE employees (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    zoominfo_id TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    department TEXT NOT NULL,
    seniority TEXT NOT NULL,
    email TEXT NOT NULL,
    location TEXT NOT NULL,
    profile_url TEXT NOT NULL,
    source TEXT NOT NULL,
    collected_at TEXT NOT NULL
  );
  CREATE INDEX employees_company ON employees(company_id);
  CREATE INDEX employees_task ON employees(task_id);

  CREATE TABLE evaluations (
    employee_id TEXT PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL,
    relevant INTEGER NOT NULL,
    relevance_score INTEGER NOT NULL,
    priority TEXT NOT NULL,
    reason TEXT NOT NULL,
    components TEXT NOT NULL
  );

  CREATE TABLE activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT,
    ts TEXT NOT NULL,
    level TEXT NOT NULL,
    message TEXT NOT NULL
  );
  CREATE INDEX activity_task ON activity_log(task_id, id);

  CREATE TABLE errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    ts TEXT NOT NULL,
    stage TEXT NOT NULL,
    company_id TEXT,
    kind TEXT NOT NULL,
    message TEXT NOT NULL
  );

  CREATE TABLE exports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    ts TEXT NOT NULL,
    path TEXT NOT NULL,
    rows INTEGER NOT NULL,
    status TEXT NOT NULL,
    message TEXT NOT NULL
  );
  `
]
