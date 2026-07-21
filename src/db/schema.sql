CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT CHECK(role IN ('caller', 'admin')) NOT NULL DEFAULT 'caller',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    status TEXT CHECK(status IN ('available', 'locked', 'completed', 'do_not_call')) NOT NULL DEFAULT 'available',
    locked_by TEXT,
    locked_at DATETIME,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    FOREIGN KEY (locked_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS call_logs (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    contact_id TEXT NOT NULL,
    caller_id TEXT NOT NULL,
    disposition TEXT NOT NULL,
    notes TEXT,
    called_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    FOREIGN KEY (caller_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_contacts_group_status ON contacts(group_id, status);
CREATE INDEX IF NOT EXISTS idx_call_logs_group ON call_logs(group_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_caller ON call_logs(caller_id);