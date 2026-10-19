import React, { useState } from 'react';
import {
  Download,
  ExternalLink,
  FileText,
  FlaskConical,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { AppConfig, Episode, QueueStatus } from '../types.ts';
import { formatSeconds } from './MasterPlayer.tsx';

interface FeedViewProps {
  episodes: Episode[];
  selectedEpisodeId: string | null;
  playingEpisodeId: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  queueStatus: QueueStatus;
  dedupeStats: { totalEpisodes: number; totalSeenHashes: number };
  uiConfig: AppConfig['ui'];
  ttsConfig: AppConfig['tts'];
  isBatchTriggering: boolean;
  isTestGenerating: boolean;
  onSelectAndPlay: (ep: Episode) => void;
  onSelectForReader: (ep: Episode) => void;
  onSeekRatio: (ratio: number) => void;
  onTriggerBatch: () => void;
  onGenerateTestEpisode: () => void;
  onOpenCustomModal: () => void;
  onDeleteEpisode: (id: string) => void;
  onDownloadMarkdown: (ep: Episode) => void;
  onDownloadJson: (ep: Episode) => void;
  onClearQueue: () => void;
}

type OriginFilter = 'all' | 'discover' | 'custom' | 'test';

export const FeedView: React.FC<FeedViewProps> = ({
  episodes,
  selectedEpisodeId,
  playingEpisodeId,
  isPlaying,
  currentTime,
  duration,
  queueStatus,
  dedupeStats,
  uiConfig,
  ttsConfig,
  isBatchTriggering,
  isTestGenerating,
  onSelectAndPlay,
  onSelectForReader,
  onSeekRatio,
  onTriggerBatch,
  onGenerateTestEpisode,
  onOpenCustomModal,
  onDeleteEpisode,
  onDownloadMarkdown,
  onDownloadJson,
  onClearQueue,
}) => {
  const [filter, setFilter] = useState<OriginFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredEpisodes = episodes.filter((ep) => {
    if (filter === 'discover' && ep.origin_type !== 'discover_feed' && ep.origin_type !== 'android_webhook') {
      return false;
    }
    if (
      filter === 'custom' &&
      ep.origin_type !== 'custom_url' &&
      ep.origin_type !== 'custom_screenshot' &&
      ep.origin_type !== 'custom_text'
    ) {
      return false;
    }
    if (filter === 'test' && ep.origin_type !== 'test_episode') {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const hay = `${ep.title} ${ep.source} ${ep.author} ${ep.keywords.join(' ')} ${ep.summary_one_line}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const padClass =
    uiConfig.card_density === 'compact'
      ? 'p-3.5'
      : uiConfig.card_density === 'spacious'
      ? 'p-6'
      : 'p-4 sm:p-5';

  const titleClass =
    uiConfig.card_density === 'compact'
      ? 'text-sm sm:text-base'
      : uiConfig.card_density === 'spacious'
      ? 'text-lg sm:text-xl'
      : 'text-base sm:text-lg';

  const originLabelMap: Record<Episode['origin_type'], string> = {
    discover_feed: 'Discover Batch',
    android_webhook: 'Android Bridge',
    custom_url: 'Custom Link',
    custom_screenshot: 'Screenshot Vision',
    custom_text: 'Custom Text',
    test_episode: 'Calibration Test',
  };

  return (
    <div className="space-y-4">
      {/* Workspace Action & Telemetry Strip */}
      <div className="bg-[#13161C] border border-[#222631] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#9CA3AF]">
            <span className="font-semibold text-[#F3F4F6] tabular-nums">
              {episodes.length} episodes in SQLite
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              {dedupeStats.totalSeenHashes} deduplication hashes tracked
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              Next Pre-Gen: {ttsConfig.rate} / {ttsConfig.pitch}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onGenerateTestEpisode}
            disabled={isTestGenerating}
            className="px-3 py-2 rounded-lg border border-[#222631] bg-[#0B0D11] hover:border-[#33394A] text-xs font-medium text-[#F3F4F6] flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
          >
            {isTestGenerating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent)]" />
            ) : (
              <FlaskConical className="w-3.5 h-3.5 text-[var(--accent)]" />
            )}
            <span>Test Episode</span>
          </button>

          <button
            type="button"
            onClick={onTriggerBatch}
            disabled={isBatchTriggering}
            className="px-3.5 py-2 rounded-lg bg-[var(--accent)] text-[#0B0D11] hover:opacity-90 text-xs font-semibold flex items-center gap-1.5 transition-opacity whitespace-nowrap cursor-pointer disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isBatchTriggering || queueStatus.is_running ? 'animate-spin' : ''}`}
            />
            <span>
              {queueStatus.is_running ? 'Batch Running...' : 'Sync Feed Batch'}
            </span>
          </button>
        </div>
      </div>

      {/* Live Sequential Queue Manager Banner (Visible when active or queued) */}
      {(queueStatus.is_running || queueStatus.queued_count > 0) && (
        <div className="bg-[#13161C] border border-[var(--accent)]/50 rounded-2xl p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)] shrink-0" />
              <span className="text-xs sm:text-sm font-semibold text-[#F3F4F6] truncate">
                {queueStatus.currently_generating
                  ? queueStatus.currently_generating.title
                  : 'Preparing next queued item...'}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-mono tabular-nums text-[#9CA3AF]">
                {queueStatus.queued_count} waiting
              </span>
              {queueStatus.queued_count > 0 && (
                <button
                  type="button"
                  onClick={onClearQueue}
                  className="text-xs text-[#9CA3AF] hover:text-[#F3F4F6] underline cursor-pointer"
                >
                  Clear Pending
                </button>
              )}
            </div>
          </div>

          {queueStatus.currently_generating && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#9CA3AF]">
              <span>{queueStatus.currently_generating.stage}</span>
              <span className="font-mono tabular-nums text-[#6B7280]">
                Locked snapshot:{' '}
                {queueStatus.currently_generating.locked_voice
                  .replace(/^en-US-/, '')
                  .replace(/Neural$/, '')}{' '}
                ({queueStatus.currently_generating.locked_rate},{' '}
                {queueStatus.currently_generating.locked_pitch})
              </span>
            </div>
          )}
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Interactive Filter Segmented Control */}
        <div className="flex items-center gap-1 p-1 bg-[#13161C] border border-[#222631] rounded-xl overflow-x-auto">
          {(
            [
              { id: 'all', label: 'All Episodes' },
              { id: 'discover', label: 'Feed Batch' },
              { id: 'custom', label: 'Custom Ingest' },
              { id: 'test', label: 'Calibration' },
            ] as Array<{ id: OriginFilter; label: string }>
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filter === tab.id
                  ? 'bg-[#0B0D11] text-[#F3F4F6] shadow-xs'
                  : 'text-[#9CA3AF] hover:text-[#F3F4F6]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Live Search Input */}
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="w-3.5 h-3.5 text-[#6B7280] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search titles, sources, keywords..."
            className="w-full bg-[#13161C] border border-[#222631] rounded-xl pl-8 pr-3 py-1.5 text-xs text-[#F3F4F6] placeholder-[#6B7280] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>
      </div>

      {/* Empty State (Zero Hardcoded Content — Prompt User to Sync or Ingest) */}
      {filteredEpisodes.length === 0 && (
        <div className="bg-[#13161C] border border-[#222631] rounded-2xl p-8 sm:p-10 text-center space-y-4">
          <div className="max-w-md mx-auto space-y-2">
            <h3 className="font-display text-lg font-bold text-[#F3F4F6]">
              {episodes.length === 0
                ? 'Your Verbatim Audio Library Is Ready'
                : 'No Episodes Match Your Filter'}
            </h3>
            <p className="text-xs sm:text-sm text-[#9CA3AF] leading-relaxed">
              {episodes.length === 0
                ? 'This application starts with zero hardcoded episodes. Trigger an automated batch from your configured tech feeds, synthesize a calibration test episode, or bring your own custom URL or screenshot.'
                : 'Try clearing your search query or switching to the All Episodes filter.'}
            </p>
          </div>

          {episodes.length === 0 && (
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={onTriggerBatch}
                disabled={isBatchTriggering || queueStatus.is_running}
                className="px-4 py-2.5 rounded-xl bg-[var(--accent)] text-[#0B0D11] text-xs font-semibold hover:opacity-90 transition-opacity flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-4 h-4 ${
                    isBatchTriggering || queueStatus.is_running ? 'animate-spin' : ''
                  }`}
                />
                <span>Sync Feed Batch Now</span>
              </button>

              <button
                type="button"
                onClick={onGenerateTestEpisode}
                disabled={isTestGenerating}
                className="px-4 py-2.5 rounded-xl border border-[#222631] bg-[#0B0D11] text-[#F3F4F6] hover:border-[#33394A] text-xs font-semibold flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <FlaskConical className="w-4 h-4 text-[var(--accent)]" />
                <span>Generate Calibration Test Episode</span>
              </button>

              <button
                type="button"
                onClick={onOpenCustomModal}
                className="px-4 py-2.5 rounded-xl border border-[#222631] bg-[#0B0D11] text-[#F3F4F6] hover:border-[#33394A] text-xs font-semibold flex items-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4 text-[var(--accent)]" />
                <span>Bring Custom URL / Screenshot</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Dynamic Episode Cards */}
      <div className="space-y-3.5">
        {filteredEpisodes.map((ep) => {
          const isCurrentPlaying = playingEpisodeId === ep.id;
          const isSelected = selectedEpisodeId === ep.id;
          const shortVoice = ep.voice_used
            .replace(/^en-US-/, '')
            .replace(/Neural$/, '');
          const epDuration =
            isCurrentPlaying && duration > 0
              ? duration
              : ep.duration_estimate_sec || 60;
          const epProgress =
            isCurrentPlaying && epDuration > 0
              ? Math.min(100, Math.max(0, (currentTime / epDuration) * 100))
              : 0;

          return (
            <article
              key={ep.id}
              className={`bg-[#13161C] rounded-2xl border transition-colors ${padClass} ${
                isCurrentPlaying || isSelected
                  ? 'border-[var(--accent)]/70'
                  : 'border-[#222631] hover:border-[#33394A]'
              }`}
            >
              {/* Clean Unboxed Metadata Line (Zero-Pill Discipline) */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#9CA3AF] mb-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-[var(--accent)]">
                    {ep.source}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{originLabelMap[ep.origin_type]}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-[#F3F4F6]">{shortVoice}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums text-[#6B7280]">
                    {ep.tts_rate_used} / {ep.tts_pitch_used}
                  </span>
                </div>

                <div className="flex items-center gap-2 font-mono tabular-nums text-[11px] text-[#6B7280]">
                  <span>{ep.word_count} words</span>
                  <span aria-hidden="true">·</span>
                  <span>#{ep.url_hash.slice(0, 6)}</span>
                </div>
              </div>

              {/* Headline */}
              <h2
                onClick={() => onSelectAndPlay(ep)}
                className={`font-display ${titleClass} font-bold text-[#F3F4F6] leading-snug cursor-pointer hover:text-[var(--accent)] transition-colors mb-2`}
              >
                {ep.title}
              </h2>

              {/* One-Line Summary & Unboxed Keyword Trail */}
              <p className="text-xs text-[#9CA3AF] leading-relaxed mb-3 line-clamp-2">
                {ep.summary_one_line}
              </p>

              {ep.keywords && ep.keywords.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#6B7280] mb-3.5">
                  {ep.keywords.slice(0, 5).map((kw, idx) => (
                    <React.Fragment key={`${ep.id}-kw-${idx}`}>
                      {idx > 0 && <span aria-hidden="true">·</span>}
                      <span>{kw}</span>
                    </React.Fragment>
                  ))}
                </div>
              )}

              {/* Inline Card Transport Controls Right Underneath Article */}
              <div className="pt-3 border-t border-[#222631] flex flex-col gap-2.5">
                {isCurrentPlaying && (
                  <div className="flex items-center gap-2.5 text-[11px] font-mono tabular-nums text-[#9CA3AF]">
                    <span>{formatSeconds(currentTime)}</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={0.5}
                      value={epProgress}
                      onChange={(e) => onSeekRatio(parseFloat(e.target.value) / 100)}
                      className="w-full h-1.5 bg-[#0B0D11] rounded-lg cursor-pointer"
                    />
                    <span>{formatSeconds(epDuration)}</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectAndPlay(ep)}
                      className="px-3.5 py-1.5 rounded-lg bg-[var(--accent)] text-[#0B0D11] text-xs font-semibold flex items-center gap-1.5 hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap min-h-[36px]"
                    >
                      {isCurrentPlaying && isPlaying ? (
                        <>
                          <Pause className="w-3.5 h-3.5 fill-current" />
                          <span>Pause</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Listen Verbatim</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => onSelectForReader(ep)}
                      className="px-3 py-1.5 rounded-lg border border-[#222631] bg-[#0B0D11] hover:border-[#33394A] text-xs font-medium text-[#F3F4F6] flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap min-h-[36px]"
                    >
                      <FileText className="w-3.5 h-3.5 text-[var(--accent)]" />
                      <span>Read From Here</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onDownloadMarkdown(ep)}
                      title="Export Markdown (.md) with YAML Frontmatter"
                      className="px-2.5 py-1.5 rounded-lg border border-[#222631] bg-[#0B0D11] hover:border-[#33394A] text-xs font-mono text-[#9CA3AF] hover:text-[#F3F4F6] flex items-center gap-1 cursor-pointer min-h-[36px]"
                    >
                      <Download className="w-3 h-3" />
                      <span>.md</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDownloadJson(ep)}
                      title="Export Structured JSON (.json)"
                      className="px-2.5 py-1.5 rounded-lg border border-[#222631] bg-[#0B0D11] hover:border-[#33394A] text-xs font-mono text-[#9CA3AF] hover:text-[#F3F4F6] flex items-center gap-1 cursor-pointer min-h-[36px]"
                    >
                      <Download className="w-3 h-3" />
                      <span>.json</span>
                    </button>
                    <a
                      href={ep.canonical_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open Original Webpage"
                      className="p-2 rounded-lg border border-[#222631] bg-[#0B0D11] hover:border-[#33394A] text-[#9CA3AF] hover:text-[#F3F4F6] transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button
                      type="button"
                      onClick={() => onDeleteEpisode(ep.id)}
                      title="Delete Episode"
                      className="p-2 rounded-lg border border-[#222631] bg-[#0B0D11] hover:border-red-500/50 text-[#6B7280] hover:text-red-400 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
};
