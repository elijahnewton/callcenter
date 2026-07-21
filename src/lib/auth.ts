import { verifyToken } from "@clerk/backend";
import type { JwtPayload } from "@clerk/backend";

export async function authenticateRequest(req: Request, publicKey: string): Promise<JwtPayload | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  
  const token = authHeader.replace("Bearer ", "");
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