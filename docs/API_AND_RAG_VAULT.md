# REST API Reference & Two-Stage Agent RAG Vault Guide

![Two-Stage RAG Flow](./assets/rag-two-stage-flow.svg)

This guide documents all HTTP endpoints exposed by `server.ts`, the on-disk file formats written to `/data/exports/`, and how to connect external AI coding agents (`Claude Code`, `Cursor`, custom MCP servers, or Python/TypeScript scripts) to the **Two-Stage Agent Knowledge Vault**.

---

## 1. Two-Stage Agent Knowledge Vault Specification

### Why Two-Stage Retrieval?

If you ingest 20 Discover articles per day, after 30 days your vault holds **600 full-length articles** (~1.5 million tokens). Loading all 600 files into an LLM prompt will overflow or degrade reasoning.

Instead, `src/server/db.ts` maintains a **Two-Stage Vault** inside `/data/exports/`:

1. **Stage 1 — `/data/exports/registry_index.json` (Lightweight Discovery Manifest)**
   - Contains ~120 bytes per article (`id`, `title`, `sourceName`, `author`, `createdAt`, `keywords[]`, `summary1Line`, `mdExportPath`, `jsonExportPath`).
   - An AI agent reads `registry_index.json` first (or calls `GET /api/vault/index`) to scan hundreds of articles in a single fast pass and pick the 1–3 matching IDs.
2. **Stage 2 — `/data/exports/{YYYY-MM-DD}-{slug}.md` & `.json` (Selective Full-Text Load)**
   - The agent opens **only** the `mdExportPath` or `jsonExportPath` for the matched entries to read the complete verbatim article text and extracted links.

---

### Stage 1 File Format: `registry_index.json`

```json
{
  "updatedAt": "2025-05-12T08:30:00.000Z",
  "totalEpisodes": 14,
  "entries": [
    {
      "id": "ep_9f82c1a4b3",
      "title": "Next-Gen Chiplets Push Local AI Inference Past 120 Tokens/Sec",
      "sourceName": "Tom's Hardware",
      "author": "Paul Alcorn",
      "publishedAt": "2025-05-12T06:00:00.000Z",
      "createdAt": "2025-05-12T08:15:22.104Z",
      "contentType": "article",
      "url": "https://www.tomshardware.com/tech-industry/artificial-intelligence/next-gen-chiplets",
      "keywords": ["chiplets", "local-ai", "inference", "bandwidth", "semiconductors"],
      "summary1Line": "Modular memory interconnects enable 800 GB/s bandwidth under 35W for local desktop AI inference.",
      "mdExportPath": "/api/vault/export/2025-05-12-next-gen-chiplets-push-local-ai.md",
      "jsonExportPath": "/api/vault/export/2025-05-12-next-gen-chiplets-push-local-ai.json",
      "audioUrl": "/api/audio/ep_9f82c1a4b3.mp3"
    }
  ]
}
```

### Stage 2 File Format: `{YYYY-MM-DD}-{slug}.md`

```markdown
---
id: "ep_9f82c1a4b3"
title: "Next-Gen Chiplets Push Local AI Inference Past 120 Tokens/Sec"
source_name: "Tom's Hardware"
source_domain: "tomshardware.com"
author: "Paul Alcorn"
url: "https://www.tomshardware.com/tech-industry/artificial-intelligence/next-gen-chiplets"
published_at: "2025-05-12T06:00:00.000Z"
ingested_at: "2025-05-12T08:15:22.104Z"
content_type: "article"
voice_id: "en-US-AndrewNeural"
voice_name: "Andrew"
prosody_rate: "+10%"
prosody_pitch: "+0Hz"
duration_sec: 255
word_count: 680
keywords:
  - "chiplets"
  - "local-ai"
  - "inference"
summary_1line: "Modular memory interconnects enable 800 GB/s bandwidth under 35W for local desktop AI inference."
audio_url: "/api/audio/ep_9f82c1a4b3.mp3"
---

# Next-Gen Chiplets Push Local AI Inference Past 120 Tokens/Sec

> **Broadcast Header:** Tom's Hardware by Paul Alcorn. Next-Gen Chiplets Push Local AI Inference Past 120 Tokens/Sec.

## Verbatim Transcript / Article Body

Tom's Hardware by Paul Alcorn. Next-Gen Chiplets Push Local AI Inference Past 120 Tokens/Sec.

Unlike traditional cloud-only pipelines, the new modular memory interconnect sustains 800 GB/s bandwidth...

## Extracted Outbound Links

- [IEEE Solid-State Circuits Whitepaper](https://doi.org/10.1109/JSSC.2025.0001)
```

---

## 2. Complete REST API Reference

### 2.1 Episodes & Queue Management

#### `GET /api/episodes`
Returns all persisted episodes (newest first), current `QueueStatus`, and active `AppConfig`.

```bash
curl -s http://localhost:3000/api/episodes | jq .
```

#### `DELETE /api/episodes/:id`
Deletes an episode from SQLite and removes its `.mp3`, `.md`, and `.json` files, while retaining its `urlHash` in `seen_hashes` so it will not be re-ingested on the next RSS poll. Pass `?allowReingest=true` to also remove the hash from `seen_hashes`.

---

### 2.2 On-Demand & Automated Ingestion

#### `POST /api/ingest`
Enqueues a URL (standard article, X post, or YouTube video) or custom raw text for verbatim extraction and neural TTS synthesis.

```bash
# Ingest a web article or X post URL
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.tomshardware.com/pc-components/gpus",
    "forceReingest": false
  }'

# Ingest custom raw text directly
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "rawText": "Internal Architecture RFC: Zero-copy shared memory ring buffers...",
    "customTitle": "Zero-Copy Ring Buffers RFC",
    "customSource": "Engineering Notes",
    "customAuthor": "Platform Team"
  }'
```

#### `POST /api/ingest/screenshot`
Accepts a `multipart/form-data` image upload (`screenshot` field) plus an optional `prompt` instruction. Uses `gemini-2.5-flash` Multimodal Vision to perform verbatim OCR and structural explanation, then synthesizes the audio episode.

```bash
curl -X POST http://localhost:3000/api/ingest/screenshot \
  -F "screenshot=@/path/to/mobile_screenshot.png" \
  -F "title=Mobile Benchmark Screenshot"
```

#### `POST /api/webhook/discover`
Dedicated webhook endpoint for Android Share Sheet apps (`HTTP Shortcuts`, `Tasker`, `MacroDroid`) and the self-hosted Playwright Discover scraper. Accepts either a single `{ "url": "..." }` or a batch `{ "urls": ["...", "..."] }`.

```bash
curl -X POST http://localhost:3000/api/webhook/discover \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://www.xda-developers.com/linux-kernel-scheduler-update/",
      "https://x.com/replit/status/1890000000000000000"
    ],
    "source": "android_discover_bridge"
  }'
```

---

### 2.3 Pre-Generation Tuning & Feed Sources

#### `GET /api/config` & `PUT /api/config`
Reads or updates `/data/config.json`. Updating `prosodyRate`, `prosodyPitch`, `rotateVoices`, or `enabledVoiceIds` takes effect **immediately on the very next queued item** in `GenerationQueueManager`.

```bash
curl -X PUT http://localhost:3000/api/config \
  -H "Content-Type: application/json" \
  -d '{
    "prosodyRate": "+15%",
    "prosodyPitch": "+2Hz",
    "rotateVoices": true,
    "pollIntervalHours": 12
  }'
```

#### `GET /api/feeds`, `POST /api/feeds`, `DELETE /api/feeds/:id`, `POST /api/feeds/poll`
Manage RSS/Atom and Google News topic feeds and trigger immediate feed polling.

---

### 2.4 Agent Knowledge Vault & Podcast RSS

#### `GET /api/vault/index`
Returns the Stage-1 `registry_index.json` manifest.

#### `GET /api/vault/export/:filename`
Downloads the raw `.md` or `.json` file from `/data/exports/:filename`.

#### `POST /api/vault/query`
Executes the built-in Two-Stage RAG pipeline:
1. Scores `registry_index.json` entries against `query`.
2. Loads the full `.md` bodies for the top matches.
3. Synthesizes a grounded response with `gemini-2.5-flash` citing the matched episodes.

```bash
curl -X POST http://localhost:3000/api/vault/query \
  -H "Content-Type: application/json" \
  -d '{ "query": "What were the key findings on chiplet bandwidth and thermal envelopes?" }'
```

#### `GET /api/rss.xml`
Generates a standard **Podcast RSS 2.0** XML feed with iTunes metadata and `<enclosure url="..." type="audio/mpeg" />` tags for every `ready` episode.
