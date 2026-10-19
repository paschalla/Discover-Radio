import React from 'react';
import {
  ExternalLink,
  FileText,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { Episode } from '../types.ts';

interface MasterPlayerProps {
  currentEpisode: Episode | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  skipBackSec: number;
  skipForwardSec: number;
  onTogglePlay: () => void;
  onPrevTrack: () => void;
  onNextTrack: () => void;
  onSkipSeconds: (deltaSec: number) => void;
  onSeekRatio: (ratio: number) => void;
  onOpenReaderMobile: () => void;
  onDownloadMarkdown: (ep: Episode) => void;
}

export function formatSeconds(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
}

export const MasterPlayer: React.FC<MasterPlayerProps> = ({
  currentEpisode,
  isPlaying,
  currentTime,
  duration,
  skipBackSec,
  skipForwardSec,
  onTogglePlay,
  onPrevTrack,
  onNextTrack,
  onSkipSeconds,
  onSeekRatio,
  onOpenReaderMobile,
  onDownloadMarkdown,
}) => {
  const effectiveDuration =
    duration > 0 ? duration : currentEpisode?.duration_estimate_sec || 0;
  const progressPct =
    effectiveDuration > 0
      ? Math.min(100, Math.max(0, (currentTime / effectiveDuration) * 100))
      : 0;

  const shortVoice = currentEpisode
    ? currentEpisode.voice_used.replace(/^en-US-/, '').replace(/Neural$/, '')
    : '';

  return (
    <div className="fixed bottom-0 inset-x-0 z-30 bg-[#13161C]/95 backdrop-blur-md border-t border-[#222631] px-4 py-2.5">
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 lg:gap-6">
        {/* Left: Now Playing Metadata */}
        <div
          onClick={onOpenReaderMobile}
          className="min-w-0 flex-1 cursor-pointer group"
        >
          {currentEpisode ? (
            <>
              <div className="flex items-center gap-1.5 text-[11px] text-[#9CA3AF] truncate">
                <span className="font-semibold text-[var(--accent)]">
                  {currentEpisode.source}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">{shortVoice}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-[#6B7280]">
                  Pre-Gen {currentEpisode.tts_rate_used} / {currentEpisode.tts_pitch_used}
                </span>
              </div>
              <p className="text-xs sm:text-sm font-semibold text-[#F3F4F6] truncate group-hover:text-[var(--accent)] transition-colors">
                {currentEpisode.title}
              </p>
            </>
          ) : (
            <>
              <div className="text-[11px] text-[#6B7280]">
                Verbatim Broadcast Player Ready
              </div>
              <p className="text-xs sm:text-sm font-medium text-[#9CA3AF] truncate">
                Select any article card or generate a test episode to begin listening
              </p>
            </>
          )}
        </div>

        {/* Center: Transport + Scrub Bar */}
        <div className="flex flex-col items-center flex-1 max-w-xl w-full">
          <div className="flex items-center justify-between w-full gap-3 mb-1">
            <span className="text-[11px] font-mono tabular-nums text-[#9CA3AF] w-10 text-right">
              {formatSeconds(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={0.2}
              value={progressPct}
              disabled={!currentEpisode}
              onChange={(e) => onSeekRatio( parseFloat(e.target.value) / 100 )}
              aria-label="Audio seek progress"
              className="w-full h-1.5 bg-[#222631] rounded-lg cursor-pointer disabled:opacity-40"
            />
            <span className="text-[11px] font-mono tabular-nums text-[#9CA3AF] w-10">
              {formatSeconds(effectiveDuration)}
            </span>
          </div>

          <div className="flex items-center justify-center gap-4 sm:gap-6">
            <button
              type="button"
              onClick={onPrevTrack}
              disabled={!currentEpisode}
              title="Previous Episode"
              className="text-[#9CA3AF] hover:text-[#F3F4F6] disabled:opacity-30 transition-colors p-1.5 cursor-pointer"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => onSkipSeconds(-skipBackSec)}
              disabled={!currentEpisode}
              title={`Rewind ${skipBackSec} seconds`}
              className="flex items-center gap-1 text-xs font-mono tabular-nums text-[#9CA3AF] hover:text-[#F3F4F6] disabled:opacity-30 transition-colors px-2 py-1 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>-{skipBackSec}s</span>
            </button>

            <button
              type="button"
              onClick={onTogglePlay}
              disabled={!currentEpisode}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="w-10 h-10 rounded-full bg-[var(--accent)] text-[#0B0D11] flex items-center justify-center font-bold hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer shadow-sm"
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => onSkipSeconds(skipForwardSec)}
              disabled={!currentEpisode}
              title={`Fast-forward ${skipForwardSec} seconds`}
              className="flex items-center gap-1 text-xs font-mono tabular-nums text-[#9CA3AF] hover:text-[#F3F4F6] disabled:opacity-30 transition-colors px-2 py-1 cursor-pointer"
            >
              <span>+{skipForwardSec}s</span>
              <RotateCw className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={onNextTrack}
              disabled={!currentEpisode}
              title="Next Episode"
              className="text-[#9CA3AF] hover:text-[#F3F4F6] disabled:opacity-30 transition-colors p-1.5 cursor-pointer"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right: Quick Reader & Export Actions */}
        <div className="hidden sm:flex items-center justify-end gap-2 shrink-0">
          {currentEpisode && (
            <>
              <button
                type="button"
                onClick={onOpenReaderMobile}
                className="lg:hidden px-3 py-1.5 rounded-lg border border-[#222631] bg-[#0B0D11] text-xs font-medium text-[#F3F4F6] hover:border-[#33394A] flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Script</span>
              </button>
              <button
                type="button"
                onClick={() => onDownloadMarkdown(currentEpisode)}
                title="Download Agent Markdown (.md)"
                className="px-3 py-1.5 rounded-lg border border-[#222631] bg-[#0B0D11] text-xs font-mono text-[#9CA3AF] hover:text-[#F3F4F6] hover:border-[#33394A] transition-colors whitespace-nowrap cursor-pointer"
              >
                Export .md
              </button>
              <a
                href={currentEpisode.canonical_url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg border border-[#222631] bg-[#0B0D11] text-xs font-medium text-[#9CA3AF] hover:text-[#F3F4F6] hover:border-[#33394A] flex items-center gap-1 transition-colors whitespace-nowrap"
              >
                <span>Source</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
