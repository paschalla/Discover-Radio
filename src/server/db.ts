import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import {
  AppConfig,
  Episode,
  FeedSource,
  RegistryIndex,
  RegistryIndexEntry,
} from '../types.ts';
import { DEFAULT_CONFIG, DEFAULT_FEED_SOURCES } from './voices.ts';

export const ROOT_DIR = process.cwd();
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const AUDIO_DIR = path.join(DATA_DIR, 'audio');
export const EXPORT_DIR = path.join(DATA_DIR, 'exports');
export const EXPORT_MD_DIR = path.join(EXPORT_DIR, 'md');
export const EXPORT_JSON_DIR = path.join(EXPORT_DIR, 'json');
export const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
export const DB_PATH = path.join(DATA_DIR, 'discover_radio.db');
export const REGISTRY_INDEX_PATH = path.join(EXPORT_DIR, 'registry_index.json');
export const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

for (const dir of [
  DATA_DIR,
  AUDIO_DIR,
  EXPORT_DIR,
  EXPORT_MD_DIR,
  EXPORT_JSON_DIR,
  PUBLIC_DIR,
]) {
  fs.mkdirSync(dir, { recursive: true });
}

// Generate valid minimalist PNG icons in /public so PWA manifest requirements are 100% satisfied
function createSolidPngBuffer(width: number, height: number, r: number, g: number, b: number): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function crc32(buf: Buffer): number {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowSize = width * 4 + 1;
  const raw = Buffer.alloc(rowSize * height);
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.34;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    raw[rowOffset] = 0; // filter type 0
    for (let x = 0; x < width; x++) {
      const px = rowOffset + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Draw subtle waveform bars inside center safe zone
      const inWaveBand =
        Math.abs(dx) < radius * 0.85 &&
        Math.abs(dy) < radius * (0.35 + 0.45 * Math.abs(Math.cos((dx / radius) * 4.5))) &&
        Math.floor((x + width) / Math.max(4, Math.floor(width / 28))) % 2 === 0;

      if (inWaveBand) {
        raw[px] = 96; // #60A5FA
        raw[px + 1] = 165;
        raw[px + 2] = 250;
        raw[px + 3] = 255;
      } else if (dist < radius && dist > radius - Math.max(2, width * 0.018)) {
        raw[px] = 34; // #222631 ring
        raw[px + 1] = 38;
        raw[px + 2] = 49;
        raw[px + 3] = 255;
      } else {
        raw[px] = r;
        raw[px + 1] = g;
        raw[px + 2] = b;
        raw[px + 3] = 255;
      }
    }
  }

  const idat = zlib.deflateSync(raw);
  const iend = Buffer.alloc(0);

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idat),
    makeChunk('IEND', iend),
  ]);
}

export function ensurePwaIcons(): void {
  const icons = [
    { name: 'pwa-192x192.png', size: 192 },
    { name: 'pwa-512x512.png', size: 512 },
    { name: 'pwa-maskable-512x512.png', size: 512 },
    { name: 'apple-touch-icon.png', size: 180 },
  ];
  for (const icon of icons) {
    const target = path.join(PUBLIC_DIR, icon.name);
    if (!fs.existsSync(target)) {
      fs.writeFileSync(target, createSolidPngBuffer(icon.size, icon.size, 11, 13, 17));
    }
  }
}

ensurePwaIcons();

// --- SQLITE DATABASE INITIALIZATION (Node 22 native node:sqlite) ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sqliteDb: any = null;

async function initSqliteDb() {
  try {
    const sqliteMod = await import('node:sqlite');
    sqliteDb = new sqliteMod.DatabaseSync(DB_PATH);
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS episodes (
        id TEXT PRIMARY KEY,
        url_hash TEXT UNIQUE,
        title_slug TEXT,
        canonical_url TEXT,
        title TEXT,
        source TEXT,
        author TEXT,
        origin_type TEXT,
        content_type TEXT,
        voice_used TEXT,
        tts_rate_used TEXT,
        tts_pitch_used TEXT,
        audio_url TEXT,
        duration_estimate_sec INTEGER,
        word_count INTEGER,
        keywords TEXT,
        summary_one_line TEXT,
        verbatim_script TEXT,
        paragraphs TEXT,
        extracted_links TEXT,
        md_filename TEXT,
        json_filename TEXT,
        created_at TEXT
      );

      CREATE TABLE IF NOT EXISTS seen_hashes (
        url_hash TEXT PRIMARY KEY,
        title_slug TEXT,
        canonical_url TEXT,
        title TEXT,
        first_seen_at TEXT
      );

      CREATE TABLE IF NOT EXISTS feed_sources (
        id TEXT PRIMARY KEY,
        name TEXT,
        url TEXT UNIQUE,
        category TEXT,
        enabled INTEGER,
        last_checked_at TEXT
      );
    `);

    // Seed default feed sources if feed_sources table is empty
    const countRow = sqliteDb.prepare('SELECT COUNT(*) as cnt FROM feed_sources').get() as { cnt: number };
    if (!countRow || countRow.cnt === 0) {
      const insertFeed = sqliteDb.prepare(`
        INSERT OR IGNORE INTO feed_sources (id, name, url, category, enabled, last_checked_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const feed of DEFAULT_FEED_SOURCES) {
        insertFeed.run(
          feed.id,
          feed.name,
          feed.url,
          feed.category,
          feed.enabled ? 1 : 0,
          feed.last_checked_at
        );
      }
    }

    // Ensure registry_index.json is initialized on boot
    rebuildRegistryIndex();
  } catch (err) {
    console.error('SQLite initialization error:', err);
  }
}

await initSqliteDb();

// --- URL CANONICALIZATION & DEDUPLICATION ---
export function canonicalizeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl.trim());
    // Strip tracking query params (utm_*, gclid, fbclid, ref, etc.)
    const stripParams = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'gclid',
      'fbclid',
      'mc_cid',
      'mc_eid',
      'ref',
      'source',
    ];
    for (const p of stripParams) {
      parsed.searchParams.delete(p);
    }
    parsed.hash = '';
    const cleanPath = parsed.pathname.replace(/\/+$/, '') || '/';
    const searchStr = parsed.searchParams.toString();
    return `${parsed.protocol}//${parsed.hostname.toLowerCase().replace(/^www\./, '')}${cleanPath}${
      searchStr ? `?${searchStr}` : ''
    }`;
  } catch {
    return rawUrl.trim();
  }
}

export function computeUrlHash(rawUrl: string): string {
  const canonical = canonicalizeUrl(rawUrl);
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 16);
}

export function normalizeTitleSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function isDuplicateContent(
  url: string,
  title: string,
  checkTitleSimilarity = true
): { duplicate: boolean; reason?: string } {
  if (!sqliteDb) return { duplicate: false };
  const urlHash = computeUrlHash(url);
  const titleSlug = normalizeTitleSlug(title);

  const byHashEp = sqliteDb
    .prepare('SELECT id FROM episodes WHERE url_hash = ?')
    .get(urlHash) as { id: string } | undefined;
  if (byHashEp) {
    return { duplicate: true, reason: `Canonical URL hash #${urlHash} already in episodes` };
  }

  const byHashSeen = sqliteDb
    .prepare('SELECT url_hash FROM seen_hashes WHERE url_hash = ?')
    .get(urlHash) as { url_hash: string } | undefined;
  if (byHashSeen) {
    return { duplicate: true, reason: `Canonical URL hash #${urlHash} found in historical seen_hashes` };
  }

  if (checkTitleSimilarity && titleSlug.length >= 16) {
    const bySlugEp = sqliteDb
      .prepare('SELECT id FROM episodes WHERE title_slug = ?')
      .get(titleSlug) as { id: string } | undefined;
    if (bySlugEp) {
      return { duplicate: true, reason: `Normalized title slug '${titleSlug}' already ingested` };
    }
    const bySlugSeen = sqliteDb
      .prepare('SELECT url_hash FROM seen_hashes WHERE title_slug = ?')
      .get(titleSlug) as { url_hash: string } | undefined;
    if (bySlugSeen) {
      return { duplicate: true, reason: `Normalized title slug '${titleSlug}' found in historical seen_hashes` };
    }
  }

  return { duplicate: false };
}

// --- CONFIGURATION PERSISTENCE ---
export function loadConfig(): AppConfig {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      saveConfig(DEFAULT_CONFIG);
      return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    }
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      tts: { ...DEFAULT_CONFIG.tts, ...(parsed.tts || {}) },
      scraper: { ...DEFAULT_CONFIG.scraper, ...(parsed.scraper || {}) },
      export: { ...DEFAULT_CONFIG.export, ...(parsed.export || {}) },
      ui: { ...DEFAULT_CONFIG.ui, ...(parsed.ui || {}) },
    };
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
}

export function saveConfig(cfg: AppConfig): AppConfig {
  const merged: AppConfig = {
    tts: { ...DEFAULT_CONFIG.tts, ...(cfg.tts || {}) },
    scraper: { ...DEFAULT_CONFIG.scraper, ...(cfg.scraper || {}) },
    export: { ...DEFAULT_CONFIG.export, ...(cfg.export || {}) },
    ui: { ...DEFAULT_CONFIG.ui, ...(cfg.ui || {}) },
  };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

// --- EPISODE CRUD & AGENT EXPORTS ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRowToEpisode(row: any): Episode {
  return {
    id: row.id,
    url_hash: row.url_hash,
    title_slug: row.title_slug,
    canonical_url: row.canonical_url,
    title: row.title,
    source: row.source,
    author: row.author,
    origin_type: row.origin_type,
    content_type: row.content_type,
    voice_used: row.voice_used,
    tts_rate_used: row.tts_rate_used,
    tts_pitch_used: row.tts_pitch_used,
    audio_url: row.audio_url,
    duration_estimate_sec: Number(row.duration_estimate_sec || 0),
    word_count: Number(row.word_count || 0),
    keywords: safeJsonParse(row.keywords, []),
    summary_one_line: row.summary_one_line || '',
    verbatim_script: row.verbatim_script || '',
    paragraphs: safeJsonParse(row.paragraphs, []),
    extracted_links: safeJsonParse(row.extracted_links, []),
    md_filename: row.md_filename || '',
    json_filename: row.json_filename || '',
    created_at: row.created_at,
  };
}

function safeJsonParse<T>(str: string | null | undefined, fallback: T): T {
  if (!str) return fallback;
  try {
    return JSON.parse(str) as T;
  } catch {
    return fallback;
  }
}

export function listEpisodes(limit = 100): Episode[] {
  if (!sqliteDb) return [];
  const rows = sqliteDb
    .prepare('SELECT * FROM episodes ORDER BY created_at DESC LIMIT ?')
    .all(limit);
  return rows.map(mapRowToEpisode);
}

export function getEpisodeById(id: string): Episode | null {
  if (!sqliteDb) return null;
  const row = sqliteDb.prepare('SELECT * FROM episodes WHERE id = ?').get(id);
  return row ? mapRowToEpisode(row) : null;
}

export function saveEpisodeToDbAndVault(ep: Episode, exportCfg: AppConfig['export']): Episode {
  const datePrefix = ep.created_at.slice(0, 10);
  const safeSlug = (ep.title_slug || 'episode').slice(0, 48);
  const baseName = `${datePrefix}_${safeSlug}_${ep.id.slice(0, 6)}`;
  const mdFilename = `${baseName}.md`;
  const jsonFilename = `${baseName}.json`;

  ep.md_filename = mdFilename;
  ep.json_filename = jsonFilename;

  // 1. Write Agent-Friendly Markdown with YAML Frontmatter
  if (exportCfg.auto_export_md) {
    const mdContent = buildEpisodeMarkdown(ep);
    fs.writeFileSync(path.join(EXPORT_MD_DIR, mdFilename), mdContent, 'utf8');
  }

  // 2. Write Structured JSON
  if (exportCfg.auto_export_json) {
    fs.writeFileSync(
      path.join(EXPORT_JSON_DIR, jsonFilename),
      JSON.stringify(ep, null, 2),
      'utf8'
    );
  }

  // 3. Persist to SQLite episodes + permanent seen_hashes tables
  if (sqliteDb) {
    const stmt = sqliteDb.prepare(`
      INSERT OR REPLACE INTO episodes (
        id, url_hash, title_slug, canonical_url, title, source, author,
        origin_type, content_type, voice_used, tts_rate_used, tts_pitch_used,
        audio_url, duration_estimate_sec, word_count, keywords, summary_one_line,
        verbatim_script, paragraphs, extracted_links, md_filename, json_filename, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?
      )
    `);
    stmt.run(
      ep.id,
      ep.url_hash,
      ep.title_slug,
      ep.canonical_url,
      ep.title,
      ep.source,
      ep.author,
      ep.origin_type,
      ep.content_type,
      ep.voice_used,
      ep.tts_rate_used,
      ep.tts_pitch_used,
      ep.audio_url,
      ep.duration_estimate_sec,
      ep.word_count,
      JSON.stringify(ep.keywords),
      ep.summary_one_line,
      ep.verbatim_script,
      JSON.stringify(ep.paragraphs),
      JSON.stringify(ep.extracted_links),
      ep.md_filename,
      ep.json_filename,
      ep.created_at
    );

    if (ep.origin_type !== 'test_episode') {
      sqliteDb
        .prepare(`
          INSERT OR IGNORE INTO seen_hashes (url_hash, title_slug, canonical_url, title, first_seen_at)
          VALUES (?, ?, ?, ?, ?)
        `)
        .run(ep.url_hash, ep.title_slug, ep.canonical_url, ep.title, ep.created_at);
    }
  }

  // 4. Rebuild Master registry_index.json for Stage-1 Agent RAG
  if (exportCfg.update_registry_index) {
    rebuildRegistryIndex();
  }

  return ep;
}

export function buildEpisodeMarkdown(ep: Episode): string {
  const linksSection =
    ep.extracted_links && ep.extracted_links.length > 0
      ? `\n## Extracted Reference Links\n\n` +
        ep.extracted_links.map((l) => `- [${l.label}](${l.url})`).join('\n') +
        `\n`
      : '';

  return [
    '---',
    `id: "${ep.id}"`,
    `url_hash: "${ep.url_hash}"`,
    `origin_type: "${ep.origin_type}"`,
    `content_type: "${ep.content_type}"`,
    `title: ${JSON.stringify(ep.title)}`,
    `source: ${JSON.stringify(ep.source)}`,
    `author: ${JSON.stringify(ep.author)}`,
    `canonical_url: "${ep.canonical_url}"`,
    `captured_at: "${ep.created_at}"`,
    `voice_persona: "${ep.voice_used}"`,
    `tts_prosody: "rate=${ep.tts_rate_used}, pitch=${ep.tts_pitch_used}"`,
    `word_count: ${ep.word_count}`,
    `duration_estimate_sec: ${ep.duration_estimate_sec}`,
    `keywords: ${JSON.stringify(ep.keywords)}`,
    `summary_one_line: ${JSON.stringify(ep.summary_one_line)}`,
    '---',
    '',
    `# ${ep.title}`,
    '',
    `Source: [${ep.source}](${ep.canonical_url}) · Author: ${ep.author} · Captured: ${ep.created_at}`,
    `Voice Persona: ${ep.voice_used} (${ep.tts_rate_used}, ${ep.tts_pitch_used})`,
    linksSection,
    '---',
    '',
    ep.verbatim_script,
    '',
  ].join('\n');
}

export function rebuildRegistryIndex(): RegistryIndex {
  const allEpisodes = listEpisodes(500);
  const items: RegistryIndexEntry[] = allEpisodes.map((ep) => ({
    id: ep.id,
    origin_type: ep.origin_type,
    title: ep.title,
    source: ep.source,
    author: ep.author,
    captured_at: ep.created_at,
    content_type: ep.content_type,
    voice_used: ep.voice_used,
    tts_prosody: `${ep.tts_rate_used} / ${ep.tts_pitch_used}`,
    keywords: ep.keywords,
    summary_one_line: ep.summary_one_line,
    word_count: ep.word_count,
    canonical_url: ep.canonical_url,
    md_file: `md/${ep.md_filename}`,
    json_file: `json/${ep.json_filename}`,
  }));

  const registry: RegistryIndex = {
    schema_version: '1.2-agent-rag-index',
    updated_at: new Date().toISOString(),
    total_items: items.length,
    items,
  };

  fs.writeFileSync(REGISTRY_INDEX_PATH, JSON.stringify(registry, null, 2), 'utf8');
  return registry;
}

export function deleteEpisode(id: string, clearDedupeHash = false): boolean {
  const ep = getEpisodeById(id);
  if (!ep || !sqliteDb) return false;

  sqliteDb.prepare('DELETE FROM episodes WHERE id = ?').run(id);
  if (clearDedupeHash) {
    sqliteDb.prepare('DELETE FROM seen_hashes WHERE url_hash = ?').run(ep.url_hash);
  }

  // Remove exported files if present
  try {
    const audioFile = path.join(AUDIO_DIR, `${ep.id}.mp3`);
    if (fs.existsSync(audioFile)) fs.unlinkSync(audioFile);
    if (ep.md_filename) {
      const mdPath = path.join(EXPORT_MD_DIR, ep.md_filename);
      if (fs.existsSync(mdPath)) fs.unlinkSync(mdPath);
    }
    if (ep.json_filename) {
      const jsonPath = path.join(EXPORT_JSON_DIR, ep.json_filename);
      if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
    }
  } catch {
    // ignore cleanup errors
  }

  rebuildRegistryIndex();
  return true;
}

export function getDedupeStats(): { totalEpisodes: number; totalSeenHashes: number } {
  if (!sqliteDb) return { totalEpisodes: 0, totalSeenHashes: 0 };
  const epRow = sqliteDb.prepare('SELECT COUNT(*) as cnt FROM episodes').get() as { cnt: number };
  const seenRow = sqliteDb.prepare('SELECT COUNT(*) as cnt FROM seen_hashes').get() as { cnt: number };
  return {
    totalEpisodes: epRow?.cnt || 0,
    totalSeenHashes: seenRow?.cnt || 0,
  };
}

export function clearSeenHashes(): void {
  if (!sqliteDb) return;
  sqliteDb.prepare('DELETE FROM seen_hashes').run();
}

// --- FEED SOURCES CRUD ---
export function listFeedSources(): FeedSource[] {
  if (!sqliteDb) return DEFAULT_FEED_SOURCES;
  const rows = sqliteDb.prepare('SELECT * FROM feed_sources ORDER BY name ASC').all() as Array<{
    id: string;
    name: string;
    url: string;
    category: string;
    enabled: number;
    last_checked_at: string | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    url: r.url,
    category: r.category,
    enabled: Boolean(r.enabled),
    last_checked_at: r.last_checked_at,
  }));
}

export function addFeedSource(name: string, url: string, category = 'Custom Feed'): FeedSource {
  const id = `feed-${crypto.randomBytes(4).toString('hex')}`;
  const feed: FeedSource = {
    id,
    name: name.trim(),
    url: url.trim(),
    category: category.trim(),
    enabled: true,
    last_checked_at: null,
  };
  if (sqliteDb) {
    sqliteDb
      .prepare(`
        INSERT OR REPLACE INTO feed_sources (id, name, url, category, enabled, last_checked_at)
        VALUES (?, ?, ?, ?, 1, NULL)
      `)
      .run(feed.id, feed.name, feed.url, feed.category);
  }
  return feed;
}

export function toggleFeedSource(id: string, enabled: boolean): void {
  if (!sqliteDb) return;
  sqliteDb.prepare('UPDATE feed_sources SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
}

export function deleteFeedSource(id: string): void {
  if (!sqliteDb) return;
  sqliteDb.prepare('DELETE FROM feed_sources WHERE id = ?').run(id);
}

export function markFeedChecked(id: string): void {
  if (!sqliteDb) return;
  sqliteDb
    .prepare('UPDATE feed_sources SET last_checked_at = ? WHERE id = ?')
    .run(new Date().toISOString(), id);
}
