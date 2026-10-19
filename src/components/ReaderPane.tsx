import React from 'react';
import {
  Download,
  ExternalLink,
  Headphones,
  Link as LinkIcon,
  X,
} from 'lucide-react';
import { Episode } from '../types.ts';
import { formatSeconds } from './MasterPlayer.tsx';

interface ReaderPaneProps {
  episode: Episode | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onSeekToRatio: (ratio: number) => void;
  onDownloadMarkdown: (ep: Episode) => void;
  onDownloadJson: (ep: Episode) => void;
  onCloseMobile?: () => void;
}

export const ReaderPane: React.FC<ReaderPaneProps> = ({
  episode,
  currentTime,
  duration,
  isPlaying,
  onSeekToRatio,
  onDownloadMarkdown,
  onDownloadJson,
  onCloseMobile,
}) => {
  if (!episode) {
    return (
      <aside className="bg-[#13161C] border border-[#222631] rounded-2xl p-6 flex flex-col items-center justify-center text-center min-h-[420px]">
        <Headphones className="w-8 h-8 text-[#6B7280] mb-3" />
        <h3 className="font-display text-base font-semibold text-[#F3F4F6] mb-1">
          Synchronized Verbatim Reader
        </h3>
        <p className="text-xs text-[#9CA3AF] max-w-xs leading-relaxed">
          Select any episode from the feed to inspect its 100% verbatim text, follow extracted blog links, or click any paragraph to seek audio playback directly to that passage.
        </p>
      </aside>
    );
  }

  const effectiveDuration =
    duration > 0 ? duration : episode.duration_estimate_sec || 60;
  const currentRatio =
    effectiveDuration > 0
      ? Math.min(1, Math.max(0, currentTime / effectiveDuration))
      : 0;

  const paragraphs =
    episode.paragraphs && episode.paragraphs.length > 0
      ? episode.paragraphs
      : [
          {
            index: 0,
            text: episode.verbatim_script,
            charStart: 0,
            charEnd: episode.verbatim_script.length,
            weightRatio: 0,
          },
        ];

  // Determine active paragraph index based on current playback ratio
  let activeParagraphIdx = 0;
  for (let i = 0; i < paragraphs.length; i++) {
    if (currentRatio >= paragraphs[i].weightRatio) {
      activeParagraphIdx = i;
    } else {
      break;
    }
  }

  const shortVoice = episode.voice_used
    .replace(/^en-US-/, '')
    .replace(/Neural$/, '');

  return (
    <aside className="bg-[#13161C] border border-[#222631] rounded-2xl flex flex-col overflow-hidden max-h-[calc(100vh-11rem)]">
      {/* Top Reader Header */}
      <div className="p-4 sm:p-5 border-b border-[#222631] flex items-start justify-between gap-4 bg-[#0B0D11]/50">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#9CA3AF] mb-1">
            <span className="font-semibold text-[var(--accent)]">
              {episode.source}
            </span>
            <span aria-hidden="true">·</span>
            <span>{episode.author}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-[#F3F4F6]">{shortVoice}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-[#6B7280]">
              {episode.tts_rate_used} / {episode.tts_pitch_used}
            </span>
          </div>
          <h2 className="font-display text-base sm:text-lg font-bold text-[#F3F4F6] leading-snug">
            {episode.title}
          </h2>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => onDownloadMarkdown(episode)}
            title="Download Verbatim Markdown (.md)"
            className="px-2.5 py-1.5 rounded-lg border border-[#222631] bg-[#0B0D11] text-xs font-mono text-[#9CA3AF] hover:text-[#F3F4F6] hover:border-[#33394A] transition-colors flex items-center gap-1 cursor-pointer"
          >
            <Download className="w-3 h-3" />
            <span>.md</span>
          </button>
          <button
            type="button"
            onClick={() => onDownloadJson(episode)}
            title="Download Structured JSON (.json)"
            className="px-2.5 py-1.5 rounded-lg border border-[#222631] bg-[#0B0D11] text-xs font-mono text-[#9CA3AF] hover:text-[#F3F4F6] hover:border-[#33394A] transition-colors flex items-center gap-1 cursor-pointer"
          >
            <Download className="w-3 h-3" />
            <span>.json</span>
          </button>
          <a
            href={episode.canonical_url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1.5 rounded-lg border border-[#222631] bg-[#0B0D11] text-xs font-medium text-[var(--accent)] hover:border-[#33394A] transition-colors flex items-center gap-1 whitespace-nowrap"
          >
            <span>Web</span>
            <ExternalLink className="w-3 h-3" />
          </a>
          {onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Close Reader"
              className="p-1.5 rounded-lg border border-[#222631] bg-[#0B0D11] text-[#9CA3AF] hover:text-[#F3F4F6] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Extracted Links Bar (e.g. Secondary Blogs linked inside X posts) */}
      {episode.extracted_links && episode.extracted_links.length > 0 && (
        <div className="px-4 py-2.5 bg-[#0B0D11]/80 border-b border-[#222631] flex items-center gap-2 overflow-x-auto">
          <span className="text-[11px] font-medium text-[#9CA3AF] flex items-center gap-1 shrink-0">
            <LinkIcon className="w-3 h-3 text-[var(--accent)]" />
            <span>Extracted Links:</span>
          </span>
          {episode.extracted_links.map((lnk, idx) => (
            <a
              key={`${lnk.url}-${idx}`}
              href={lnk.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[var(--accent)] hover:underline whitespace-nowrap shrink-0 flex items-center gap-1 after:content-['·'] last:after:content-none after:ml-2 after:text-[#6B7280]"
            >
              <span>{lnk.label}</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          ))}
        </div>
      )}

      {/* Interactive "Read From Here" Instruction Banner */}
      <div className="px-4 py-2 bg-[#13161C] border-b border-[#222631] flex items-center justify-between text-[11px] text-[#9CA3AF]">
        <span>Click any paragraph below to read from that point</span>
        <span className="font-mono tabular-nums">
          {episode.word_count} words · #{episode.url_hash.slice(0, 8)}
        </span>
      </div>

      {/* Clickable Paragraph Blocks */}
      <div className="p-4 sm:p-6 overflow-y-auto space-y-3 flex-1 select-text">
        {paragraphs.map((para, idx) => {
          const isCurrentPara = idx === activeParagraphIdx && (isPlaying || currentTime > 0);
          const timestampSec = Math.round(para.weightRatio * effectiveDuration);

          return (
            <div
              key={para.index}
              onClick={() => onSeekToRatio(para.weightRatio)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSeekToRatio(para.weightRatio);
                }
              }}
              className={`group rounded-xl p-3 transition-colors cursor-pointer border ${
                isCurrentPara
                  ? 'bg-[#0B0D11] border-[var(--accent)]/60 text-[#F3F4F6]'
                  : 'bg-transparent border-transparent hover:bg-[#0B0D11]/60 hover:border-[#222631] text-[#D1D5DB]'
              }`}
            >
              <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-[#6B7280] mb-1">
                <span className="group-hover:text-[var(--accent)] transition-colors">
                  {isCurrentPara ? 'Now Reading' : 'Read from here'}
                </span>
                <span>{formatSeconds(timestampSec)}</span>
              </div>
              <p className="reader-prose whitespace-pre-wrap">{para.text}</p>
            </div>
          );
        })}
      </div>
    </aside>
  );
};
