# Discover Audio Radio & Agent Knowledge Vault

An automated, zero-mock verbatim audio broadcast and RAG knowledge pipeline that ingests your Google Discover feed, curated tech/topic feeds, and on-demand custom content (links, screenshots, or raw text), strips ad/modal clutter while preserving 100% verbatim prose, synthesizes natural multi-persona `edge-tts` audio with pre-generation prosody controls, and exports a structured `.md` / `.json` / `registry_index.json` repository alongside a live Podcast RSS feed.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> **Confirmed Architectural & Product Decisions**
> All four core architectural choices from Phase 1 have been locked in and are reflected across this specification:

- **Confirmed Decision 1 — Multi-Channel Dynamic Ingestion**: We will wire all three automated and companion ingestion channels into the backend pipeline:
  1. **Configurable Tech/Topic & Google News RSS Feeds** (e.g., *Tom's Hardware, XDA Developers, TechRadar, CNX Software, Ars Technica*, plus custom RSS/Atom/Google News Topic URLs) polled automatically by the background scheduler.
  2. **Android Native Discover Webhook Bridge** (`POST /api/webhook/discover`) paired with a ready-to-import **MacroDroid / Tasker / Android Share Sheet companion helper** so cards swiped or shared from your phone's native Discover feed flow straight into the queue.
  3. **Exportable Playwright Mobile-Cookie Scraper** downloadable directly from the app with your configured scroll depth and target interval for local/self-hosted cron execution against `google.com`.
- **Confirmed Decision 2 — Server-Side SQLite DB + `/data/exports/` Filesystem**: All episodes, canonical URL `SHA-256` deduplication hashes, normalized title slugs, queue states, and user settings persist in a real server-side **SQLite database** (`data/discover_radio.db`), while synthesized `.mp3` audio files, YAML-frontmatter `.md` articles, `.json` payloads, and the master `registry_index.json` catalog are written directly to `data/audio/` and `data/exports/`.
- **Confirmed Decision 3 — Interactive "Read From Here" Paragraph Scrubbing & Extracted Links**: The live Reader split-view / drawer breaks each verbatim script into clickable paragraphs with proportional timestamp anchors—clicking any paragraph immediately seeks the audio player to that exact point (`"Read from here"`), alongside an extracted list of secondary links (such as blogs linked inside X posts) and a direct link to the original web page.
- **Confirmed Decision 4 — Live Podcast RSS Feed (`/api/rss.xml`) + Installable PWA**: In addition to the built-in web/PWA audio player (with `MediaSession` lock-screen and Bluetooth track controls), the backend dynamically serves a standards-compliant `/api/rss.xml` podcast feed with `<enclosure>` tags so you can subscribe in AntennaPod, Pocket Casts, or Android Auto.

---

## 1. Overview & Core Concept

- **What It Does**: Transforms heterogeneous feed items—standard tech journalism (*Tom's Hardware, XDA, TechRadar, CNX*), X/Twitter posts with secondary blog links (*Replit BYOC*), YouTube tech shorts/reviews (*UFD Tech*), and on-demand custom submissions (URLs, uploaded screenshots via Gemini Vision, or raw text)—into clean, 100% verbatim spoken audio episodes without AI summarization or conversational fluff.
- **Zero Hardcoded Content Guarantee**: The frontend initializes with an empty episode list (`[]`) and relies entirely on the backend SQLite database, live `GenerationQueueManager`, and real `edge-tts` audio synthesis.
- **Target Audience / Persona**: Power users, engineers, and researchers who want an effortless, ad-free audio read-through of their personalized feed while commuting or multitasking, backed by a power-user tuning panel and an agent-ready RAG text archive.
- **Key Value**:
  - **100% Verbatim Fidelity**: Strips newsletter popups, cookie banners, inline ads, and "See More" truncations while reading every word of the actual article, prepended with `"[Title]. Published on [Source] by [Author]."`
  - **Pre-Generation Prosody & Persona Rotation**: Injects speech rate (`%`) and vocal pitch (`Hz`) directly into `edge-tts` prior to `.mp3` generation for artifact-free audio, rotating across your checked `en-US` neural voice pool (or locking a single voice).
  - **Queue-Aware Immutability**: Adjusting TTS rate, pitch, or voices mid-batch never alters already-generated or currently-synthesizing episodes; the worker hot-reloads `config.json` right before popping the next queued item.
  - **Two-Stage Agentic RAG Repository**: Automatically writes every episode as `.md` and `.json` and updates a lightweight `registry_index.json` so downstream AI agents can query titles/keywords/dates first and ingest full verbatim text second.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **First-Run & Automated Feed Sync**:
   - On launch, the client queries `GET /api/episodes`, `GET /api/config`, and `GET /api/queue`.
   - If the database is empty on first boot, a clear empty state invites the user to click **"Sync Feed Batch Now"**, **"Generate Calibration Test Episode"**, or **"+ Custom Ingest"** (or automatically triggers an initial background scrape of the configured feeds).
   - As the backend queue processes items, a live queue status bar updates via polling/SSE showing the currently synthesizing item, its locked pre-generation prosody (`rate`/`pitch`), and the remaining queue count.
2. **Abbreviated Feed & Inline Playback**:
   - Each episode card displays clean unboxed metadata (`Source · Author · Voice Persona · Pre-Gen Rate/Pitch · Word Count`), the article headline, and an inline transport control bar right underneath the card (`Play/Pause`, interactive scrub bar, `"Read From Here" Script trigger`, and `.md`/`.json` quick export).
   - Hearing a headline you want to skip? Press `Next Track` in the inline bar, persistent bottom player, or via Bluetooth headphones (`MediaSession` API).
3. **Interactive Reader Split-View & "Read From Here" Seeking**:
   - Clicking an article's script button (or expanding the persistent bottom player) opens the **Synchronized Reader View**.
   - The verbatim text is segmented into clickable paragraphs. The active paragraph highlights automatically as audio progresses, and clicking any paragraph seeks the audio player directly to that paragraph's proportional timestamp (`"Read from here"`).
   - A dedicated **Extracted Links & Source Bar** at the top of the reader lists all secondary URLs discovered inside the article or X post (e.g., the Replit blog link inside a tweet) plus a direct button to open the original webpage.
4. **Custom Content Ingest (`+ Custom` Modal — URL, Screenshot Vision, Raw Text)**:
   - Accessible from the primary action button in the top bar.
   - **Tab 1 (Web URL / X / YouTube)**: Paste any link; the router applies the exact same rules (Jina/Readability DOM cleaning, FxTwitter secondary blog following, or YouTube transcript extraction).
   - **Tab 2 (Screenshot Vision)**: Drop or upload a screenshot from your phone or desktop. The server calls `gemini-3.8-flash` Vision to extract the visible URL, publication source, headline, and verbatim text—automatically scraping the full canonical URL if detected, or synthesizing the extracted text directly.
   - **Tab 3 (Raw Text)**: Paste any newsletter, documentation page, or note.
   - **Queue Priority**: Choose **"Immediate (Jump to #1 in Queue)"** or **"Append to Queue"**.
5. **Power-User Tuning Panel ("Tune") & On-Demand Test Episode**:
   - **Pre-Generation Prosody & Calibration**: Sliders for Pre-Gen Speech Rate (`-25%` to `+45%`) and Vocal Pitch (`-20Hz` to `+20Hz`), paired with a **"Generate Test Episode"** button that immediately synthesizes a real calibration episode on the backend so you can audition the exact voice and prosody.
   - **EN-US Neural Voice Matrix**: Toggle between **"Rotate Checked Pool"** and **"Single Locked Voice"**. Check/uncheck individual `en-US` Edge neural voices (`Andrew`, `Ava`, `Brian`, `Emma`, `Christopher`, `Steffan`, `Aria`, `Guy`, `Jenny`, `Eric`, `Michelle`, `Roger`) and trigger a live backend voice sample preview (`POST /api/tts/preview`).
   - **Ingestion & Companion Bridges**: Manage active RSS/Google News Topic feeds, adjust cron interval hours, scroll depth, batch size cap, and copy/download the **Android Webhook setup & Playwright Mobile Cookie Scraper script**.
   - **UI & Ergonomic Tweaks**: Live-reactive controls for card density (`Compact`, `Comfortable`, `Spacious`), thumbnail layout (`Banner`, `Side`, `Minimal Text`), interface accent color, reader font size/line-height, and skip-step seconds (`5s`–`60s`).
6. **Agent RAG Vault & Podcast RSS**:
   - Inspect the live `registry_index.json` catalog, filter/search across all ingested episodes by keyword or source, download individual or bulk `.md` and `.json` files, copy the `/api/rss.xml` Podcast feed URL for AntennaPod/Pocket Casts, and test two-stage RAG retrieval directly against your indexed library.

### Visual Identity & Theme

- **Aesthetic Direction**: Utilitarian editorial audio workstation inspired by **Linear**, **Raycast**, and **Pocket Casts**—combining crisp typographic scannability, tactile audio transport controls, and zero visual bloat.
- **Responsive Viewport Presence**:
  - **Desktop (`1440px` Baseline)**: Full-width multi-column workspace (`max-w-7xl mx-auto`) featuring a 2-column split on the Feed view (scrollable Abbreviated Feed on the left `7 cols` + sticky Interactive "Read From Here" Reader & Queue Inspector on the right `5 cols`) so desktop screens never collapse into a narrow mobile strip.
  - **Mobile / Android PWA (`375px`–`430px`)**: Thumb-zone optimized single-column feed with $\ge 44\times 44\text{px}$ touch targets, slide-up Reader drawer, and a compact bottom transport bar respecting the 15% sticky viewport cap.
- **Color Palette & Atmospheric Polarity (Intentional Dark Mode)**:
  - **Canvas Background (`60%`)**: Deep Carbon Obsidian (`#0B0D11`) for distraction-free reading and low-glare mobile use.
  - **Elevated Structural Surfaces (`30%`)**: Graphite Slate (`#13161C`) cards with subtle `1px solid rgba(255, 255, 255, 0.07)` hairline borders (`#222631`).
  - **Typography Hierarchy**: Crisp Alabaster (`#F3F4F6`) primary text, Muted Pewter (`#9CA3AF`) secondary prose, and Slate Gray (`#6B7280`) unboxed metadata with middle-dot (`·`) separators.
  - **Accent Budget (`10%`)**: User-customizable primary accent (defaulting to Electric Sky `#60A5FA`, with one-click presets for Emerald `#34D399`, Amber `#F59E0B`, Coral `#FB7185`, and Violet `#A78BFA`).
- **Typography & Scannable Hierarchy (2+1 Font Rule)**:
  - `--font-display`: `'Plus Jakarta Sans'` (`600`/`700` weight, tight tracking `-0.02em`, `text-wrap: balance` on all article titles).
  - `--font-sans`: `'DM Sans'` (`400`/`500` weight, generous `1.65` line-height and `65ch` measure in the Reader view).
  - `--font-mono`: `'JetBrains Mono'` (`tabular-nums` for all audio timestamps, word counts, prosody percentages/Hertz, and SHA-256 deduplication hashes).

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Real Server-Side `msedge-tts` Synthesis with Pre-Generation Prosody Injection**
  - *Chosen Approach*: Execute Microsoft Edge Neural TTS directly on the Node/Express backend (`msedge-tts` / WebSocket neural synthesis stream) with SSML `<prosody rate="..." pitch="...">` injected before rendering the `.mp3` file to `data/audio/<id>.mp3`.
  - *Why*: Browser `HTMLAudioElement.playbackRate` warps time in the client and degrades vocal formants, whereas pre-generation neural prosody adjusts cadence and pitch naturally inside the TTS model itself.
  - *Immutability Guarantee*: Each episode row in SQLite records `voice_used`, `tts_rate_used`, and `tts_pitch_used` at the moment its synthesis begins. Changing settings mid-batch updates `config.json` on disk so the very next queued item uses the new parameters without touching completed or in-flight audio files.
- **Decision 2 — Multi-Layer Deduplication (Canonical URL Hash + Title Fingerprint)**
  - *Chosen Approach*: Strip all tracking parameters (`utm_*`, `gclid`, `fbclid`, trailing slashes) to compute a canonical `SHA-256` hash (`url_hash`) plus a normalized alphanumeric `title_slug`. Check SQLite `episodes` and `seen_hashes` before fetching full article DOMs or invoking TTS.
  - *Why*: Prevents wasting bandwidth, LLM tokens, and TTS time on syndicated or repeated stories across 12-hour runs, while still allowing explicit re-synthesis when the user clicks "Generate Test Episode" or forces a custom override.
- **Decision 3 — Paragraph-Level Proportional Timestamp Mapping for "Read From Here"**
  - *Chosen Approach*: Split the cleaned verbatim script into structured paragraphs (`paragraphs: Array<{ index, text, charStart, charEnd, weightRatio }>`) stored in SQLite. When the audio plays (or when the user clicks any paragraph in the Reader), map `paragraph.weightRatio * audio.duration` to seek immediately to that paragraph.
  - *Why*: Delivers instant, zero-latency "click any paragraph to read from here" and synchronized paragraph highlighting in the Reader without requiring brittle forced-alignment phoneme models.

---

## 4. Technical Architecture & Data Strategy

### System Architecture & Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                          REACT + TYPESCRIPT + TAILWIND PWA                          │
│  ┌───────────────────────────────────────────────────────────────────────────────┐  │
│  │ Top Bar Contract: [Discover Radio] ── [Feed · Vault · Bridges · Tune] ── [+ Custom]│
│  └───────────────┬───────────────────────────────┬───────────────────────────────┘  │
│                  │                               │                                  │
│                  ▼                               ▼                                  │
│  ┌──────────────────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │ Left/Main Column: Dynamic Views      │  │ Right Column / Drawer: Live Reader  │  │
│  │ • Abbreviated Feed Cards (Inline     │  │ • Clickable Paragraphs ("Read From  │  │
│  │   Play/Pause, Scrub, .md/.json)      │  │   Here" proportional audio seek)    │  │
│  │ • Live Queue Progress Banner         │  │ • Extracted Secondary Links Bar     │  │
│  │ • Agent RAG Vault & Registry Search  │  │ • Original Webpage Launcher         │  │
│  │ • Companion Bridges (Webhook/Script) │  └─────────────────────────────────────┘  │
│  │ • Tune Panel (Voice Matrix, Pre-Gen  │  ┌─────────────────────────────────────┐  │
│  │   Rate/Pitch, Test Episode, UI)      │  │ Persistent Bottom Master Player     │  │
│  └───────────────┬──────────────────────┘  │ • MediaSession API + Transport Bar  │  │
│                  │                         └──────────────────┬──────────────────┘  │
└──────────────────┼────────────────────────────────────────────┼─────────────────────┘
                   │ REST API (`/api/*`) + Audio Stream         │
                   ▼                                            ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                        EXPRESS + TYPESCRIPT BACKEND (`server.ts`)                   │
│                                                                                     │
│  ┌────────────────────────────┐    ┌─────────────────────────────────────────────┐  │
│  │ Ingestion Controllers      │    │ Sequential `GenerationQueueManager`         │  │
│  │ • Cron RSS/News Poller     ├───►│ 1. Pop next item (`immediate` or `next`)    │  │
│  │ • POST /api/webhook/discover│   │ 2. Dedupe check vs SQLite (`url_hash`/slug) │  │
│  │ • POST /api/episodes/custom│    │ 3. Hot-reload `config.json` prosody/voices  │  │
│  │ • POST /api/episodes/test  │    │ 4. Route Content:                           │  │
│  └────────────────────────────┘    │    • Article -> Jina/DOM + Verbatim Cleaner │  │
│                                    │    • X Post -> FxTwitter + Linked Blog Fetch│  │
│                                    │    • YouTube -> Classifier + Transcript     │  │
│                                    │    • Screenshot -> `gemini-3.8-flash` Vision│  │
│                                    │ 5. Render MP3 via `msedge-tts` (Rate/Pitch) │  │
│                                    └──────────┬───────────────────────┬──────────┘  │
│                                               │                       │             │
│                                               ▼                       ▼             │
│  ┌──────────────────────────────────────────────┐  ┌─────────────────────────────┐  │
│  │ SQLite Database (`data/discover_radio.db`)   │  │ Disk Exports (`data/`)      │  │
│  │ • `episodes` table (metadata, verbatim       │  │ • `audio/<id>.mp3`          │  │
│  │   paragraphs, extracted_links, locked TTS)   │  │ • `exports/md/<slug>.md`    │  │
│  │ • `seen_hashes` table (permanent dedupe)     │  │ • `exports/json/<slug>.json`│  │
│  │ • `feed_sources` table (configurable feeds)  │  │ • `registry_index.json`     │  │
│  └──────────────────────────────────────────────┘  │ • `/api/rss.xml` Podcast    │  │
│                                                    └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### Data Model & Persistent Storage

1. **SQLite `episodes` Table**:
   - `id` (`TEXT PRIMARY KEY` — 16-char canonical SHA-256 hash or test UUID)
   - `url_hash` (`TEXT UNIQUE`) & `title_slug` (`TEXT`)
   - `canonical_url` (`TEXT`), `title` (`TEXT`), `source` (`TEXT`), `author` (`TEXT`)
   - `origin_type` (`'discover_feed' | 'android_webhook' | 'custom_url' | 'custom_screenshot' | 'custom_text' | 'test_episode'`)
   - `content_type` (`'article' | 'x_thread_blog' | 'youtube_transcript' | 'calibration'`)
   - `voice_used` (`TEXT`), `tts_rate_used` (`TEXT`), `tts_pitch_used` (`TEXT`) — **Immutable per episode**
   - `audio_url` (`TEXT`), `duration_estimate_sec` (`INTEGER`), `word_count` (`INTEGER`)
   - `keywords` (`TEXT` JSON array), `summary_one_line` (`TEXT`)
   - `verbatim_script` (`TEXT`), `paragraphs` (`TEXT` JSON array with `charStart`, `charEnd`, `weightRatio` for "Read From Here" scrubbing)
   - `extracted_links` (`TEXT` JSON array of `{ label, url }` found inside the article/tweet)
   - `md_filename` (`TEXT`), `json_filename` (`TEXT`), `created_at` (`TEXT`)
2. **SQLite `seen_hashes` Table**:
   - Retains `url_hash`, `title_slug`, and `first_seen_at` permanently even if an episode's audio file is later archived or deleted by the user, guaranteeing historical deduplication across 12-hour runs.
3. **Filesystem Agent Vault (`data/exports/`)**:
   - `registry_index.json`: Master Stage-1 RAG index updated atomically after every episode generation.
   - `md/<date>_<slug>_<id>.md`: Verbatim Markdown with complete YAML frontmatter (`id`, `title`, `source`, `author`, `captured_at`, `voice_persona`, `tts_prosody`, `keywords`, `summary_one_line`, `extracted_links`).
   - `json/<date>_<slug>_<id>.json`: Complete structured JSON representation.

### Interactive Component & State Mapping

- **Top Navigation Bar**: Strictly follows the 3-zone contract: `[Discover Radio]` brand wordmark on the left; `Feed`, `RAG Vault`, `Bridges & RSS`, and `Tune` navigation links in the center; and the primary `+ Custom Ingest` CTA button on the right (plus the automatic PWA `Install App` trigger when installable).
- **Feed & Queue Controller**:
  - Polls `/api/queue` every 2 seconds while `isRunning === true` (and refreshes `/api/episodes` automatically whenever `completedCount` increments).
  - Supports filtering by origin (`All`, `Feed Batch`, `Custom Ingest`, `Calibration Tests`), live search across titles/keywords, and deleting/archiving episodes (with option to keep or clear the deduplication hash).
- **Synchronized Reader & Hovering/Split Player**:
  - Displays the active episode's metadata, voice/prosody signature, clickable extracted links, and paragraph blocks.
  - Clicking any paragraph calculates `targetTime = paragraph.weightRatio * audioRef.current.duration` and sets `audioRef.current.currentTime = targetTime`, starting playback immediately from that paragraph.
- **Custom Content Ingest Modal**:
  - Handles multipart upload (`FormData`) for Screenshot Vision (`gemini-3.8-flash` multimodal analysis), URL scraping, or raw text, with explicit radio selection for `Immediate (Jump to #1 in Queue)` vs `Next in Queue`.
- **Tune (Settings) Panel**:
  - Debounces and persists changes to `POST /api/config`, displays a clear badge confirming that pre-generation TTS changes apply to the **next queued item**, and wires the **"Generate Test Episode"** button to `POST /api/episodes/test` with immediate playback upon completion.
