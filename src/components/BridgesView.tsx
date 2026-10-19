import React, { useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  Download,
  Plus,
  Radio,
  Rss,
  Send,
  Smartphone,
  Trash2,
} from 'lucide-react';
import { AppConfig, FeedSource } from '../types.ts';

interface BridgesViewProps {
  feeds: FeedSource[];
  scraperConfig: AppConfig['scraper'];
  onAddFeed: (name: string, url: string, category: string) => Promise<void>;
  onToggleFeed: (id: string, enabled: boolean) => Promise<void>;
  onDeleteFeed: (id: string) => Promise<void>;
  onWebhookSubmitted: () => void;
}

export const BridgesView: React.FC<BridgesViewProps> = ({
  feeds,
  scraperConfig,
  onAddFeed,
  onToggleFeed,
  onDeleteFeed,
  onWebhookSubmitted,
}) => {
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newCategory, setNewCategory] = useState('Hardware & Tech');
  const [copiedRss, setCopiedRss] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState<string | null>(null);

  const originUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const rssFeedUrl = `${originUrl}/api/rss.xml`;
  const webhookUrl = `${originUrl}/api/webhook/discover`;

  const handleCopyRss = async () => {
    await navigator.clipboard.writeText(rssFeedUrl);
    setCopiedRss(true);
    setTimeout(() => setCopiedRss(false), 2000);
  };

  const handleCopyWebhook = async () => {
    await navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  const handleCreateFeed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newUrl.trim()) return;
    await onAddFeed(newName.trim(), newUrl.trim(), newCategory.trim());
    setNewName('');
    setNewUrl('');
  };

  const handleTestWebhookBridge = async () => {
    setWebhookStatus('Sending sample Discover card via POST /api/webhook/discover...');
    try {
      const res = await fetch('/api/webhook/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://www.tomshardware.com/tech-industry/semiconductors',
          title: 'Android Discover Bridge Live Webhook Test Card',
          source: 'Android Discover Webhook',
          priority: 'immediate',
          force: true,
        }),
      });
      const data = await res.json();
      setWebhookStatus(
        `Accepted: ${data.enqueued} enqueued (${data.skipped} skipped dupes). Synthesizing now!`
      );
      onWebhookSubmitted();
    } catch (err) {
      setWebhookStatus(err instanceof Error ? err.message : 'Webhook test failed');
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Live Podcast RSS Feed Card */}
      <div className="bg-[#13161C] border border-[#222631] rounded-2xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-display text-lg font-bold text-[#F3F4F6] flex items-center gap-2">
            <Rss className="w-5 h-5 text-[var(--accent)]" />
            <span>Live Podcast RSS 2.0 Feed (AntennaPod / Pocket Casts)</span>
          </h2>
          <p className="text-xs sm:text-sm text-[#9CA3AF] max-w-2xl leading-relaxed">
            Paste this RSS URL into any Android podcast player to automatically download your verbatim audio episodes for offline and Android Auto playback.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <code className="px-3 py-2 rounded-xl bg-[#0B0D11] border border-[#222631] text-xs font-mono text-[#F3F4F6] select-all">
            {rssFeedUrl}
          </code>
          <button
            type="button"
            onClick={handleCopyRss}
            className="px-3.5 py-2 rounded-xl bg-[var(--accent)] text-[#0B0D11] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            {copiedRss ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedRss ? 'Copied RSS URL' : 'Copy RSS URL'}</span>
          </button>
          <a
            href="/api/rss.xml"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 rounded-xl border border-[#222631] bg-[#0B0D11] text-xs font-medium text-[#9CA3AF] hover:text-[#F3F4F6]"
          >
            Open XML
          </a>
        </div>
      </div>

      {/* 2. Two-Column Companion Bridges: Android Native Webhook + Playwright Mobile Cookie Scraper */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Android Native Discover Bridge */}
        <div className="bg-[#13161C] border border-[#222631] rounded-2xl p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-bold text-[#F3F4F6] flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-[var(--accent)]" />
                <span>Android Native Discover Webhook Bridge</span>
              </h3>
              <p className="text-xs text-[#9CA3AF] mt-1 leading-relaxed">
                Send single URLs or scraped card arrays from Android HTTP Shortcuts, Tasker, or MacroDroid directly into the deduplicating synthesis queue.
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopyWebhook}
              className="px-3 py-1.5 rounded-lg border border-[#222631] bg-[#0B0D11] text-xs font-mono text-[#F3F4F6] flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              {copiedWebhook ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copiedWebhook ? 'Copied' : 'Copy Endpoint'}</span>
            </button>
          </div>

          <pre className="bg-[#0B0D11] border border-[#222631] rounded-xl p-3 text-[11px] font-mono text-[#9CA3AF] overflow-x-auto select-text">
{`POST ${webhookUrl}
Content-Type: application/json

{
  "url": "https://replit.com/blog/bring-your-own-cloud",
  "title": "Bring Your Own Cloud to Replit",
  "source": "Android Share Sheet",
  "priority": "immediate"
}`}
          </pre>

          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-xs text-[#9CA3AF]">
              {webhookStatus || 'Ready to receive POST payloads'}
            </span>
            <button
              type="button"
              onClick={handleTestWebhookBridge}
              className="px-3.5 py-2 rounded-xl border border-[#222631] bg-[#0B0D11] hover:border-[var(--accent)] text-xs font-semibold text-[#F3F4F6] flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>Test Webhook Ingest</span>
            </button>
          </div>
        </div>

        {/* Exportable Playwright Mobile Cookie Scraper */}
        <div className="bg-[#13161C] border border-[#222631] rounded-2xl p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-bold text-[#F3F4F6] flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-[var(--accent)]" />
                  <span>Playwright Mobile Cookie Scraper Script</span>
                </h3>
                <p className="text-xs text-[#9CA3AF] mt-1 leading-relaxed">
                  Emulates a Pixel 7 mobile Chrome session with your saved Google auth state, scrolls{' '}
                  <span className="font-mono text-[#F3F4F6]">{scraperConfig.scroll_depth}x</span> down{' '}
                  <code className="font-mono">google.com</code>, and POSTs all Discover cards to your webhook.
                </p>
              </div>
              <a
                href="/api/bridges/playwright-script"
                download="discover_scraper.js"
                className="px-3.5 py-2 rounded-xl bg-[var(--accent)] text-[#0B0D11] text-xs font-semibold flex items-center gap-1.5 shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>discover_scraper.js</span>
              </a>
            </div>

            <pre className="bg-[#0B0D11] border border-[#222631] rounded-xl p-3 text-[11px] font-mono text-[#9CA3AF] overflow-x-auto select-text">
{`# Run every ${scraperConfig.interval_hours} hours via Cron / systemd / n8n:
npm install playwright
node discover_scraper.js  # Uses Scroll Depth = ${scraperConfig.scroll_depth}x`}
            </pre>
          </div>

          <p className="text-[11px] text-[#6B7280]">
            Note: Scroll depth ({scraperConfig.scroll_depth}x) and cron interval ({scraperConfig.interval_hours}h) inside the downloaded script automatically sync with your Tune settings.
          </p>
        </div>
      </div>

      {/* 3. Configurable Tech / Topic & Google News RSS Feed Sources */}
      <div className="bg-[#13161C] border border-[#222631] rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#222631] pb-3.5">
          <div>
            <h3 className="font-display text-base font-bold text-[#F3F4F6] flex items-center gap-2">
              <Radio className="w-4 h-4 text-[var(--accent)]" />
              <span>Automated Feed Sources (Polled Every {scraperConfig.interval_hours}h)</span>
            </h3>
            <p className="text-xs text-[#9CA3AF] mt-0.5">
              Enable, disable, or add any publisher RSS, Atom, or Google News Topic feed URL to include in scheduled batches.
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-[#9CA3AF]">
            {feeds.filter((f) => f.enabled).length} of {feeds.length} active
          </span>
        </div>

        {/* Add New Feed Form */}
        <form onSubmit={handleCreateFeed} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Publisher or Topic Name (e.g. Hackaday)"
            className="sm:col-span-3 bg-[#0B0D11] border border-[#222631] rounded-xl px-3 py-2 text-xs text-[#F3F4F6] placeholder-[#6B7280]"
          />
          <input
            type="url"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://hackaday.com/blog/feed/ or Google News RSS URL"
            className="sm:col-span-5 bg-[#0B0D11] border border-[#222631] rounded-xl px-3 py-2 text-xs text-[#F3F4F6] placeholder-[#6B7280]"
          />
          <input
            type="text"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="Category"
            className="sm:col-span-2 bg-[#0B0D11] border border-[#222631] rounded-xl px-3 py-2 text-xs text-[#F3F4F6] placeholder-[#6B7280]"
          />
          <button
            type="submit"
            className="sm:col-span-2 px-3 py-2 rounded-xl bg-[var(--accent)] text-[#0B0D11] text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Feed</span>
          </button>
        </form>

        {/* Feed List */}
        <div className="divide-y divide-[#222631] border border-[#222631] rounded-xl bg-[#0B0D11] overflow-hidden">
          {feeds.map((feed) => (
            <div
              key={feed.id}
              className="p-3.5 flex items-center justify-between gap-3"
            >
              <label className="flex items-center gap-3 cursor-pointer min-w-0 flex-1">
                <input
                  type="checkbox"
                  checked={feed.enabled}
                  onChange={(e) => onToggleFeed(feed.id, e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#F3F4F6]">
                    <span>{feed.name}</span>
                    <span className="text-[#6B7280] font-normal">· {feed.category}</span>
                  </div>
                  <div className="text-[11px] font-mono text-[#9CA3AF] truncate">
                    {feed.url}
                  </div>
                </div>
              </label>

              <div className="flex items-center gap-3 shrink-0">
                {feed.last_checked_at && (
                  <span className="hidden sm:inline text-[11px] font-mono tabular-nums text-[#6B7280]">
                    Polled {new Date(feed.last_checked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onDeleteFeed(feed.id)}
                  title="Remove feed source"
                  className="p-1.5 rounded-lg text-[#6B7280] hover:text-red-400 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
