import { Hono } from "hono";
import { cors } from "hono/cors";
import * as XLSX from "xlsx";
export { GroupDurableObject } from "./GroupDo";
import { authenticateRequest, syncUserToD1 } from "./lib/auth";

type Bindings = {
  DB: D1Database;
  GROUP_DO: DurableObjectNamespace<GroupDurableObject>;
  CLERK_PEM_PUBLIC_KEY: string;
  ASSETS: Fetcher; 
};

const app = new Hono<{ Bindings: Bindings }>();
app.use("*", cors());

// --- MIDDLEWARE TO PROTECT API ROUTES ---
app.use("/api/*", async (c, next) => {
  try {
    // If the key is missing in production, fail gracefully instead of crashing
    if (!c.env.CLERK_PEM_PUBLIC_KEY) {
      return c.json({ error: "Server configuration error: Missing Clerk Key" }, 500);
    }

    const payload = await authenticateRequest(c.req.raw, c.env.CLERK_PEM_PUBLIC_KEY);
    if (!payload) return c.json({ error: "Unauthorized" }, 401);
    
    const userContext = await syncUserToD1(c.env.DB, payload);
    c.set("user", userContext);
    await next();
  } catch (err) {
    // Catch any JWT parsing errors so the worker doesn't 500
    console.error("Auth Middleware Error:", err);
    return c.json({ error: "Authentication failed", details: String(err) }, 401);
  }
});

// --- UPLOAD CONTACTS (Admin Only) ---
app.post("/api/contacts/upload", async (c) => {
  const user = c.get("user");
  if (user.role !== "admin") return c.json({ error: "Forbidden: Admins only" }, 403);

  const formData = await c.req.formData();
  const file = formData.get("file") as File;
  if (!file) return c.json({ error: "No file provided" }, 400);

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets[workbook.SheetNames[0]]);

  const stmt = c.env.DB.prepare(
    `INSERT INTO contacts (id, group_id, phone_number, first_name, last_name, metadata) VALUES (?, ?, ?, ?, ?, ?)`
  );

  const batch = [];
  for (const row of rows.slice(0, 10000)) {
    const phone = String(row["phone"] || row["Phone"] || "").replace(/[^+\d]/g, "");
    if (!phone) continue;

    batch.push(stmt.bind(
      crypto.randomUUID(),
      user.orgId,
      phone,
      row["first_name"] || row["First Name"] || "",
      row["last_name"] || row["Last Name"] || "",
      JSON.stringify(row) // Store raw metadata
    ));
  }

  if (batch.length === 0) return c.json({ error: "No valid contacts found in file" }, 400);

  await c.env.DB.batch(batch);

  // Wake up the DO and force it to reload state to include new contacts
  const doStub = c.env.GROUP_DO.get(c.env.GROUP_DO.idFromName(user.orgId));
  c.executionCtx.waitUntil(doStub.fetch("http://internal/reload", { method: "POST" }));

  return c.json({ success: true, imported: batch.length });
});

// --- GET NEXT CONTACT (Callers) ---
app.post("/api/contacts/next", async (c) => {
  const user = c.get("user");
  const doStub = c.env.GROUP_DO.get(c.env.GROUP_DO.idFromName(user.orgId));

  const response = await doStub.fetch("http://internal/lock-next", {
    method: "POST",
    body: JSON.stringify({ callerId: user.userId }),
    headers: { "Content-Type": "application/json" }
  });

  return new Response(response.body, { status: response.status });
});

// --- LOG CALL (Callers) ---
app.post("/api/calls/log", async (c) => {
  const user = c.get("user");
  const { contact_id, disposition, notes } = await c.req.json();
  const doStub = c.env.GROUP_DO.get(c.env.GROUP_DO.idFromName(user.orgId));

  const response = await doStub.fetch("http://internal/complete", {
    method: "POST",
    body: JSON.stringify({ contactId: contact_id, callerId: user.userId, disposition, notes }),
    headers: { "Content-Type": "application/json" }
  });

  return new Response(response.body, { status: response.status });
});

// --- EXPORT REPORT (Admins) ---
app.get("/api/reports/export", async (c) => {
  const user = c.get("user");
  if (user.role !== "admin") return c.json({ error: "Forbidden" }, 403);

  const logs = await c.env.DB.prepare(`
    SELECT u.name as caller_name, c.first_name, c.last_name, c.phone_number, 
           cl.disposition, cl.notes, cl.called_at
    FROM call_logs cl
    JOIN contacts c ON cl.contact_id = c.id
    JOIN users u ON cl.caller_id = u.id
    WHERE cl.group_id = ?
    ORDER BY cl.called_at DESC
  `).bind(user.orgId).all();

  const worksheet = XLSX.utils.json_to_sheet(logs);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Report");
  
  const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="report-${user.orgId}.xlsx"`
    }
  });
});

// --- WEBSOCKET ENDPOINT FOR ADMIN DASHBOARD ---
app.get("/api/dashboard/ws", async (c) => {
  const user = c.get("user");
  if (user.role !== "admin") return c.json({ error: "Forbidden" }, 403);
  
  const doStub = c.env.GROUP_DO.get(c.env.GROUP_DO.idFromName(user.orgId));
  
  // Change the URL to match the DO internal routing
  const newUrl = new URL(c.req.url);
  newUrl.pathname = "/ws";
  
  return doStub.fetch(newUrl.toString(), {
    headers: { "Upgrade": "websocket" }
  });
});

// --- MANUAL ASSIGNMENT ---
// Admin selects contacts in UI, picks a caller, and hits "Assign"
app.post("/api/contacts/assign", async (c) => {
  const user = c.get("user");
  if (user.role !== "admin") return c.json({ error: "Forbidden" }, 403);

  const { contact_ids, caller_id } = await c.req.json(); 
  // caller_id can be a user ID, or null to push back to shared pool

  if (!Array.isArray(contact_ids) || contact_ids.length === 0) {
    return c.json({ error: "Provide contact_ids array" }, 400);
  }

  const stmt = c.env.DB.prepare(`UPDATE contacts SET assigned_to = ? WHERE id = ? AND group_id = ?`);
  const batch = contact_ids.map((id: string) => stmt.bind(caller_id, id, user.orgId));
  
  await c.env.DB.batch(batch);

  // Wake up DO to reload newly assigned contacts into memory
  const doStub = c.env.GROUP_DO.get(c.env.GROUP_DO.idFromName(user.orgId));
  c.executionCtx.waitUntil(doStub.fetch("http://internal/reload", { method: "POST" }));

  return c.json({ success: true, assigned: contact_ids.length, to_caller: caller_id || "Shared Pool" });
});

// --- AUTO-DISTRIBUTE EVENLY ---
// Admin clicks "Distribute Evenly" and passes an array of caller IDs
app.post("/api/contacts/distribute-evenly", async (c) => {
  const user = c.get("user");
  if (user.role !== "admin") return c.json({ error: "Forbidden" }, 403);

  const { caller_ids } = await c.req.json(); // e.g., ["user_1", "user_2", "user_3"]

  if (!Array.isArray(caller_ids) || caller_ids.length === 0) {
    return c.json({ error: "Provide caller_ids array to distribute to" }, 400);
  }

  // 1. Get all unassigned/available contacts for this group
  const availableContacts = await c.env.DB.prepare(
    `SELECT id FROM contacts WHERE group_id = ? AND status = 'available' AND assigned_to IS NULL`
  ).bind(user.orgId).all<{ id: string }>();

  if (availableContacts.length === 0) {
    return c.json({ success: true, message: "No unassigned available contacts to distribute" });
  }

  // 2. Chunk them evenly
  const chunks = caller_ids.map(() => [] as string[]);
  availableContacts.results.forEach((contact, index) => {
    chunks[index % caller_ids.length].push(contact.id);
  });

  // 3. Build batch update statements
  const stmt = c.env.DB.prepare(`UPDATE contacts SET assigned_to = ? WHERE id = ?`);
  const batch = [];
  
  caller_ids.forEach((callerId: string, index) => {
    chunks[index].forEach((contactId) => {
      batch.push(stmt.bind(callerId, contactId));
    });
  });

  await c.env.DB.batch(batch);

  // 4. Reload DO
  const doStub = c.env.GROUP_DO.get(c.env.GROUP_DO.idFromName(user.orgId));
  c.executionCtx.waitUntil(doStub.fetch("http://internal/reload", { method: "POST" }));

  const summary = caller_ids.map((id: string, i: number) => ({ caller_id: id, count: chunks[i].length }));
  return c.json({ success: true, distributed: availableContacts.length, summary });
});

// --- SERVE REACT STATIC ASSETS ---
app.notFound(async (c) => {
  try {
    const url = new URL(c.req.url);
    
    // Cloudflare internal routes (monitoring, etc.) should 404 normally, not hit assets
    if (url.pathname.startsWith('/__') || url.pathname.startsWith('/cdn-cgi')) {
      return c.notFound();
    }
    
    // Fetch the static file (React app)
    const assetResponse = await c.env.ASSETS.fetch(c.req.raw);
    
    // If ASSETS returns a 404, it means a React route was hit, so serve index.html
    if (assetResponse.status === 404) {
      // Clone the request but force the URL to /index.html
      const indexRequest = new Request(new URL('/index.html', c.req.url).href, c.req.raw);
      return await c.env.ASSETS.fetch(indexRequest);
    }
    
    return assetResponse;
  } catch (err) {
    console.error("Asset Serving Error:", err);
    return c.text("Error loading application assets: " + String(err), 500);
  }
});

export default app;