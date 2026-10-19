import React, { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileText,
  FlaskConical,
  History,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Shuffle,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { AppConfig, Episode, ListeningHistoryItem, PlayerPersistedState, QueueStatus } from '../types.ts';
import { formatRelativeTime } from '../hooks/useListeningHistory.ts';
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
  history: Record<string, ListeningHistoryItem>;
  resumeState: PlayerPersistedState | null;
  isShuffleMode: boolean;
  feedSubView?: 'feed' | 'history';
  onToggleShuffle: () => void;
  onClearHistory: () => void;
  onChangeFeedSubView?: (subView: 'feed' | 'history') => void;
  onDismissResumeBanner?: () => void;
  onSelectAndPlay: (ep: Episode, startRatio?: number) => void;
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

type OriginFilter = 'all' | 'unread' | 'discover' | 'custom' | 'test';

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
  history,
  resumeState,
  isShuffleMode,
  feedSubView: externalSubView,
  onToggleShuffle,
  onClearHistory,
  onChangeFeedSubView,
  onDismissResumeBanner,
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
  const [internalSubView, setInternalSubView] = useState<'feed' | 'history'>('feed');
  const [filter, setFilter] = useState<OriginFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [isResumeBannerDismissed, setIsResumeBannerDismissed] = useState(false);
  const [isConfirmingClearHistory, setIsConfirmingClearHistory] = useState(false);

  const subView = externalSubView ?? internalSubView;
  const setSubView = (val: 'feed' | 'history') => {
    setInternalSubView(val);
    onChangeFeedSubView?.(val);
  };

  // Find resume episode if saved in resumeState
  const resumeEpisode =
    resumeState && !isResumeBannerDismissed
      ? episodes.find((ep) => ep.id === resumeState.episode_id)
      : null;

  // Unlistened episodes count
  const unlistenedCount = episodes.filter((ep) => {
    const item = history[ep.id];
    return !item?.completed;
  }).length;

  // History list sorted newest first
  const historyList = Object.values(history).sort(
    (a, b) => new Date(b.last_played_at).getTime() - new Date(a.last_played_at).getTime()
  );

  const filteredHistoryList = historyList.filter((item) => {
    if (!historySearchQuery.trim()) return true;
    const q = historySearchQuery.toLowerCase();
    return (
      item.title.toLowerCase().includes(q) ||
      item.source.toLowerCase().includes(q) ||
      item.author.toLowerCase().includes(q)
    );
  });

  const totalCompletedCount = historyList.filter((h) => h.completed).length;
  const totalMinutesListened = Math.round(
    historyList.reduce((acc, h) => acc + (h.last_position_sec || 0), 0) / 60
  );

  const filteredEpisodes = episodes.filter((ep) => {
    const hist = history[ep.id];
    if (filter === 'unread' && hist?.completed) {
      return false;
    }
    if (
      filter === 'discover' &&
      ep.origin_type !== 'discover_feed' &&
      ep.origin_type !== 'android_webhook'
    ) {
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
      const hay =
        `${ep.title} ${ep.source} ${ep.author} ${ep.keywords.join(' ')} ${ep.summary_one_line}`.toLowerCase();
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
              {episodes.length} episodes in library
            </span>
            <span aria-hidden="true">·</span>
            <span className="text-emerald-400 font-medium tabular-nums">
              {unlistenedCount} unread
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              {historyList.length} in history
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-[#6B7280]">
              Pre-Gen: {ttsConfig.rate} / {ttsConfig.pitch}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Shuffle Mode Toggle */}
          <button
            type="button"
            onClick={onToggleShuffle}
            title={
              isShuffleMode
                ? 'Shuffle Active: Prioritizes unread stories first'
                : 'Turn on Shuffle (Unlistened Stories First)'
            }
            className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border ${
              isShuffleMode
                ? 'bg-[var(--accent)]/15 border-[var(--accent)] text-[var(--accent)]'
                : 'border-[#222631] bg-[#0B0D11] hover:border-[#33394A] text-[#9CA3AF] hover:text-[#F3F4F6]'
            }`}
          >
            <Shuffle className="w-3.5 h-3.5" />
            <span>{isShuffleMode ? 'Shuffle: Unread 1st' : 'Shuffle'}</span>
          </button>

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
            <span>Test Voice</span>
          </button>

          <button
            type="button"
            onClick={onTriggerBatch}
            disabled={isBatchTriggering}
            className="px-3.5 py-2 rounded-lg bg-[var(--accent)] text-[#0B0D11] hover:opacity-90 text-xs font-semibold flex items-center gap-1.5 transition-opacity whitespace-nowrap cursor-pointer disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${
                isBatchTriggering || queueStatus.is_running ? 'animate-spin' : ''
              }`}
            />
            <span>
              {queueStatus.is_running ? 'Batch Running...' : 'Sync Feed Batch'}
            </span>
          </button>
        </div>
      </div>

      {/* Primary Sub-View Navigation Tabs: Active Stream vs Listening History */}
      <div className="flex items-center justify-between border-b border-[#222631] pb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSubView('feed')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              subView === 'feed'
                ? 'bg-[#1C2029] text-[#F3F4F6] border border-[#2E3440] shadow-sm'
                : 'text-[#9CA3AF] hover:text-[#F3F4F6] hover:bg-[#13161C]'
            }`}
          >
            <span>Active Feed</span>
            {unlistenedCount > 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/40">
                {unlistenedCount} new
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setSubView('history')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              subView === 'history'
                ? 'bg-[#1C2029] text-[#F3F4F6] border border-[#2E3440] shadow-sm'
                : 'text-[#9CA3AF] hover:text-[#F3F4F6] hover:bg-[#13161C]'
            }`}
          >
            <History className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>Listening History</span>
            {historyList.length > 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-[#13161C] text-[#9CA3AF] border border-[#222631]">
                {historyList.length}
              </span>
            )}
          </button>
        </div>

        {subView === 'history' && historyList.length > 0 && (
          <div>
            {isConfirmingClearHistory ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-red-400">Clear all history?</span>
                <button
                  type="button"
                  onClick={() => {
                    onClearHistory();
                    setIsConfirmingClearHistory(false);
                  }}
                  className="px-2 py-1 rounded bg-red-950 text-red-300 border border-red-800 text-[11px] font-semibold cursor-pointer"
                >
                  Yes, Clear
                </button>
                <button
                  type="button"
                  onClick={() => setIsConfirmingClearHistory(false)}
                  className="px-2 py-1 rounded bg-[#1E2330] text-[#9CA3AF] text-[11px] cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsConfirmingClearHistory(true)}
                className="text-xs text-[#6B7280] hover:text-red-400 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear History</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Ready To Resume Callout Banner (App Resume Feature) */}
      {resumeEpisode && !isPlaying && (
        <div className="bg-gradient-to-r from-blue-950/40 via-[#13161C] to-[#13161C] border border-[var(--accent)]/40 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg animate-in fade-in duration-300">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/15 border border-[var(--accent)]/30 flex items-center justify-center text-[var(--accent)] shrink-0">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-mono text-[#9CA3AF]">
                <span className="text-[var(--accent)] font-semibold uppercase tracking-wider">
                  Ready to Resume
                </span>
                <span aria-hidden="true">·</span>
                <span>Paused at {formatSeconds(resumeState?.position_sec ?? 0)}</span>
              </div>
              <p className="text-sm font-bold text-[#F3F4F6] truncate mt-0.5">
                {resumeEpisode.title}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                const dur = resumeEpisode.duration_estimate_sec || 60;
                const pos = resumeState?.position_sec ?? 0;
                const ratio = dur > 0 ? pos / dur : 0;
                onSelectAndPlay(resumeEpisode, ratio);
              }}
              className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[#0B0D11] text-xs font-bold flex items-center gap-1.5 hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
            >
              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
              <span>Resume Playback</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsResumeBannerDismissed(true);
                onDismissResumeBanner?.();
              }}
              title="Dismiss"
              className="p-2 rounded-lg text-[#6B7280] hover:text-[#F3F4F6] hover:bg-[#1C2029] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Live Queue Banner */}
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

      {/* ========================================================================= */}
      {/* SUB-VIEW 1: LISTENING HISTORY VIEW                                        */}
      {/* ========================================================================= */}
      {subView === 'history' && (
        <div className="space-y-4">
          {/* History Header & Summary Metrics */}
          <div className="bg-[#13161C] border border-[#222631] rounded-2xl p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-[#F3F4F6] flex items-center gap-2">
                  <History className="w-4 h-4 text-[var(--accent)]" />
                  <span>Recently Played Stories</span>
                </h3>
                <p className="text-xs text-[#9CA3AF] mt-0.5">
                  Tracks playback timestamps, completion percentages, and resume positions.
                </p>
              </div>

              {/* History Search */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-[#6B7280] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={historySearchQuery}
                  onChange={(e) => setHistorySearchQuery(e.target.value)}
                  placeholder="Search history..."
                  className="w-full bg-[#0B0D11] border border-[#222631] rounded-xl pl-8 pr-3 py-1.5 text-xs text-[#F3F4F6] placeholder-[#6B7280] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-3 gap-3 pt-3 border-t border-[#222631] text-center">
              <div className="bg-[#0B0D11] p-2.5 rounded-xl border border-[#222631]">
                <div className="text-[10px] font-mono text-[#9CA3AF] uppercase">Stories Played</div>
                <div className="text-base font-bold text-[#F3F4F6] tabular-nums mt-0.5">
                  {historyList.length}
                </div>
              </div>
              <div className="bg-[#0B0D11] p-2.5 rounded-xl border border-[#222631]">
                <div className="text-[10px] font-mono text-emerald-400 uppercase">Completed</div>
                <div className="text-base font-bold text-emerald-400 tabular-nums mt-0.5">
                  {totalCompletedCount}
                </div>
              </div>
              <div className="bg-[#0B0D11] p-2.5 rounded-xl border border-[#222631]">
                <div className="text-[10px] font-mono text-[#9CA3AF] uppercase">Est. Time</div>
                <div className="text-base font-bold text-[#F3F4F6] tabular-nums mt-0.5">
                  ~{totalMinutesListened}m
                </div>
              </div>
            </div>
          </div>

          {/* History Item Cards */}
          {filteredHistoryList.length === 0 ? (
            <div className="bg-[#13161C] border border-[#222631] rounded-2xl p-8 text-center space-y-2">
              <Clock className="w-8 h-8 text-[#6B7280] mx-auto" />
              <h4 className="text-sm font-bold text-[#F3F4F6]">No Listening History Found</h4>
              <p className="text-xs text-[#9CA3AF] max-w-sm mx-auto">
                {historyList.length === 0
                  ? 'As you play articles in the feed, your recently played stories and timestamps will be tracked here.'
                  : 'No stories matched your history search query.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredHistoryList.map((item) => {
                const matchingEp = episodes.find((e) => e.id === item.episode_id);
                const isCurrentPlaying = playingEpisodeId === item.episode_id;
                const dur = item.duration_sec > 0 ? item.duration_sec : 60;
                const progressPct = Math.min(100, Math.max(0, (item.last_position_sec / dur) * 100));

                return (
                  <div
                    key={item.episode_id}
                    className={`bg-[#13161C] border rounded-2xl p-4 transition-colors ${
                      isCurrentPlaying ? 'border-[var(--accent)]' : 'border-[#222631] hover:border-[#33394A]'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#9CA3AF]">
                        <span className="font-semibold text-[var(--accent)]">{item.source}</span>
                        {item.author && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{item.author}</span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-[#F3F4F6] flex items-center gap-1">
                          <Clock className="w-3 h-3 text-[#6B7280]" />
                          <span>{formatRelativeTime(item.last_played_at)}</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {item.completed ? (
                          <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Completed</span>
                          </span>
                        ) : (
                          <span className="text-[11px] font-mono text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/40">
                            {formatSeconds(item.last_position_sec)} / {formatSeconds(item.duration_sec)} ({Math.round(progressPct)}%)
                          </span>
                        )}

                        {item.play_count > 1 && (
                          <span className="text-[10px] font-mono text-[#9CA3AF] bg-[#0B0D11] px-1.5 py-0.5 rounded border border-[#222631]">
                            {item.play_count}x
                          </span>
                        )}
                      </div>
                    </div>

                    <h4
                      onClick={() => matchingEp && onSelectAndPlay(matchingEp)}
                      className="text-sm sm:text-base font-bold text-[#F3F4F6] hover:text-[var(--accent)] cursor-pointer transition-colors mb-2.5 line-clamp-2"
                    >
                      {item.title}
                    </h4>

                    {/* Progress Bar */}
                    <div className="w-full bg-[#0B0D11] h-1.5 rounded-full overflow-hidden mb-3">
                      <div
                        className={`h-full rounded-full transition-all ${
                          item.completed ? 'bg-emerald-400' : 'bg-[var(--accent)]'
                        }`}
                        style={{ width: `${item.completed ? 100 : progressPct}%` }}
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#222631]">
                      <div className="flex items-center gap-2">
                        {matchingEp && (
                          <button
                            type="button"
                            onClick={() => {
                              const ratio = !item.completed && item.last_position_sec > 0
                                ? item.last_position_sec / dur
                                : 0;
                              onSelectAndPlay(matchingEp, ratio);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-[#0B0D11] text-xs font-semibold flex items-center gap-1.5 hover:opacity-90 transition-opacity cursor-pointer"
                          >
                            <Play className="w-3 h-3 fill-current ml-0.5" />
                            <span>
                              {isCurrentPlaying && isPlaying
                                ? 'Playing'
                                : item.completed
                                ? 'Replay Story'
                                : `Resume (${formatSeconds(item.last_position_sec)})`}
                            </span>
                          </button>
                        )}

                        {matchingEp && (
                          <button
                            type="button"
                            onClick={() => onSelectForReader(matchingEp)}
                            className="px-3 py-1.5 rounded-lg border border-[#222631] bg-[#0B0D11] hover:border-[#33394A] text-xs font-medium text-[#F3F4F6] flex items-center gap-1.5 cursor-pointer"
                          >
                            <FileText className="w-3 h-3 text-[var(--accent)]" />
                            <span>Read Script</span>
                          </button>
                        )}
                      </div>

                      {matchingEp && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onDownloadMarkdown(matchingEp)}
                            className="px-2 py-1 rounded border border-[#222631] bg-[#0B0D11] text-[11px] font-mono text-[#9CA3AF] hover:text-[#F3F4F6] cursor-pointer"
                          >
                            .md
                          </button>
                          <button
                            type="button"
                            onClick={() => onDownloadJson(matchingEp)}
                            className="px-2 py-1 rounded border border-[#222631] bg-[#0B0D11] text-[11px] font-mono text-[#9CA3AF] hover:text-[#F3F4F6] cursor-pointer"
                          >
                            .json
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-VIEW 2: ACTIVE FEED STREAM VIEW                                       */}
      {/* ========================================================================= */}
      {subView === 'feed' && (
        <div className="space-y-4">
          {/* Filter & Search Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Filter Segmented Control */}
            <div className="flex items-center gap-1 p-1 bg-[#13161C] border border-[#222631] rounded-xl overflow-x-auto">
              {(
                [
                  { id: 'all', label: `All (${episodes.length})` },
                  { id: 'unread', label: `Unread (${unlistenedCount})` },
                  { id: 'discover', label: 'Discover Batch' },
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

          {/* Empty State */}
          {filteredEpisodes.length === 0 && (
            <div className="bg-[#13161C] border border-[#222631] rounded-2xl p-8 sm:p-10 text-center space-y-4">
              <div className="max-w-md mx-auto space-y-2">
                <h3 className="font-display text-lg font-bold text-[#F3F4F6]">
                  {episodes.length === 0
                    ? 'Your Verbatim Audio Library Is Ready'
                    : filter === 'unread' && unlistenedCount === 0
                    ? "🎉 You've Listened to All Stories!"
                    : 'No Episodes Match Your Filter'}
                </h3>
                <p className="text-xs sm:text-sm text-[#9CA3AF] leading-relaxed">
                  {episodes.length === 0
                    ? 'This application starts with zero hardcoded episodes. Trigger an automated batch from your configured tech feeds, synthesize a calibration test episode, or bring your own custom URL or screenshot.'
                    : filter === 'unread' && unlistenedCount === 0
                    ? 'You have finished every unread article in your feed. Ingest a new batch or switch to Listening History to replay recent stories.'
                    : 'Try clearing your search query or switching to the All Episodes filter.'}
                </p>
              </div>

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

                {filter === 'unread' && unlistenedCount === 0 ? (
                  <button
                    type="button"
                    onClick={() => setSubView('history')}
                    className="px-4 py-2.5 rounded-xl border border-[#222631] bg-[#0B0D11] text-[#F3F4F6] hover:border-[#33394A] text-xs font-semibold flex items-center gap-2 cursor-pointer"
                  >
                    <History className="w-4 h-4 text-[var(--accent)]" />
                    <span>Open Listening History</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={onGenerateTestEpisode}
                      disabled={isTestGenerating}
                      className="px-4 py-2.5 rounded-xl border border-[#222631] bg-[#0B0D11] text-[#F3F4F6] hover:border-[#33394A] text-xs font-semibold flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <FlaskConical className="w-4 h-4 text-[var(--accent)]" />
                      <span>Generate Calibration Test</span>
                    </button>

                    <button
                      type="button"
                      onClick={onOpenCustomModal}
                      className="px-4 py-2.5 rounded-xl border border-[#222631] bg-[#0B0D11] text-[#F3F4F6] hover:border-[#33394A] text-xs font-semibold flex items-center gap-2 cursor-pointer"
                    >
                      <Plus className="w-4 h-4 text-[var(--accent)]" />
                      <span>Bring Custom URL / Screenshot</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Dynamic Episode Cards */}
          <div className="space-y-3.5">
            {filteredEpisodes.map((ep) => {
              const isCurrentPlaying = playingEpisodeId === ep.id;
              const isSelected = selectedEpisodeId === ep.id;
              const histItem = history[ep.id];
              const isCompleted = Boolean(histItem?.completed);
              const hasResumePoint =
                histItem &&
                !isCompleted &&
                histItem.last_position_sec > 5 &&
                !isCurrentPlaying;

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
                  {/* Clean Metadata Line */}
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

                      {/* History Status Badge on Card */}
                      {isCompleted ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-1.5 py-0.2 rounded border border-emerald-800/40 flex items-center gap-1">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            <span>Played</span>
                          </span>
                        </>
                      ) : histItem && histItem.last_position_sec > 5 ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-[10px] font-mono text-amber-400 bg-amber-950/60 px-1.5 py-0.2 rounded border border-amber-800/40">
                            At {formatSeconds(histItem.last_position_sec)}
                          </span>
                        </>
                      ) : null}
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

                  {/* One-Line Summary */}
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

                  {/* Inline Card Transport Controls */}
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
                        {/* If paused mid-way and not currently playing, offer direct Resume */}
                        {hasResumePoint ? (
                          <button
                            type="button"
                            onClick={() => {
                              const ratio =
                                epDuration > 0
                                  ? histItem.last_position_sec / epDuration
                                  : 0;
                              onSelectAndPlay(ep, ratio);
                            }}
                            className="px-3.5 py-1.5 rounded-lg bg-[var(--accent)] text-[#0B0D11] text-xs font-semibold flex items-center gap-1.5 hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap min-h-[36px]"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>
                              Resume ({formatSeconds(histItem.last_position_sec)})
                            </span>
                          </button>
                        ) : (
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
                                <span>
                                  {isCompleted ? 'Replay' : 'Listen Verbatim'}
                                </span>
                              </>
                            )}
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => onSelectForReader(ep)}
                          className="px-3 py-1.5 rounded-lg border border-[#222631] bg-[#0B0D11] hover:border-[#33394A] text-xs font-medium text-[#F3F4F6] flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap min-h-[36px]"
                        >
                          <FileText className="w-3.5 h-3.5 text-[var(--accent)]" />
                          <span>Read Script</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onDownloadMarkdown(ep)}
                          title="Export Markdown (.md)"
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
      )}
    </div>
  );
};
