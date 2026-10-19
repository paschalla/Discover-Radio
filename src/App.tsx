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
import { VaultView } from './components/VaultView.tsx';
import { BridgesView } from './components/BridgesView.tsx';
import { TuneView } from './components/TuneView.tsx';
import { useOnlineStatus } from './hooks/usePWAInstall.ts';

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
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null);
  const [playingEpisodeId, setPlayingEpisodeId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [isMobileReaderOpen, setIsMobileReaderOpen] = useState(false);
  const [isBatchTriggering, setIsBatchTriggering] = useState(false);
  const [isTestGenerating, setIsTestGenerating] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastCompletedCountRef = useRef<number>(0);
  const isOnline = useOnlineStatus();

  // Apply CSS custom properties whenever UI config changes
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--accent',
      config.ui.accent_color || '#60A5FA'
    );
    document.documentElement.style.setProperty(
      '--reader-font-size',
      `${config.ui.reader_font_size || 16}px`
    );
    document.documentElement.style.setProperty(
      '--reader-line-height',
      String(config.ui.reader_line_height || 1.65)
    );
  }, [
    config.ui.accent_color,
    config.ui.reader_font_size,
    config.ui.reader_line_height,
  ]);

  const fetchEpisodes = useCallback(async () => {
    try {
      const res = await fetch('/api/episodes');
      if (!res.ok) return;
      const data = await res.json();
      const loaded: Episode[] = data.episodes || [];
      setEpisodes(loaded);
      if (data.stats) {
        setDedupeStats(data.stats);
      }
      setSelectedEpisodeId((prev) => {
        if (prev && loaded.some((e) => e.id === prev)) return prev;
        return loaded.length > 0 ? loaded[0].id : null;
      });
    } catch {
      // ignore network error when offline
    }
  }, []);

  const fetchConfigAndFeeds = useCallback(async () => {
    try {
      const [cfgRes, feedsRes] = await Promise.all([
        fetch('/api/config'),
        fetch('/api/feeds'),
      ]);
      if (cfgRes.ok) {
        const cfgData = await cfgRes.json();
        if (cfgData.config) setConfig(cfgData.config);
        if (cfgData.available_voices) setAvailableVoices(cfgData.available_voices);
        if (cfgData.dedupe_stats) setDedupeStats(cfgData.dedupe_stats);
      }
      if (feedsRes.ok) {
        const feedsData = await feedsRes.json();
        if (feedsData.feeds) setFeeds(feedsData.feeds);
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchQueueStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/queue');
      if (!res.ok) return;
      const status: QueueStatus = await res.json();
      setQueueStatus(status);

      if (status.completed_in_session !== lastCompletedCountRef.current) {
        lastCompletedCountRef.current = status.completed_in_session;
        void fetchEpisodes();
      }
    } catch {
      // ignore
    }
  }, [fetchEpisodes]);

  // Initial load
  useEffect(() => {
    void fetchEpisodes();
    void fetchConfigAndFeeds();
    void fetchQueueStatus();
  }, [fetchEpisodes, fetchConfigAndFeeds, fetchQueueStatus]);

  // Poll queue status every 2.5s so live synthesis progress and newly completed items appear automatically
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
        album: 'Discover Audio Radio',
      });
    } catch {
      // ignore
    }
  }, [currentPlayingEpisode]);

  const playEpisode = useCallback((ep: Episode, startRatio = 0) => {
    const audio = audioRef.current;
    if (!audio) return;

    setSelectedEpisodeId(ep.id);

    if (playingEpisodeId === ep.id && startRatio === 0) {
      if (audio.paused) {
        void audio.play();
        setIsPlaying(true);
      } else {
        audio.pause();
        setIsPlaying(false);
      }
      return;
    }

    setPlayingEpisodeId(ep.id);
    audio.src = ep.audio_url;
    audio.load();

    const handleLoadedMetadata = () => {
      if (startRatio > 0 && audio.duration > 0) {
        audio.currentTime = startRatio * audio.duration;
      }
      void audio.play();
      setIsPlaying(true);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
  }, [playingEpisodeId]);

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
    }
  }, [playingEpisodeId, currentPlayingEpisode, playEpisode]);

  const handleNextTrack = useCallback(() => {
    if (episodes.length === 0) return;
    const idx = episodes.findIndex((e) => e.id === playingEpisodeId);
    if (idx >= 0 && idx < episodes.length - 1) {
      playEpisode(episodes[idx + 1]);
    }
  }, [episodes, playingEpisodeId, playEpisode]);

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
    },
    [currentReaderEpisode, currentPlayingEpisode, playingEpisodeId, playEpisode]
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

  const handleUpdateConfig = async (nextCfg: AppConfig) => {
    setConfig(nextCfg);
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextCfg),
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

  const handleDownloadMarkdown = (ep: Episode) => {
    if (ep.md_filename) {
      const a = document.createElement('a');
      a.href = `/api/exports/md/${ep.md_filename}`;
      a.download = ep.md_filename;
      a.click();
      return;
    }
    const content = `# ${ep.title}\n\nSource: ${ep.source} (${ep.canonical_url})\n\n${ep.verbatim_script}`;
    const blob = new Blob([content], { type: 'text/markdown' });
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

  return (
    <div className="min-h-screen bg-[#0B0D11] text-[#F3F4F6] pb-32">
      {/* Top Bar Contract (3-Zone Header) */}
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenCustomModal={() => setIsCustomModalOpen(true)}
      />

      {/* Offline Connectivity Banner */}
      {!isOnline && (
        <div className="bg-amber-950/80 border-b border-amber-800 px-4 py-2 text-center text-xs text-amber-200">
          Offline Mode — Cached episodes and local reader remain available.
        </div>
      )}

      {/* Main Responsive Workspace Container (1440px Desktop Presence) */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {activeTab === 'feed' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 7 Cols: Dynamic Abbreviated Feed & Queue */}
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
                onSelectAndPlay={(ep) => playEpisode(ep)}
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

      {/* Custom Content Ingest Modal (URL, Screenshot Vision, Raw Text) */}
      <CustomIngestModal
        isOpen={isCustomModalOpen}
        ttsConfig={config.tts}
        onClose={() => setIsCustomModalOpen(false)}
        onSubmitted={() => {
          void fetchQueueStatus();
          setActiveTab('feed');
        }}
      />

      {/* Persistent Bottom Master Transport Bar */}
      <MasterPlayer
        currentEpisode={currentPlayingEpisode}
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        skipBackSec={config.ui.skip_back_sec}
        skipForwardSec={config.ui.skip_forward_sec}
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
          if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
          }
        }}
        onLoadedMetadata={() => {
          if (audioRef.current && Number.isFinite(audioRef.current.duration)) {
            setDuration(audioRef.current.duration);
          }
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          if (config.ui.auto_advance) {
            handleNextTrack();
          }
        }}
      />
    </div>
  );
}
