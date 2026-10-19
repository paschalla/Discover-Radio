import crypto from 'crypto';
import path from 'path';
import express from 'express';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import {
  AppConfig,
  Episode,
  EpisodeOriginType,
  QueueStatus,
} from './src/types.ts';
import { EN_US_VOICES } from './src/server/voices.ts';
import {
  AUDIO_DIR,
  EXPORT_DIR,
  REGISTRY_INDEX_PATH,
  addFeedSource,
  canonicalizeUrl,
  clearSeenHashes,
  computeUrlHash,
  deleteEpisode,
  deleteFeedSource,
  getDedupeStats,
  getEpisodeById,
  isDuplicateContent,
  listEpisodes,
  listFeedSources,
  loadConfig,
  markFeedChecked,
  normalizeTitleSlug,
  rebuildRegistryIndex,
  saveConfig,
  saveEpisodeToDbAndVault,
  toggleFeedSource,
} from './src/server/db.ts';
import {
  buildParagraphSegments,
  extractFromScreenshotBuffer,
  fetchFeedItemsFromRss,
  formatVoiceShortName,
  processAndRouteContent,
  selectVoiceFromSnapshot,
  synthesizeEpisodeAudio,
} from './src/server/ttsAndScraper.ts';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

interface QueueTaskItem {
  id: string;
  url: string;
  titleHint?: string;
  sourceHint?: string;
  rawTextOverride?: string;
  originType: EpisodeOriginType;
  priority: 'immediate' | 'next';
  forceBypassDedupe?: boolean;
  overrideVoice?: string;
  overrideRate?: string;
  overridePitch?: string;
  queuedAt: string;
}

class GenerationQueueManager {
  private queue: QueueTaskItem[] = [];
  private isRunning = false;
  private currentlyGenerating: QueueStatus['currently_generating'] = null;
  private completedInSession = 0;
  private skippedDuplicatesCount = 0;
  private lastBatchRunAt: string | null = null;
  private lastError: string | null = null;

  public enqueue(task: QueueTaskItem): void {
    if (task.priority === 'immediate') {
      this.queue.unshift(task);
    } else {
      this.queue.push(task);
    }
    if (!this.isRunning) {
      void this.processLoop();
    }
  }

  public clearPending(): number {
    const count = this.queue.length;
    this.queue = [];
    return count;
  }

  public recordSkippedDuplicate(): void {
    this.skippedDuplicatesCount += 1;
  }

  public markBatchRun(): void {
    this.lastBatchRunAt = new Date().toISOString();
  }

  public getStatus(): QueueStatus {
    return {
      is_running: this.isRunning,
      currently_generating: this.currentlyGenerating,
      queued_count: this.queue.length,
      queued_items: this.queue.map((q) => ({
        id: q.id,
        title: q.titleHint || q.url,
        url: q.url,
        source: q.sourceHint || 'Web',
        origin_type: q.originType,
        priority: q.priority,
        queued_at: q.queuedAt,
      })),
      completed_in_session: this.completedInSession,
      skipped_duplicates_count: this.skippedDuplicatesCount,
      last_batch_run_at: this.lastBatchRunAt,
      last_error: this.lastError,
    };
  }

  private async processLoop(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift()!;

      // CRITICAL: Reload fresh config snapshot right before starting this item!
      // Any changes made to rate/pitch/voice pool while previous items were generating
      // take effect right here on the next queued item, while previous items stay immutable.
      const freshConfigSnapshot: AppConfig = JSON.parse(JSON.stringify(loadConfig()));
      const lockedVoice =
        task.overrideVoice || selectVoiceFromSnapshot(freshConfigSnapshot.tts);
      const lockedRate = task.overrideRate || freshConfigSnapshot.tts.rate || '+5%';
      const lockedPitch = task.overridePitch || freshConfigSnapshot.tts.pitch || '+0Hz';

      this.currentlyGenerating = {
        id: task.id,
        title: task.titleHint || task.url,
        source: task.sourceHint || 'Web',
        origin_type: task.originType,
        locked_voice: lockedVoice,
        locked_rate: lockedRate,
        locked_pitch: lockedPitch,
        stage: 'Checking deduplication & scraping source DOM...',
        started_at: new Date().toISOString(),
      };

      try {
        await this.executeTask(task, freshConfigSnapshot, lockedVoice, lockedRate, lockedPitch);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[QueueWorker] Error processing task ${task.id}:`, msg);
        this.lastError = msg;
      }

      this.currentlyGenerating = null;
    }

    this.isRunning = false;
  }

  public async executeTask(
    task: QueueTaskItem,
    cfgSnapshot: AppConfig,
    lockedVoice: string,
    lockedRate: string,
    lockedPitch: string
  ): Promise<Episode | null> {
    // 1. Check multi-layer deduplication unless bypassed (e.g., calibration test or forced custom)
    if (!task.forceBypassDedupe) {
      const dedupe = isDuplicateContent(
        task.url,
        task.titleHint || '',
        cfgSnapshot.scraper.dedupe_title_similarity
      );
      if (dedupe.duplicate) {
        this.skippedDuplicatesCount += 1;
        return null;
      }
    }

    if (this.currentlyGenerating && this.currentlyGenerating.id === task.id) {
      this.currentlyGenerating.stage = 'Extracting verbatim script & cleaning popups...';
    }

    // 2. Smart content routing & verbatim cleaning
    const processed = await processAndRouteContent({
      url: task.url,
      titleHint: task.titleHint,
      sourceHint: task.sourceHint,
      rawTextOverride: task.rawTextOverride,
      cfg: cfgSnapshot,
    });

    if (processed.skipped) {
      this.skippedDuplicatesCount += 1;
      return null;
    }

    // Double check title slug deduplication after full title resolution
    if (!task.forceBypassDedupe) {
      const postDedupe = isDuplicateContent(
        task.url,
        processed.resolvedTitle,
        cfgSnapshot.scraper.dedupe_title_similarity
      );
      if (postDedupe.duplicate) {
        this.skippedDuplicatesCount += 1;
        return null;
      }
    }

    const voiceShort = formatVoiceShortName(lockedVoice);
    let introLine = `${processed.resolvedTitle}. Published on ${processed.source} by ${processed.author}.`;
    if (cfgSnapshot.tts.announce_persona) {
      introLine += ` Read by ${voiceShort}.`;
    }
    const fullSpokenScript = `${introLine}\n\n${processed.verbatimScript}`;

    if (this.currentlyGenerating && this.currentlyGenerating.id === task.id) {
      this.currentlyGenerating.title = processed.resolvedTitle;
      this.currentlyGenerating.source = processed.source;
      this.currentlyGenerating.stage = `Synthesizing Edge-TTS (${voiceShort} @ ${lockedRate}, ${lockedPitch})...`;
    }

    const episodeId =
      task.originType === 'test_episode'
        ? `test_${crypto.randomBytes(5).toString('hex')}`
        : computeUrlHash(task.url);

    // 3. Pre-Generation Neural Edge-TTS Audio Synthesis
    const { audioUrl, durationEstimateSec } = await synthesizeEpisodeAudio(
      fullSpokenScript,
      lockedVoice,
      lockedRate,
      lockedPitch,
      episodeId
    );

    const paragraphs = buildParagraphSegments(fullSpokenScript);
    const wordCount = fullSpokenScript.split(/\s+/).filter(Boolean).length;

    const episode: Episode = {
      id: episodeId,
      url_hash: episodeId,
      title_slug: normalizeTitleSlug(processed.resolvedTitle),
      canonical_url: canonicalizeUrl(task.url),
      title: processed.resolvedTitle,
      source: processed.source,
      author: processed.author,
      origin_type: task.originType,
      content_type:
        task.originType === 'test_episode' ? 'calibration' : processed.contentType,
      voice_used: lockedVoice,
      tts_rate_used: lockedRate,
      tts_pitch_used: lockedPitch,
      audio_url: audioUrl,
      duration_estimate_sec: durationEstimateSec,
      word_count: wordCount,
      keywords: processed.keywords,
      summary_one_line: processed.summaryOneLine,
      verbatim_script: fullSpokenScript,
      paragraphs,
      extracted_links: processed.extractedLinks,
      md_filename: '',
      json_filename: '',
      created_at: new Date().toISOString(),
    };

    const saved = saveEpisodeToDbAndVault(episode, cfgSnapshot.export);
    this.completedInSession += 1;
    return saved;
  }
}

const queueManager = new GenerationQueueManager();

// --- SCHEDULED FEED SYNC POLLER ---
let cronTimer: NodeJS.Timeout | null = null;

async function runAutomatedFeedBatch(maxOverride?: number): Promise<{
  polledFeeds: number;
  enqueuedCount: number;
  skippedCount: number;
}> {
  const cfg = loadConfig();
  const maxBatch = maxOverride ?? cfg.scraper.max_articles_per_batch;
  const feeds = listFeedSources().filter((f) => f.enabled);
  queueManager.markBatchRun();

  let enqueuedCount = 0;
  let skippedCount = 0;
  const perFeedCap = Math.max(2, Math.ceil(maxBatch / Math.max(1, feeds.length)));

  for (const feed of feeds) {
    if (enqueuedCount >= maxBatch) break;
    const items = await fetchFeedItemsFromRss(feed.url, feed.name, perFeedCap);
    markFeedChecked(feed.id);

    for (const item of items) {
      if (enqueuedCount >= maxBatch) break;
      const check = isDuplicateContent(
        item.url,
        item.title,
        cfg.scraper.dedupe_title_similarity
      );
      if (check.duplicate) {
        skippedCount += 1;
        queueManager.recordSkippedDuplicate();
        continue;
      }

      queueManager.enqueue({
        id: computeUrlHash(item.url),
        url: item.url,
        titleHint: item.title,
        sourceHint: item.source,
        originType: 'discover_feed',
        priority: 'next',
        queuedAt: new Date().toISOString(),
      });
      enqueuedCount += 1;
    }
  }

  return {
    polledFeeds: feeds.length,
    enqueuedCount,
    skippedCount,
  };
}

function scheduleCronJob(intervalHours: number): void {
  if (cronTimer) {
    clearInterval(cronTimer);
  }
  const safeHours = Math.max(1, Math.min(48, intervalHours || 12));
  const ms = safeHours * 60 * 60 * 1000;
  cronTimer = setInterval(() => {
    void runAutomatedFeedBatch();
  }, ms);
}

scheduleCronJob(loadConfig().scraper.interval_hours);

// --- EXPRESS SERVER SETUP ---
async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Static serving of generated MP3 files and RAG export files
  app.use('/api/audio', express.static(AUDIO_DIR));
  app.use('/api/exports', express.static(EXPORT_DIR));

  // 1. GET /api/episodes (Dynamic SQLite fetch - ZERO hardcoded episodes)
  app.get('/api/episodes', (_req, res) => {
    const episodes = listEpisodes(100);
    const stats = getDedupeStats();
    res.json({
      episodes,
      stats,
    });
  });

  // 2. DELETE /api/episodes/:id
  app.delete('/api/episodes/:id', (req, res) => {
    const clearHash = req.query.clearHash === 'true';
    const deleted = deleteEpisode(req.params.id, clearHash);
    if (!deleted) {
      res.status(404).json({ error: 'Episode not found' });
      return;
    }
    res.json({ status: 'deleted', id: req.params.id, clearHash });
  });

  // 3. GET /api/config & POST /api/config
  app.get('/api/config', (_req, res) => {
    res.json({
      config: loadConfig(),
      available_voices: EN_US_VOICES,
      dedupe_stats: getDedupeStats(),
    });
  });

  app.post('/api/config', (req, res) => {
    const prevCfg = loadConfig();
    const updated = saveConfig(req.body as AppConfig);
    if (prevCfg.scraper.interval_hours !== updated.scraper.interval_hours) {
      scheduleCronJob(updated.scraper.interval_hours);
    }
    res.json({
      status: 'saved',
      config: updated,
      note: 'Saved to config.json. Pre-generation TTS changes apply to the next queued episode or batch.',
    });
  });

  // 4. GET /api/queue & POST /api/queue/clear
  app.get('/api/queue', (_req, res) => {
    res.json(queueManager.getStatus());
  });

  app.post('/api/queue/clear', (_req, res) => {
    const cleared = queueManager.clearPending();
    res.json({ status: 'cleared', clearedCount: cleared });
  });

  app.post('/api/dedupe/clear', (_req, res) => {
    clearSeenHashes();
    res.json({ status: 'cleared_seen_hashes', dedupe_stats: getDedupeStats() });
  });

  // 5. POST /api/episodes/test (On-Demand Pre-Generation Calibration Test Episode)
  app.post('/api/episodes/test', async (req, res) => {
    try {
      const cfg = loadConfig();
      const customRate = req.body?.rate || cfg.tts.rate || '+5%';
      const customPitch = req.body?.pitch || cfg.tts.pitch || '+0Hz';
      const customVoice =
        req.body?.voice || selectVoiceFromSnapshot(cfg.tts);
      const shortVoice = formatVoiceShortName(customVoice);

      const testTask: QueueTaskItem = {
        id: `test_${crypto.randomBytes(4).toString('hex')}`,
        url: `https://discover-radio.local/calibration/${Date.now()}`,
        titleHint: `Pre-Generation Calibration: ${shortVoice} (${customRate} Rate, ${customPitch} Pitch)`,
        sourceHint: 'Edge-TTS Neural Calibration',
        originType: 'test_episode',
        priority: 'immediate',
        forceBypassDedupe: true,
        overrideVoice: customVoice,
        overrideRate: customRate,
        overridePitch: customPitch,
        rawTextOverride: `This is an on-demand pre-generation calibration episode synthesized with Microsoft Edge Neural voice ${shortVoice}.

Your speech prosody parameters for this generation were locked at a speech rate of ${customRate} and a vocal pitch shift of ${customPitch} prior to rendering the audio stream. Because rate and pitch are injected directly into the neural synthesizer rather than time-stretched in the browser player, vocal formants and phrasing cadence remain crisp and natural.

If you adjust your voice rotation pool, speech rate, or pitch sliders while a batch is actively running, previously generated episodes and any currently synthesizing episode remain untouched, while the very next queued episode immediately picks up your updated configuration.`,
        queuedAt: new Date().toISOString(),
      };

      const ep = await queueManager.executeTask(
        testTask,
        cfg,
        customVoice,
        customRate,
        customPitch
      );
      res.json({ status: 'generated', episode: ep });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // 6. POST /api/episodes/custom (Bring Your Own Content: URL, Screenshot Vision, or Raw Text)
  app.post('/api/episodes/custom', upload.single('screenshot'), async (req, res) => {
    try {
      const priority = req.body.priority === 'next' ? 'next' : 'immediate';
      let url = (req.body.url || '').trim();
      let titleHint = (req.body.title_hint || '').trim();
      let sourceHint = (req.body.source_hint || '').trim();
      let rawText = (req.body.raw_text || '').trim();
      let originType: EpisodeOriginType = 'custom_url';

      // Handle Screenshot Upload via Gemini 3.8 Flash Vision
      if (req.file) {
        originType = 'custom_screenshot';
        const vision = await extractFromScreenshotBuffer(
          req.file.buffer,
          req.file.mimetype
        );
        titleHint = titleHint || vision.headline;
        sourceHint = sourceHint || vision.publicationSource;
        if (vision.detectedUrl && vision.detectedUrl.startsWith('http')) {
          url = vision.detectedUrl;
        } else {
          url = `https://screenshot.ingest/${normalizeTitleSlug(titleHint || 'capture')}-${Date.now()}`;
          rawText = vision.visibleBodyText;
        }
      } else if (rawText && !url) {
        originType = 'custom_text';
        titleHint = titleHint || rawText.split('\n')[0].slice(0, 70) || 'Custom Text Read-Through';
        sourceHint = sourceHint || 'Direct Text Ingest';
        url = `https://text.ingest/${normalizeTitleSlug(titleHint)}-${Date.now()}`;
      }

      if (!url) {
        res.status(400).json({ error: 'Please provide a target URL, a screenshot image, or raw text.' });
        return;
      }

      const task: QueueTaskItem = {
        id: computeUrlHash(url),
        url,
        titleHint: titleHint || undefined,
        sourceHint: sourceHint || undefined,
        rawTextOverride: rawText || undefined,
        originType,
        priority,
        forceBypassDedupe: true,
        queuedAt: new Date().toISOString(),
      };

      queueManager.enqueue(task);
      res.json({
        status: 'queued',
        priority,
        task_id: task.id,
        queue: queueManager.getStatus(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // 7. POST /api/webhook/discover (Android Native Companion / MacroDroid / Tasker / Playwright Bridge)
  app.post('/api/webhook/discover', (req, res) => {
    const items = Array.isArray(req.body.items)
      ? req.body.items
      : req.body.url
      ? [req.body]
      : [];

    if (items.length === 0) {
      res.status(400).json({ error: 'Expected { url, title?, source? } or { items: [...] }' });
      return;
    }

    const cfg = loadConfig();
    let enqueued = 0;
    let skipped = 0;

    for (const item of items) {
      if (!item.url) continue;
      const check = isDuplicateContent(
        item.url,
        item.title || '',
        cfg.scraper.dedupe_title_similarity
      );
      if (check.duplicate && !item.force) {
        skipped += 1;
        queueManager.recordSkippedDuplicate();
        continue;
      }

      queueManager.enqueue({
        id: computeUrlHash(item.url),
        url: item.url,
        titleHint: item.title,
        sourceHint: item.source || 'Android Discover Bridge',
        originType: 'android_webhook',
        priority: item.priority === 'immediate' ? 'immediate' : 'next',
        queuedAt: new Date().toISOString(),
      });
      enqueued += 1;
    }

    res.json({
      status: 'accepted',
      enqueued,
      skipped,
      queue: queueManager.getStatus(),
    });
  });

  // 8. POST /api/batch/run (Trigger Automated RSS / Discover Feed Poll Now)
  app.post('/api/batch/run', async (req, res) => {
    try {
      const maxItems = req.body?.max_items ? Number(req.body.max_items) : undefined;
      const result = await runAutomatedFeedBatch(maxItems);
      res.json({
        status: 'batch_queued',
        ...result,
        queue: queueManager.getStatus(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // 9. Feed Sources Management Endpoints
  app.get('/api/feeds', (_req, res) => {
    res.json({ feeds: listFeedSources() });
  });

  app.post('/api/feeds', (req, res) => {
    const { name, url, category } = req.body;
    if (!name || !url) {
      res.status(400).json({ error: 'Name and URL are required' });
      return;
    }
    const feed = addFeedSource(name, url, category || 'Custom Feed');
    res.json({ feed, feeds: listFeedSources() });
  });

  app.patch('/api/feeds/:id', (req, res) => {
    toggleFeedSource(req.params.id, Boolean(req.body.enabled));
    res.json({ feeds: listFeedSources() });
  });

  app.delete('/api/feeds/:id', (req, res) => {
    deleteFeedSource(req.params.id);
    res.json({ feeds: listFeedSources() });
  });

  // 10. Agent RAG Vault & Two-Stage Retrieval Endpoint
  app.get('/api/vault/registry', (_req, res) => {
    const registry = rebuildRegistryIndex();
    res.json(registry);
  });

  app.post('/api/vault/rag-query', async (req, res) => {
    const query = (req.body?.query || '').trim();
    if (!query) {
      res.status(400).json({ error: 'Query is required' });
      return;
    }

    const registry = rebuildRegistryIndex();
    const allEpisodes = listEpisodes(200);
    if (allEpisodes.length === 0) {
      res.json({
        answer: 'Your RAG Knowledge Vault is currently empty. Sync a batch or ingest an article first.',
        matched_episodes: [],
      });
      return;
    }

    // Stage 1: Score registry_index.json entries by query tokens against title, keywords, source, summary
    const tokens = query
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t: string) => t.length >= 2);

    const scored = allEpisodes
      .map((ep) => {
        const hay = `${ep.title} ${ep.source} ${ep.author} ${ep.keywords.join(' ')} ${ep.summary_one_line}`.toLowerCase();
        let score = 0;
        for (const tok of tokens) {
          if (hay.includes(tok)) score += 3;
          if (ep.verbatim_script.toLowerCase().includes(tok)) score += 1;
        }
        return { ep, score };
      })
      .sort((a, b) => b.score - a.score);

    const topMatches = scored.slice(0, 3).map((s) => s.ep);

    // Stage 2: Ingest full verbatim text of top matched documents for grounded RAG response
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey !== 'MY_GEMINI_API_KEY') {
      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });
        const contextDocs = topMatches
          .map(
            (ep, idx) =>
              `--- SOURCE DOC ${idx + 1}: "${ep.title}" (${ep.source}, Captured: ${ep.created_at}, ID: ${ep.id}) ---\n${ep.verbatim_script.slice(0, 12000)}`
          )
          .join('\n\n');

        const ragPrompt = `You are a precision RAG research assistant querying the user's Discover Audio Knowledge Vault.
Answer the user's question strictly using the verbatim source documents below. Cite the exact article title and source when stating specs, quotes, or facts.

USER QUESTION:
${query}

RETRIEVED VERBATIM SOURCE DOCUMENTS:
${contextDocs}`;

        const resp = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: ragPrompt,
        });

        res.json({
          stage1_scanned_count: registry.total_items,
          matched_episodes: topMatches.map((m) => ({
            id: m.id,
            title: m.title,
            source: m.source,
            captured_at: m.created_at,
            md_filename: m.md_filename,
          })),
          answer: resp.text || 'No response generated.',
        });
        return;
      } catch (err) {
        console.warn('RAG Gemini query error, falling back to direct excerpt:', err);
      }
    }

    // Fallback excerpt if API key not active
    const best = topMatches[0];
    res.json({
      stage1_scanned_count: registry.total_items,
      matched_episodes: topMatches.map((m) => ({
        id: m.id,
        title: m.title,
        source: m.source,
        captured_at: m.created_at,
        md_filename: m.md_filename,
      })),
      answer: `Top matched article in registry_index.json: "${best.title}" (${best.source}).\n\nVerbatim Excerpt:\n${best.verbatim_script.slice(0, 900)}...`,
    });
  });

  // 11. Exportable Playwright Mobile Cookie Scraper Script
  app.get('/api/bridges/playwright-script', (req, res) => {
    const cfg = loadConfig();
    const hostUrl =
      process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const scriptContent = `/**
 * Discover Audio Radio — Automated Mobile Google Discover Scraper (Playwright)
 * Configured Scroll Depth: ${cfg.scraper.scroll_depth}x | Interval: Every ${cfg.scraper.interval_hours}h
 *
 * Usage:
 *   1. npm install playwright
 *   2. Save your logged-in mobile Chrome Google session state to ./google_auth_state.json
 *   3. Run: node discover_scraper.js
 */
const { chromium, devices } = require('playwright');

const TARGET_WEBHOOK = "${hostUrl.replace(/\/$/, '')}/api/webhook/discover";
const SCROLL_DEPTH = ${cfg.scraper.scroll_depth};

(async () => {
  const pixel = devices['Pixel 7'];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...pixel,
    storageState: './google_auth_state.json'
  });

  const page = await context.newPage();
  await page.goto('https://www.google.com', { waitUntil: 'networkidle' });

  for (let i = 0; i < SCROLL_DEPTH; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
    await page.waitForTimeout(1500);
  }

  const cards = await page.evaluate(() => {
    const items = [];
    document.querySelectorAll('a[href^="http"]').forEach(el => {
      const titleEl = el.querySelector('div[role="heading"], h3, h2');
      if (titleEl && el.href && !el.href.includes('google.com')) {
        items.push({
          title: titleEl.innerText.trim(),
          url: el.href,
          source: new URL(el.href).hostname.replace(/^www\\./, '')
        });
      }
    });
    return items;
  });

  console.log(\`Extracted \${cards.length} Discover cards. Posting to \${TARGET_WEBHOOK}...\`);
  const response = await fetch(TARGET_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: cards })
  });
  console.log('Webhook response:', await response.json());
  await browser.close();
})();
`;
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="discover_scraper.js"'
    );
    res.send(scriptContent);
  });

  // 12. Live Standards-Compliant Podcast RSS 2.0 Feed (/api/rss.xml)
  app.get('/api/rss.xml', (req, res) => {
    const hostUrl = (
      process.env.APP_URL || `${req.protocol}://${req.get('host')}`
    ).replace(/\/$/, '');
    const episodes = listEpisodes(100);

    const escapeXml = (str: string) =>
      str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

    const itemsXml = episodes
      .map((ep) => {
        const audioFullUrl = `${hostUrl}${ep.audio_url}`;
        const pubDate = new Date(ep.created_at).toUTCString();
        return `    <item>
      <title>${escapeXml(ep.title)}</title>
      <link>${escapeXml(ep.canonical_url)}</link>
      <guid isPermaLink="false">${escapeXml(ep.id)}</guid>
      <pubDate>${pubDate}</pubDate>
      <author>${escapeXml(ep.author)} (${escapeXml(ep.source)})</author>
      <description>${escapeXml(
        `[${ep.source} · Voice: ${ep.voice_used} (${ep.tts_rate_used}, ${ep.tts_pitch_used})] ${ep.summary_one_line}`
      )}</description>
      <enclosure url="${escapeXml(audioFullUrl)}" length="${
        ep.duration_estimate_sec * 16000
      }" type="audio/mpeg" />
    </item>`;
      })
      .join('\n');

    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Discover Audio Radio (Verbatim Feed)</title>
    <link>${escapeXml(hostUrl)}</link>
    <description>Automated 100% verbatim audio read-through of your personalized Google Discover and custom tech feed.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${itemsXml}
  </channel>
</rss>`;

    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.send(rssXml);
  });

  // Mount Vite Dev Server or Static Build
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Discover Audio Radio & Agent Vault listening on http://localhost:${PORT}`);
  });
}

void startServer();
