# Offline-First Church Call Center Assistant & AI Companion

An offline-first, privacy-respecting campaign manager designed for church follow-ups, integrated with a serverless edge AI companion for document extraction and data sanitization.

---

## System Architecture

```mermaid
graph TD
    A[Handwritten Photo / Raw Text / Messy Sheet] -->|Drop / Paste| B(Campaign Data Companion)
    B -->|API: /api/companion-process| C(Cloudflare Edge Worker)
    C -->|Llama 3.2 Vision / 3.1 Instruct| D[Cloudflare Workers AI]
    D -->|Structured JSON Array| C
    C -->|JSON response| B
    B -->|SheetJS Compilation| E[Clean CSV / XLSX Download]
    E -->|Drag & Drop| F(Local Call Center Dialer)
    F -->|IndexedDB Offline Sync| G[(Browser Dexie DB)]
    F -->|Device Native Dialing| H[Phone Call App]
```

### Components

1. **Local Call Center (Main App)**:
   - **Technology Stack**: React, TypeScript, Vite, Dexie.js (IndexedDB), Lucide Icons, and SheetJS.
   - **Features**: Progressive Web App (PWA) that installs on mobile or desktop and works 100% offline. Tracks campaigns contact-by-contact, auto-populates teleprompter scripts, hooks directly into the device's native telephone dialer, logs feedback statuses, and exports call sheets back to Excel.
2. **Campaign Data Companion (Frontend Utility)**:
   - **Technology Stack**: Static HTML, Vanilla CSS, Lucide CDNs, and SheetJS CDNs.
   - **Features**: Modern dark-mode page serving three core data preparation tools:
     - **Image OCR**: Converts handwriting and roster photographs to base64, rendering previews locally.
     - **Text Paste**: Standardizes unstructured clipboard text lists.
     - **Sheet Normalizer**: Parses spreadsheets locally using SheetJS and slices the first 200 rows into JSON payloads.
3. **Edge AI Processor (Backend Worker)**:
   - **Technology Stack**: TypeScript, Cloudflare Workers, and Workers AI.
   - **Features**: Implements serverless edge endpoints (`/api/companion-process`) that intercept payloads, run vision or text instruction LLMs, and utilize a robust regex-based extraction parser to return structured `[{"name": "...", "phone": "..."}]` datasets.

---

## Risks and Bottlenecks

### 1. Data Privacy & Compliance
- **Description**: The main Call Center application operates 100% offline in-browser to protect sensitive congregant data. However, the AI Companion transmits photos, text lists, or spreadsheet rows to Cloudflare's serverless edge.
- **Risk**: If rosters contain highly sensitive PII (Personally Identifiable Information), sending them to a third-party Cloud API might violate organizational privacy mandates or regional data compliance laws (e.g., GDPR, CCPA).
- **Mitigation**: Warn users of the data transit inside the UI. For strict privacy setups, migrate the backend Worker AI binding to run on self-hosted local models (e.g., LocalAI or Ollama) running within the church intranet.

### 2. Context Window & Token Limits
- **Description**: Large language models have finite context windows. Sending a spreadsheet with thousands of rows directly to the AI sanitization pipeline will exceed context limits or exhaust token quotas.
- **Bottleneck**: The frontend is constrained to slice only the first 200 rows of spreadsheets for AI sanitization. Normalizing files larger than 200 rows requires the user to split the document into smaller chunks or clean them in multiple batches.
- **Improvement**: Implement chunked processing on the frontend, breaking large sheets into batches of 100-200 rows and making sequential backend API calls, aggregating the final downloads.

### 3. Edge AI Cold Starts & Latency
- **Description**: Vision processing and instruct LLM completion on Cloudflare's shared GPU network can experience cold starts, rate limits, or network delays.
- **Bottleneck**: Processing an image or text block can take up to 25 seconds, causing sluggish user feedback.
- **Improvement**: Cache previous cleanings or show detailed progressive loading indicators. Configure rate-limiting queues to avoid overwhelming the Worker endpoint during heavy batch submissions.

### 4. Parsing Accuracy & Hallucinations
- **Description**: Handwritten cursive or blurry photographs can lead the AI Vision model to misread names or phone numbers, or hallucinate missing digits.
- **Risk**: Important contacts may be downloaded with corrupted telephone numbers, making them undialable or leading to wrong-number calls.
- **Mitigation**: The regex helper `sanitizeAndExtractJson` isolates and recovers structural JSON arrays but cannot validate number correctness. Users must inspect and verify the downloaded spreadsheets before running call campaigns.

### 5. CORS & Access Security
- **Description**: The Cloudflare Worker backend configures open CORS headers (`'Access-Control-Allow-Origin': '*'`) to enable easy integration and local development.
- **Risk**: Without authentication, any script on the web could invoke the Worker and consume your Cloudflare AI resource budget.
- **Improvement**: Lock down origin constraints in production or implement simple API key headers/JSON Web Token (JWT) verification to secure the `/api/companion-process` worker endpoint.

### 6. IndexedDB Eviction
- **Description**: Browser local storage (IndexedDB) is non-persistent by default. If a mobile device runs extremely low on disk space, the mobile OS may evict IndexedDB storage, leading to loss of call center campaign logs.
- **Risk**: Losing in-progress campaign data if the browser cache is wiped.
- **Mitigation**: Encourage users to use the floating backup button (`Download`) to export progress regularly.
