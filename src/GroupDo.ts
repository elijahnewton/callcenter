import { DurableObject } from "cloudflare:workers";

export interface Env {
  DB: D1Database;
}

interface ContactMemory {
  id: string;
  phone_number: string;
  first_name: string;
  last_name: string;
  status: 'available' | 'locked' | 'completed';
  locked_by: string | null;
  assigned_to: string | null; // NEW: User ID or NULL for shared pool
}

export class GroupDurableObject extends DurableObject<Env> {
  private contacts: Map<string, ContactMemory> = new Map();
  private sockets: Set<WebSocket> = new Set();
  private groupId: string = "";
  private initialized: boolean = false;

  private async ensureInitialized() {
    if (this.initialized) return;
    this.groupId = this.ctx.id.toString();
    
    const results = await this.env.DB.prepare(
      `SELECT id, phone_number, first_name, last_name, status, locked_by, assigned_to 
       FROM contacts WHERE group_id = ? AND status IN ('available', 'locked')`
    ).bind(this.groupId).all<ContactMemory>();

    for (const row of results.results) {
      this.contacts.set(row.id, row);
    }
    this.initialized = true;
  }

  private broadcast(event: string, data: any) {
    const message = JSON.stringify({ event, data });
    for (const ws of this.sockets) {
      if (ws.readyState === WebSocket.READY_STATE_OPEN) {
        ws.send(message);
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    await this.ensureInitialized();

    // Add a reload endpoint to force refresh memory from D1
    if (request.method === "POST" && url.pathname === "/reload") {
      this.initialized = false;
      await this.ensureInitialized();
      return Response.json({ success: true, queueSize: this.contacts.size });
    }

    if (url.pathname === "/ws") {
      const [client, server] = Object.values(new WebSocketPair());
      server.accept();
      this.sockets.add(server);
      server.addEventListener("close", () => this.sockets.delete(server));
      server.send(JSON.stringify({ event: "init", data: { queueSize: this.contacts.size } }));
      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.method === "POST" && url.pathname === "/lock-next") {
      const { callerId } = await request.json();
      return this.lockNextContact(callerId);
    }

    if (request.method === "POST" && url.pathname === "/complete") {
      const { contactId, callerId, disposition, notes } = await request.json();
      return this.completeContact(contactId, callerId, disposition, notes);
    }

    if (request.method === "POST" && url.pathname === "/release") {
      const { contactId } = await request.json();
      return this.releaseContact(contactId);
    }

    return new Response("Not found", { status: 404 });
  }

  private async lockNextContact(callerId: string): Promise<Response> {
    for (const [id, contact] of this.contacts.entries()) {
      // CORE LOGIC UPDATE: 
      // Available AND (Assigned to THIS caller specifically OR Unassigned to anyone [Shared Pool])
      if (
        contact.status === 'available' && 
        (contact.assigned_to === null || contact.assigned_to === callerId)
      ) {
        contact.status = 'locked';
        contact.locked_by = callerId;

        this.ctx.blockWaitUntil(
          this.env.DB.prepare(`UPDATE contacts SET status = 'locked', locked_by = ?, locked_at = datetime('now') WHERE id = ?`)
            .bind(callerId, id).run()
        );

        this.broadcast("contact_locked", { contactId: id, callerId });
        return Response.json({ success: true, contact });
      }
    }
    return Response.json({ success: false, message: "No available contacts assigned to you" });
  }

  private async completeContact(contactId: string, callerId: string, disposition: string, notes: string): Promise<Response> {
    const contact = this.contacts.get(contactId);
    if (!contact || contact.locked_by !== callerId) {
      return Response.json({ success: false, error: "Unauthorized" }, { status: 403 });
    }

    contact.status = 'completed';
    this.contacts.delete(contactId);

    this.ctx.blockWaitUntil(
      this.env.DB.batch([
        this.env.DB.prepare(`UPDATE contacts SET status = 'completed' WHERE id = ?`).bind(contactId),
        this.env.DB.prepare(`INSERT INTO call_logs (id, group_id, contact_id, caller_id, disposition, notes) VALUES (?, ?, ?, ?, ?, ?)`)
          .bind(crypto.randomUUID(), this.groupId, contactId, callerId, disposition, notes)
      ])
    );

    this.broadcast("call_completed", { contactId, callerId, disposition });
    return Response.json({ success: true });
  }

  private async releaseContact(contactId: string): Promise<Response> {
    const contact = this.contacts.get(contactId);
    if (contact && contact.status === 'locked') {
      contact.status = 'available';
      contact.locked_by = null;
      this.ctx.blockWaitUntil(
        this.env.DB.prepare(`UPDATE contacts SET status = 'available', locked_by = NULL WHERE id = ?`).bind(contactId).run()
      );
    }
    return Response.json({ success: true });
  }
}