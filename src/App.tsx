/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppConfig,
  Episode,
  FeedSource,
  QueueStatus,
  VoiceOption,
} from './types.ts';
import { DEFAULT_CONFIG, EN_US_VOICES } from './server/voices.ts';
import { ActiveTab, TopBar } from './components/TopBar.tsx';
import { FeedView } from './components/FeedView.tsx';
import { ReaderPane } from './components/ReaderPane.tsx';
import { MasterPlayer } from './components/MasterPlayer.tsx';
import { CustomIngestModal } from './components/CustomIngestModal.tsx';
import { BatchCompletionModal } from './components/BatchCompletionModal.tsx';
import { VaultView } from './components/VaultView.tsx';
import { BridgesView } from './components/BridgesView.tsx';
import { TuneView } from './components/TuneView.tsx';
import { useOnlineStatus } from './hooks/usePWAInstall.ts';
import { useListeningHistory } from './hooks/useListeningHistory.ts';

export default function App() {
  // ZERO HARDCODED EPISODES: All data comes dynamically from SQLite via /api/*
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [availableVoices, setAvailableVoices] = useState<VoiceOption[]>(EN_US_VOICES);
  const [feeds, setFeeds] = useState<FeedSource[]>([]);
  const [dedupeStats, setDedupeStats] = useState({
    totalEpisodes: 0,
    totalSeenHashes: 0,
  });
  const [queueStatus, setQueueStatus] = useState<QueueStatus>({
    is_running: false,
    currently_generating: null,
    queued_count: 0,
    queued_items: [],
    completed_in_session: 0,
    skipped_duplicates_count: 0,
    last_batch_run_at: null,
    last_error: null,
  });

  const [activeTab, setActiveTab] = useState<ActiveTab>('feed');
  const [feedSubView, setFeedSubView] = useState<'feed' | 'history'>('feed');
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null);
  const [playingEpisodeId, setPlayingEpisodeId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [isMobileReaderOpen, setIsMobileReaderOpen] = useState(false);
  const [isBatchCompletionModalOpen, setIsBatchCompletionModalOpen] = useState(false);
  const [isBatchTriggering, setIsBatchTriggering] = useState(false);
  const [isTestGenerating, setIsTestGenerating] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastCompletedCountRef = useRef<number>(0);
  const hasRestoredResumeRef = useRef<boolean>(false);
  const lastProgressUpdateRef = useRef<number>(0);
  const isOnline = useOnlineStatus();

  // Listening History, Resume State, and Intelligent Shuffle
  const {
    history,
    resumeState,
    isShuffleMode,
    recordProgress,
    saveResumeState,
    clearResumeState,
    clearHistory,
    toggleShuffle,
    getUnlistenedEpisodes,
    getNextShuffleEpisode,
  } = useListeningHistory();

  // Fetch episodes from SQLite
  const fetchEpisodes = useCallback(async () => {
    try {
      const res = await fetch('/api/episodes');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.episodes)) {
        setEpisodes(data.episodes);
      }
      if (data.dedupe_stats) {
        setDedupeStats(data.dedupe_stats);
      }
    } catch (err) {
      console.warn('Failed to fetch episodes:', err);
    }
  }, []);

  // Fetch active configuration, voices, and RSS feed sources
  const fetchConfigAndFeeds = useCallback(async () => {
    try {
      const [cfgRes, voicesRes, feedsRes] = await Promise.all([
        fetch('/api/config'),
        fetch('/api/voices'),
        fetch('/api/feeds'),
      ]);

      if (cfgRes.ok) {
        const cfgData = await cfgRes.json();
        if (cfgData.config) setConfig(cfgData.config);
      }

      if (voicesRes.ok) {
        const vData = await voicesRes.json();
        if (Array.isArray(vData.voices)) setAvailableVoices(vData.voices);
      }

      if (feedsRes.ok) {
        const fData = await feedsRes.json();
        if (Array.isArray(fData.feeds)) setFeeds(fData.feeds);
      }
    } catch (err) {
      console.warn('Failed to fetch config/feeds:', err);
    }
  }, []);

  // Fetch live generation queue status
  const fetchQueueStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/queue/status');
      if (!res.ok) return;
      const data = await res.json();
      if (data.queue) {
        setQueueStatus(data.queue);

        // Check if new items finished synthesizing so we can reload the feed list
        if (
          data.queue.completed_in_session !== undefined &&
          data.queue.completed_in_session !== lastCompletedCountRef.current
        ) {
          lastCompletedCountRef.current = data.queue.completed_in_session;
          void fetchEpisodes();
        }
      }
    } catch (err) {
      console.warn('Failed to fetch queue status:', err);
    }
  }, [fetchEpisodes]);

  // Initial load
  useEffect(() => {
    void fetchEpisodes();
    void fetchConfigAndFeeds();
    void fetchQueueStatus();
  }, [fetchEpisodes, fetchConfigAndFeeds, fetchQueueStatus]);

  // Restore Paused Episode on App Resume:
  // If an episode was paused during playback, load it into the player and cue to that timestamp
  useEffect(() => {
    if (hasRestoredResumeRef.current || episodes.length === 0) return;
    hasRestoredResumeRef.current = true;

    if (resumeState?.episode_id) {
      const resumeEp = episodes.find((e) => e.id === resumeState.episode_id);
      if (resumeEp) {
        setSelectedEpisodeId(resumeEp.id);
        setPlayingEpisodeId(resumeEp.id);
        const audio = audioRef.current;
        if (audio) {
          audio.src = resumeEp.audio_url;
          audio.load();
          const targetPos = Math.max(0, resumeState.position_sec);
          setCurrentTime(targetPos);

          const onMeta = () => {
            if (targetPos > 0 && Number.isFinite(audio.duration)) {
              audio.currentTime = Math.min(audio.duration, targetPos);
            }
            setIsPlaying(false);
            audio.removeEventListener('loadedmetadata', onMeta);
          };
          audio.addEventListener('loadedmetadata', onMeta);
        }
      }
    }
  }, [episodes, resumeState]);

  // Poll queue status every 2.5s so live synthesis progress appears automatically
  useEffect(() => {
    const interval = setInterval(() => {
      void fetchQueueStatus();
    }, 2500);
    return () => clearInterval(interval);
  }, [fetchQueueStatus]);

  const currentPlayingEpisode =
    episodes.find((e) => e.id === playingEpisodeId) ||
    episodes.find((e) => e.id === selectedEpisodeId) ||
    null;

  const currentReaderEpisode =
    episodes.find((e) => e.id === selectedEpisodeId) ||
    currentPlayingEpisode ||
    null;

  // Setup Android / Chrome MediaSession API for lock-screen and Bluetooth headphone controls
  useEffect(() => {
    if (!currentPlayingEpisode || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentPlayingEpisode.title,
        artist: `${currentPlayingEpisode.source} · ${currentPlayingEpisode.voice_used
          .replace(/^en-US-/, '')
          .replace(/Neural$/, '')}`,
        album: 'Discover Radio',
      });
    } catch {
      // ignore
    }
  }, [currentPlayingEpisode]);

  const playEpisode = useCallback(
    (ep: Episode, startRatio?: number) => {
      const audio = audioRef.current;
      if (!audio) return;

      setSelectedEpisodeId(ep.id);

      // Same track toggle play/pause if no explicit start ratio
      if (playingEpisodeId === ep.id && startRatio === undefined) {
        if (audio.paused) {
          void audio.play();
          setIsPlaying(true);
        } else {
          audio.pause();
          setIsPlaying(false);
          saveResumeState(ep.id, audio.currentTime, true);
        }
        return;
      }

      setPlayingEpisodeId(ep.id);
      audio.src = ep.audio_url;
      audio.load();

      const handleLoadedMetadata = () => {
        if (startRatio !== undefined && startRatio >= 0 && audio.duration > 0) {
          audio.currentTime = startRatio * audio.duration;
        } else {
          // If returning to a paused story in history, start from last saved position
          const hist = history[ep.id];
          if (hist && !hist.completed && hist.last_position_sec > 5) {
            audio.currentTime = Math.min(audio.duration, hist.last_position_sec);
          }
        }

        void audio.play();
        setIsPlaying(true);
        recordProgress(ep, audio.currentTime, audio.duration, false);
        saveResumeState(ep.id, audio.currentTime, false);
        audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      };

      audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    },
    [playingEpisodeId, history, recordProgress, saveResumeState]
  );

  const handleTogglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!playingEpisodeId) {
      if (currentPlayingEpisode) {
        playEpisode(currentPlayingEpisode);
      }
      return;
    }
    if (audio.paused) {
      void audio.play();
      setIsPlaying(true);
    } else {
      audio.pause();
      setIsPlaying(false);
      if (currentPlayingEpisode) {
        saveResumeState(currentPlayingEpisode.id, audio.currentTime, true);
      }
    }
  }, [playingEpisodeId, currentPlayingEpisode, playEpisode, saveResumeState]);

  // Next Track: respects Shuffle Mode (ignoring listened stories unless no new ones remain)
  const handleNextTrack = useCallback(() => {
    if (episodes.length === 0) return;

    if (isShuffleMode) {
      const nextEp = getNextShuffleEpisode(episodes, playingEpisodeId);
      if (nextEp) {
        playEpisode(nextEp);
      }
      return;
    }

    const idx = episodes.findIndex((e) => e.id === playingEpisodeId);
    if (idx >= 0 && idx < episodes.length - 1) {
      playEpisode(episodes[idx + 1]);
    }
  }, [episodes, playingEpisodeId, isShuffleMode, getNextShuffleEpisode, playEpisode]);

  const handlePrevTrack = useCallback(() => {
    if (episodes.length === 0) return;
    const idx = episodes.findIndex((e) => e.id === playingEpisodeId);
    if (idx > 0) {
      playEpisode(episodes[idx - 1]);
    }
  }, [episodes, playingEpisodeId, playEpisode]);

  const handleSkipSeconds = useCallback((deltaSec: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const maxDur = audio.duration || 3600;
    audio.currentTime = Math.min(maxDur, Math.max(0, audio.currentTime + deltaSec));
    setCurrentTime(audio.currentTime);
  }, []);

  const handleSeekToRatio = useCallback(
    (ratio: number) => {
      const targetEp = currentReaderEpisode || currentPlayingEpisode;
      if (!targetEp) return;
      const audio = audioRef.current;
      if (!audio) return;

      if (playingEpisodeId !== targetEp.id) {
        playEpisode(targetEp, ratio);
        return;
      }

      const effectiveDur =
        audio.duration > 0 ? audio.duration : targetEp.duration_estimate_sec || 60;
      audio.currentTime = Math.max(0, Math.min(effectiveDur, ratio * effectiveDur));
      setCurrentTime(audio.currentTime);
      if (audio.paused) {
        void audio.play();
        setIsPlaying(true);
      }
      recordProgress(targetEp, audio.currentTime, effectiveDur, false);
      saveResumeState(targetEp.id, audio.currentTime, false);
    },
    [currentReaderEpisode, currentPlayingEpisode, playingEpisodeId, playEpisode, recordProgress, saveResumeState]
  );

  // Wire MediaSession action handlers
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.setActionHandler('play', handleTogglePlay);
      navigator.mediaSession.setActionHandler('pause', handleTogglePlay);
      navigator.mediaSession.setActionHandler('previoustrack', handlePrevTrack);
      navigator.mediaSession.setActionHandler('nexttrack', handleNextTrack);
      navigator.mediaSession.setActionHandler('seekbackward', () =>
        handleSkipSeconds(-config.ui.skip_back_sec)
      );
      navigator.mediaSession.setActionHandler('seekforward', () =>
        handleSkipSeconds(config.ui.skip_forward_sec)
      );
    } catch {
      // ignore
    }
  }, [
    handleTogglePlay,
    handlePrevTrack,
    handleNextTrack,
    handleSkipSeconds,
    config.ui.skip_back_sec,
    config.ui.skip_forward_sec,
  ]);

  // API Actions
  const handleTriggerBatch = async () => {
    setIsBatchTriggering(true);
    try {
      await fetch('/api/batch/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      await fetchQueueStatus();
    } finally {
      setIsBatchTriggering(false);
    }
  };

  const handleGenerateTestEpisode = async (overrideVoice?: string) => {
    setIsTestGenerating(true);
    try {
      const res = await fetch('/api/episodes/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voice: overrideVoice,
          rate: config.tts.rate,
          pitch: config.tts.pitch,
        }),
      });
      const data = await res.json();
      await fetchEpisodes();
      if (data.episode) {
        setActiveTab('feed');
        playEpisode(data.episode);
      }
    } finally {
      setIsTestGenerating(false);
    }
  };

  const handleUpdateConfig = async (newConfig: AppConfig) => {
    setConfig(newConfig);
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newConfig),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.config) setConfig(data.config);
    }
  };

  const handleDeleteEpisode = async (id: string) => {
    await fetch(`/api/episodes/${id}`, { method: 'DELETE' });
    if (playingEpisodeId === id && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      setPlayingEpisodeId(null);
      clearResumeState();
    }
    await fetchEpisodes();
  };

  const handleClearQueue = async () => {
    await fetch('/api/queue/clear', { method: 'POST' });
    await fetchQueueStatus();
  };

  const handleClearDedupeHashes = async () => {
    const res = await fetch('/api/dedupe/clear', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      if (data.dedupe_stats) setDedupeStats(data.dedupe_stats);
    }
  };

  const handleAddFeed = async (name: string, url: string, category: string) => {
    const res = await fetch('/api/feeds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, url, category }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.feeds) setFeeds(data.feeds);
    }
  };

  const handleToggleFeed = async (id: string, enabled: boolean) => {
    const res = await fetch(`/api/feeds/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.feeds) setFeeds(data.feeds);
    }
  };

  const handleDeleteFeed = async (id: string) => {
    const res = await fetch(`/api/feeds/${id}`, { method: 'DELETE' });
    if (res.ok) {
      const data = await res.json();
      if (data.feeds) setFeeds(data.feeds);
    }
  };

  const handleDownloadMarkdown = (ep: Episode) => {
    if (ep.md_filename) {
      const a = document.createElement('a');
      a.href = `/api/exports/md/${ep.md_filename}`;
      a.download = ep.md_filename;
      a.click();
      return;
    }
    const mdContent = `# ${ep.title}\n\nSource: ${ep.source} (${ep.canonical_url})\n\n${ep.verbatim_script}`;
    const blob = new Blob([mdContent], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${ep.id}.md`;
    a.click();
  };

  const handleDownloadJson = (ep: Episode) => {
    if (ep.json_filename) {
      const a = document.createElement('a');
      a.href = `/api/exports/json/${ep.json_filename}`;
      a.download = ep.json_filename;
      a.click();
      return;
    }
    const blob = new Blob([JSON.stringify(ep, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${ep.id}.json`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-[#0B0D11] text-[#F3F4F6] pb-32">
      {/* 3-Zone Top Bar Contract */}
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenCustomModal={() => setIsCustomModalOpen(true)}
      />

      {/* Offline banner if network drops */}
      {!isOnline && (
        <div className="bg-amber-950/80 border-b border-amber-800 px-4 py-2 text-center text-xs text-amber-200">
          Offline Mode — Cached episodes and local reader remain available.
        </div>
      )}

      {/* Main Tabbed Views */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {activeTab === 'feed' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 7 Cols: Abbreviated Discover Feed & Listening History */}
            <div className="lg:col-span-7">
              <FeedView
                episodes={episodes}
                selectedEpisodeId={selectedEpisodeId}
                playingEpisodeId={playingEpisodeId}
                isPlaying={isPlaying}
                currentTime={currentTime}
                duration={duration}
                queueStatus={queueStatus}
                dedupeStats={dedupeStats}
                uiConfig={config.ui}
                ttsConfig={config.tts}
                isBatchTriggering={isBatchTriggering}
                isTestGenerating={isTestGenerating}
                history={history}
                resumeState={resumeState}
                isShuffleMode={isShuffleMode}
                feedSubView={feedSubView}
                onToggleShuffle={toggleShuffle}
                onClearHistory={clearHistory}
                onChangeFeedSubView={setFeedSubView}
                onDismissResumeBanner={clearResumeState}
                onSelectAndPlay={(ep, ratio) => playEpisode(ep, ratio)}
                onSelectForReader={(ep) => {
                  setSelectedEpisodeId(ep.id);
                  setIsMobileReaderOpen(true);
                }}
                onSeekRatio={handleSeekToRatio}
                onTriggerBatch={handleTriggerBatch}
                onGenerateTestEpisode={() => handleGenerateTestEpisode()}
                onOpenCustomModal={() => setIsCustomModalOpen(true)}
                onDeleteEpisode={handleDeleteEpisode}
                onDownloadMarkdown={handleDownloadMarkdown}
                onDownloadJson={handleDownloadJson}
                onClearQueue={handleClearQueue}
              />
            </div>

            {/* Right 5 Cols (Desktop Sticky): Interactive "Read From Here" Reader Pane */}
            <div className="hidden lg:block lg:col-span-5 sticky top-20">
              <ReaderPane
                episode={currentReaderEpisode}
                currentTime={
                  currentReaderEpisode?.id === playingEpisodeId ? currentTime : 0
                }
                duration={
                  currentReaderEpisode?.id === playingEpisodeId ? duration : 0
                }
                isPlaying={
                  currentReaderEpisode?.id === playingEpisodeId && isPlaying
                }
                onSeekToRatio={handleSeekToRatio}
                onDownloadMarkdown={handleDownloadMarkdown}
                onDownloadJson={handleDownloadJson}
              />
            </div>
          </div>
        )}

        {activeTab === 'vault' && (
          <VaultView
            episodes={episodes}
            onDownloadMarkdown={handleDownloadMarkdown}
            onDownloadJson={handleDownloadJson}
            onSelectForReader={(ep) => {
              setSelectedEpisodeId(ep.id);
              setActiveTab('feed');
              setIsMobileReaderOpen(true);
            }}
          />
        )}

        {activeTab === 'bridges' && (
          <BridgesView
            feeds={feeds}
            scraperConfig={config.scraper}
            onAddFeed={handleAddFeed}
            onToggleFeed={handleToggleFeed}
            onDeleteFeed={handleDeleteFeed}
            onWebhookSubmitted={() => {
              void fetchQueueStatus();
              setActiveTab('feed');
            }}
          />
        )}

        {activeTab === 'tune' && (
          <TuneView
            config={config}
            availableVoices={availableVoices}
            dedupeStats={dedupeStats}
            isTestGenerating={isTestGenerating}
            onUpdateConfig={handleUpdateConfig}
            onGenerateTestEpisode={handleGenerateTestEpisode}
            onClearDedupeHashes={handleClearDedupeHashes}
          />
        )}
      </main>

      {/* Mobile / Tablet Slide-Over Reader Drawer */}
      {isMobileReaderOpen && currentReaderEpisode && (
        <div className="fixed inset-0 z-40 lg:hidden bg-black/85 backdrop-blur-sm p-3 flex flex-col justify-end">
          <ReaderPane
            episode={currentReaderEpisode}
            currentTime={
              currentReaderEpisode.id === playingEpisodeId ? currentTime : 0
            }
            duration={
              currentReaderEpisode.id === playingEpisodeId ? duration : 0
            }
            isPlaying={
              currentReaderEpisode.id === playingEpisodeId && isPlaying
            }
            onSeekToRatio={handleSeekToRatio}
            onDownloadMarkdown={handleDownloadMarkdown}
            onDownloadJson={handleDownloadJson}
            onCloseMobile={() => setIsMobileReaderOpen(false)}
          />
        </div>
      )}

      {/* On-Demand "+ Custom Audio" Ingestion Modal */}
      <CustomIngestModal
        isOpen={isCustomModalOpen}
        ttsConfig={config.tts}
        onClose={() => setIsCustomModalOpen(false)}
        onSubmitted={() => {
          void fetchQueueStatus();
          setActiveTab('feed');
        }}
      />

      {/* Queue Completed / Batch Offer Prompt Modal */}
      <BatchCompletionModal
        isOpen={isBatchCompletionModalOpen}
        onClose={() => setIsBatchCompletionModalOpen(false)}
        onTriggerBatch={handleTriggerBatch}
        onReplayShuffle={() => {
          if (!isShuffleMode) toggleShuffle();
          const ep = getNextShuffleEpisode(episodes, null);
          if (ep) playEpisode(ep);
        }}
        onOpenHistory={() => {
          setActiveTab('feed');
          setFeedSubView('history');
        }}
        totalListenedCount={
          Object.values(history).filter((h) => h.completed).length
        }
        isBatchTriggering={isBatchTriggering}
      />

      {/* Persistent Bottom Master Transport Bar */}
      <MasterPlayer
        currentEpisode={currentPlayingEpisode}
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        skipBackSec={config.ui.skip_back_sec}
        skipForwardSec={config.ui.skip_forward_sec}
        isShuffleMode={isShuffleMode}
        onToggleShuffle={toggleShuffle}
        onTogglePlay={handleTogglePlay}
        onPrevTrack={handlePrevTrack}
        onNextTrack={handleNextTrack}
        onSkipSeconds={handleSkipSeconds}
        onSeekRatio={handleSeekToRatio}
        onOpenReaderMobile={() => setIsMobileReaderOpen(true)}
        onDownloadMarkdown={handleDownloadMarkdown}
      />

      {/* Hidden HTML5 Audio Engine */}
      <audio
        ref={audioRef}
        preload="metadata"
        onTimeUpdate={() => {
          const audio = audioRef.current;
          if (!audio) return;
          setCurrentTime(audio.currentTime);

          // Periodically save position and listening history
          const now = Date.now();
          if (now - lastProgressUpdateRef.current > 1500 && currentPlayingEpisode) {
            lastProgressUpdateRef.current = now;
            recordProgress(currentPlayingEpisode, audio.currentTime, audio.duration, false);
            saveResumeState(currentPlayingEpisode.id, audio.currentTime, false);
          }
        }}
        onLoadedMetadata={() => {
          if (audioRef.current && Number.isFinite(audioRef.current.duration)) {
            setDuration(audioRef.current.duration);
          }
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => {
          setIsPlaying(false);
          const audio = audioRef.current;
          if (audio && currentPlayingEpisode) {
            recordProgress(currentPlayingEpisode, audio.currentTime, audio.duration, false);
            saveResumeState(currentPlayingEpisode.id, audio.currentTime, true);
          }
        }}
        onEnded={() => {
          setIsPlaying(false);
          const audio = audioRef.current;
          const completedEpisode = currentPlayingEpisode;

          if (completedEpisode && audio) {
            recordProgress(completedEpisode, audio.duration, audio.duration, true);
          }
          clearResumeState();

          // Check if unlistened stories remain
          const unlistenedRemaining = getUnlistenedEpisodes(episodes).filter(
            (e) => e.id !== completedEpisode?.id
          );

          if (isShuffleMode) {
            if (unlistenedRemaining.length > 0) {
              const nextRandom =
                unlistenedRemaining[
                  Math.floor(Math.random() * unlistenedRemaining.length)
                ];
              playEpisode(nextRandom);
            } else {
              // ALL unlistened stories completed! Stop and prompt user
              setIsBatchCompletionModalOpen(true);
              if (
                typeof window !== 'undefined' &&
                'Notification' in window &&
                Notification.permission === 'granted'
              ) {
                try {
                  new Notification('Discover Radio — Queue Complete', {
                    body: "You've finished all unread stories. Tap to generate a fresh batch.",
                    icon: '/icon.svg',
                  });
                } catch {
                  // ignore
                }
              }
            }
          } else if (config.ui.auto_advance) {
            // Sequential Auto-Advance: Check if there's a next unlistened episode ahead
            if (unlistenedRemaining.length > 0) {
              handleNextTrack();
            } else {
              // End of unlistened queue reached!
              setIsBatchCompletionModalOpen(true);
              if (
                typeof window !== 'undefined' &&
                'Notification' in window &&
                Notification.permission === 'granted'
              ) {
                try {
                  new Notification('Discover Radio — Queue Complete', {
                    body: "You've finished all unread stories. Tap to generate a fresh batch.",
                    icon: '/icon.svg',
                  });
                } catch {
                  // ignore
                }
              }
            }
          }
        }}
      />
    </div>
  );
}
