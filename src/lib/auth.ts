import { verifyToken } from "@clerk/backend";
import type { JwtPayload } from "@clerk/backend";

export async function authenticateRequest(req: Request, publicKey: string): Promise<JwtPayload | null> {
  const authHeader = req.headers.get("Authorization");
  let token: string | null = null;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.replace("Bearer ", "");
  } else {
    // WebSocket upgrades and file-download links (e.g. window.open) can't set
    // custom headers from the browser, so fall back to a ?token= query param.
    token = new URL(req.url).searchParams.get("token");
  }

  if (!token) return null;
  try {
    // Verify JWT natively inside the Worker
    const payload = await verifyToken(token, { publicKey });
    return payload;
  } catch (err) {
    return null;
  }
}

// Utility to ensure user/org exists in D1 (Lazy Sync)
export async function syncUserToD1(db: D1Database, payload: JwtPayload) {
  const userId = payload.sub;
  const orgId = payload.org_id;
  
  if (!orgId) throw new Error("User must belong to an Organization");

  // 1. Ensure Group exists
  await db.prepare(`INSERT OR IGNORE INTO groups (id, name) VALUES (?, ?)`)
    .bind(orgId, payload.org_name || "Unknown Group")
    .run();

  // 2. Ensure User exists with correct role
  const role = payload.org_role === "org:admin" ? "admin" : "caller";
  await db.prepare(`
    INSERT INTO users (id, group_id, name, email, role) 
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET role = excluded.role, name = excluded.name
  `).bind(
    userId, 
    orgId, 
    `${payload.first_name || ""} ${payload.last_name || ""}`.trim(), 
    payload.email || "", 
    role
  ).run();

  return { userId, orgId, role };
}