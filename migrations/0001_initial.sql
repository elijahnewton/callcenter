CREATE TABLE groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'caller')),
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE contacts (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    status TEXT DEFAULT 'available' CHECK (status IN ('available', 'locked', 'completed')),
    locked_by TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
