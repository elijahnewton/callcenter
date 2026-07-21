☁️ CloudCall: High-Concurrency Outbound Dialing Platform
CloudCall is an enterprise-grade, multi-tenant outbound calling application built entirely on Cloudflare's Edge Network. It eliminates double-calling using Cloudflare Durable Objects for zero-latency in-memory state locking, and provides real-time admin visibility via WebSockets.

🏗️ Architecture
The system splits responsibilities cleanly between persistent storage and ephemeral locking state.

[ React Frontend (Vite) ] ───► Cloudflare Pages / Worker Static Assets          │          ▼ (HTTPS / WSS)[ Cloudflare Worker (Hono) ] ───► JWT Verification, Spreadsheet Parsing, Routing          │             │          ▼             ▼[ Cloudflare D1 ]   [ Durable Object (Per Group) ](SQLite DB)        (In-Memory Locking & WebSockets)
Worker: Handles authentication, parses Excel files using SheetJS, and writes initial records to D1.
Durable Object (DO): Acts as an isolated, single-threaded state machine for each Organization (Group). Because a DO processes messages sequentially, if 50 callers request a contact at the exact same millisecond, the DO hands out 50 unique contacts atomically. Zero race conditions.
D1 Database: Serves as the persistent source of truth. The DO asynchronously flushes locked/completed states to D1 using ctx.blockWaitUntil so it doesn't block the caller's UI.
✨ Core Features
Multi-Tenancy: 1:1 mapping with Clerk Organizations. Org Admin = Campaign Manager. Org Member = Caller.
Smart Contact Distribution: Admins can leave contacts in a "Shared Pool" (first-come-first-served) or "Auto-Distribute" lists evenly across specific callers.
Zero Double-Calling: Guaranteed by Durable Object sequential execution logic.
Real-Time Dashboard: Admins connect via WebSockets to see calls completed live as they happen across the team.
Native Device Dialing: Uses tel: links to open the user's actual phone dialer.
Offline-Resilient Worker: Once a caller locks a contact, they hold it in their browser state. If their internet drops mid-call, they can still log the disposition, and the Worker syncs when they reconnect.
🛠️ Tech Stack
Frontend: React 18, Vite, Tailwind CSS, Clerk React, Lucide Icons
Backend: Cloudflare Workers, Hono (TypeScript Router)
Database: Cloudflare D1 (SQLite)
Real-time: Cloudflare Durable Objects (WebSockets & State)
Auth: Clerk (Organizations & JWT Verification)
🚀 Local Setup & Installation
Prerequisites
Node.js >= v18
A Cloudflare account (wrangler login)
A Clerk account with Organizations enabled.
1. Clone & Install
bash

git clone <your-repo-url>
cd cloudcall
npm install
2. Environment Variables
Create a .dev.vars file in the root for local Worker secrets:

env

CLERK_PEM_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqh...\n-----END PUBLIC KEY-----"
(Find your PEM Public Key in the Clerk Dashboard -> API Keys -> Advanced -> Copy PEM Public Key).

Create a .env file in the root for the Vite frontend:

env

VITE_CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxxxx
3. Database Setup (D1)
Initialize your local D1 database with the schema:

bash

npm run db:migrate:local
4. Run Locally
This runs the Wrangler worker (port 8787) and the Vite dev server (port 3000) simultaneously. Vite proxies API calls to Wrangler.

bash

npm run dev
Open http://localhost:3000 in your browser.

☁️ Production Deployment
1. Create Remote D1 Database
bash

wrangler d1 create cloudcall-db
Copy the database_id from the output and paste it into your wrangler.toml.

2. Push Remote Schema
bash

npm run db:migrate:remote
3. Deploy
The deploy script automatically builds the React app and deploys the Worker + static assets in one command:

bash

npm run deploy
📖 Usage Guide
For Campaign Managers (Admins)
Log in and ensure you are in the correct Organization (top right switcher).
Navigate to /admin.
Upload a .csv or .xlsx file. The system parses up to 10,000 rows and loads them into the "Shared Pool".
Option A: Leave them in the Shared Pool. Callers will pull from the same bucket.
Option B: Click "Distribute Evenly". The backend instantly chunks the list equally among active callers in your org.
Monitor the real-time dashboard (WebSocket connected) to see the queue size drop as your team makes calls.
Click "Export Report" at any time to download a full .xlsx file mapping exactly who called whom, the disposition, and notes.
For Callers
Log in and join the Organization provided by your manager.
Navigate to /call.
Click "Check for New Contacts". The backend instantly locks a contact for you.
Click the green "Call Now" button. Your phone's native dialer opens.
After the call, select a Disposition (Answered, No Answer, Voicemail, etc.), add notes, and click "Submit & Get Next".
The system instantly releases the lock, logs the data, and fetches your next contact automatically.
⚠️ Important Developer Notes
nodejs_compat flag: The wrangler.toml must include nodejs_compat. SheetJS (xlsx) uses Node.js buffer APIs under the hood. Without this flag, parsing spreadsheets will crash the Worker.
Durable Object Eviction: Cloudflare may evict DOs from memory if they receive no traffic for a few minutes. The ensureInitialized() method automatically rebuilds the in-memory state from D1 upon the next request, so this is handled safely.
CORS: The Hono worker includes a global CORS middleware for local development. For production, you may want to restrict the Access-Control-Allow-Origin header to your specific Cloudflare Pages domain.
text


---

### Next Steps to get it running:
1. Save these three files in your empty project folder.
2. Run `npm install` (this generates the `package-lock.json`).
3. Create your D1 database using `wrangler d1 create cloudcall-db` and update the `wrangler.toml`.
4. Run `npm run db:migrate:local`.
5. Run `npm run dev`.