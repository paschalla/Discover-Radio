# Android Discover & Playwright Automation Bridges

Because **Google Discover** on Android does not offer a public RSS feed or official REST API, **Discover Audio Radio & Agent Knowledge Vault** provides four complementary ingestion bridges so you can capture your exact personalized feed automatically or with a single tap on your phone.

---

## Bridge 1: Android Native Share Sheet (`HTTP Shortcuts` / `Tasker` / `MacroDroid`)

When scrolling through your Google Discover feed on Android, you can send any card (Article, X Post, or YouTube Video) directly to your server's queue in **2 taps** via Android's native **Share** menu.

### Option A: Using Free Open-Source "HTTP Shortcuts" App (Recommended)

1. Install **HTTP Shortcuts** from Google Play or F-Droid.
2. Tap **+** → **Create Regular Shortcut**:
   - **Name**: `Send to Discover Radio`
   - **Execution Settings**: Check **Allow using as Share Target (Text / URL)**.
3. Create a Global Variable named `shared_url` configured to receive **Shared Text**.
4. Configure the HTTP Request:
   - **Method**: `POST`
   - **URL**: `https://<YOUR_APP_URL>/api/webhook/discover`
   - **Request Body Type**: `JSON`
   - **Body Content**:
     ```json
     {
       "url": "{{shared_url}}",
       "source": "android_share_sheet"
     }
     ```
5. Now, while scrolling Google Discover on your phone, tap the **Share icon** on any card → select **Send to Discover Radio**. The server deduplicates, extracts the verbatim script, and synthesizes the neural MP3 automatically.

---

### Option B: Zero-Touch Android Accessibility Macro (`MacroDroid` / `Tasker` + `AutoInput`)

If you want your Android phone to automatically scrape your Google Discover feed every 12 hours while charging:

1. Create a MacroDroid/Tasker trigger: **Every 12 Hours** (or **At 6:30 AM & 6:30 PM**).
2. Action 1: **Launch Application** → `Google` (`com.google.android.googlequicksearchbox`).
3. Action 2: **UI Query / AutoInput Screen Capture** → Extract all visible card URLs or trigger Share URL intents in a loop (5–8 scroll swipes).
4. Action 3: **HTTP POST** to `https://<YOUR_APP_URL>/api/webhook/discover`:
   ```json
   {
     "urls": ["%captured_url_1", "%captured_url_2", "%captured_url_3"],
     "source": "tasker_auto_discover"
   }
   ```

---

## Bridge 2: Self-Hosted Playwright Mobile Cookie Scraper (`discover_scraper.mjs`)

When you visit `https://www.google.com` inside a mobile Chrome session (`Pixel 7` User-Agent) while logged into your Google Account, Google serves your personalized **Discover Feed** directly below the search bar.

You can download the ready-to-run `discover_scraper.mjs` script directly from the app UI (**Ingestion Bridges** tab → **Download `discover_scraper.mjs`**) or via `GET /api/bridges/playwright-script`.

### Step 1: Install Playwright & Save Your Google Session State Once

```bash
npm install playwright
npx playwright install chromium

# Open interactive Pixel 7 browser once to log into your Google Account
npx playwright open --device="Pixel 7" --save-storage=google_auth_state.json https://www.google.com
```

Log into your Google Account in the window that opens, verify that your Discover cards appear below the search bar, and close the browser. Your session cookies are saved to `google_auth_state.json`.

### Step 2: Run the Headless Scraper & Push to Webhook

```bash
DISCOVER_RADIO_URL="https://<YOUR_APP_URL>" \
GOOGLE_STORAGE_STATE="./google_auth_state.json" \
node discover_scraper.mjs
```

The script:
1. Launches headless Chromium emulating a `Pixel 7` with `google_auth_state.json`.
2. Navigates to `https://www.google.com` and performs 8 smooth vertical scroll passes to lazy-load ~20–30 Discover cards.
3. Extracts all outbound article, X, and YouTube URLs (filtering internal Google search/account links).
4. POSTs the batch to `/api/webhook/discover`, where SQLite deduplication filters any previously seen links and queues the new stories for Edge-TTS synthesis.

### Step 3: Automate Every 12 Hours via Cron

```bash
crontab -e
```

Add the following line to run at **06:00** and **18:00** daily:

```cron
0 6,18 * * * cd /opt/discover-scraper && DISCOVER_RADIO_URL="https://<YOUR_APP_URL>" node discover_scraper.mjs >> /var/log/discover_scraper.log 2>&1
```

---

## Bridge 3: Configurable RSS & Google News Topic Poller

Built directly into `server.ts`, the background scheduler polls all enabled RSS/Atom and Google News feeds every `pollIntervalHours` (configurable from `1h` to `24h` in **Tune & Voices**, defaulting to `12h`).

Default curated feeds include:
- **Tom's Hardware** (`https://www.tomshardware.com/feeds/all`)
- **XDA Developers** (`https://www.xda-developers.com/feed/`)
- **TechRadar Pro & News** (`https://www.techradar.com/rss`)
- **Ars Technica** (`https://feeds.arstechnica.com/arstechnica/index`)

You can also add any **Google News Topic or Custom Search RSS URL** in the **Tune & Voices** modal:
```text
https://news.google.com/rss/search?q=vLLM+OR+Replit+OR+Local+LLM&hl=en-US&gl=US&ceid=US:en
```

---

## Bridge 4: Podcast RSS 2.0 Feed (`/api/rss.xml`) for Android Auto

In addition to the built-in installable PWA player, the server exposes a live **Podcast RSS 2.0** feed at:

```text
https://<YOUR_APP_URL>/api/rss.xml
```

1. Copy the `/api/rss.xml` URL from the **Ingestion Bridges** tab.
2. Open **AntennaPod**, **Pocket Casts**, or **Podcast Addict** on Android → **Add Podcast by RSS URL**.
3. Your synthesized Discover articles automatically download to your phone for offline playback and **Android Auto** steering-wheel skip controls.
