import React, { useState } from 'react';
import {
  Check,
  Download,
  FlaskConical,
  Loader2,
  Sliders,
  Trash2,
  Volume2,
} from 'lucide-react';
import { AppConfig, VoiceOption } from '../types.ts';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';

interface TuneViewProps {
  config: AppConfig;
  availableVoices: VoiceOption[];
  dedupeStats: { totalEpisodes: number; totalSeenHashes: number };
  isTestGenerating: boolean;
  onUpdateConfig: (nextCfg: AppConfig) => Promise<void>;
  onGenerateTestEpisode: (overrideVoice?: string) => Promise<void>;
  onClearDedupeHashes: () => Promise<void>;
}

const ACCENT_PRESETS = [
  { name: 'Electric Sky', hex: '#60A5FA' },
  { name: 'Broadcast Emerald', hex: '#34D399' },
  { name: 'Studio Amber', hex: '#F59E0B' },
  { name: 'Signal Coral', hex: '#FB7185' },
  { name: 'Acoustic Violet', hex: '#A78BFA' },
];

export const TuneView: React.FC<TuneViewProps> = ({
  config,
  availableVoices,
  dedupeStats,
  isTestGenerating,
  onUpdateConfig,
  onGenerateTestEpisode,
  onClearDedupeHashes,
}) => {
  const [auditioningVoice, setAuditioningVoice] = useState<string | null>(null);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const { isInstallable, isInstalled, install } = usePWAInstall();

  const rateNumeric = parseInt(config.tts.rate.replace(/[^-\d]/g, ''), 10) || 0;
  const pitchNumeric = parseInt(config.tts.pitch.replace(/[^-\d]/g, ''), 10) || 0;

  const commitChange = async (next: AppConfig, label?: string) => {
    await onUpdateConfig(next);
    if (label) {
      setSaveToast(label);
      setTimeout(() => setSaveToast(null), 2400);
    }
  };

  const handleToggleVoiceInPool = async (voiceId: string) => {
    const currentPool = config.tts.enabled_voices || [];
    let nextPool: string[];
    if (currentPool.includes(voiceId)) {
      if (currentPool.length <= 1) return; // keep at least 1 active voice
      nextPool = currentPool.filter((id) => id !== voiceId);
    } else {
      nextPool = [...currentPool, voiceId];
    }
    await commitChange(
      {
        ...config,
        tts: { ...config.tts, enabled_voices: nextPool },
      },
      'Updated voice rotation pool for next episode'
    );
  };

  const handleAuditionVoice = async (voiceId: string) => {
    setAuditioningVoice(voiceId);
    try {
      await onGenerateTestEpisode(voiceId);
    } finally {
      setAuditioningVoice(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Status Banner */}
      <div className="bg-[#13161C] border border-[#222631] rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base sm:text-lg font-bold text-[#F3F4F6] flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[var(--accent)]" />
            <span>Engine &amp; Interface Tuning</span>
          </h2>
          <p className="text-xs text-[#9CA3AF] mt-0.5">
            Pre-generation TTS changes apply to the <strong>next queued episode or batch</strong>; previously generated and currently synthesizing episodes remain 100% immutable.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {saveToast && (
            <span className="text-xs font-medium text-emerald-400 flex items-center gap-1">
              <Check className="w-3.5 h-3.5" />
              <span>{saveToast}</span>
            </span>
          )}
          <button
            type="button"
            onClick={() => onGenerateTestEpisode()}
            disabled={isTestGenerating}
            className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[#0B0D11] text-xs font-semibold hover:opacity-90 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {isTestGenerating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FlaskConical className="w-3.5 h-3.5" />
            )}
            <span>Generate Test Episode Now</span>
          </button>
        </div>
      </div>

      {/* 1. PRE-GENERATION PROSODY & VOICE PERSONA MATRIX */}
      <div className="bg-[#13161C] border border-[#222631] rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#222631] pb-4">
          <div>
            <h3 className="font-display text-base font-bold text-[#F3F4F6]">
              01. Pre-Generation Edge-TTS Prosody &amp; Voice Matrix (en-US)
            </h3>
            <p className="text-xs text-[#9CA3AF] mt-0.5">
              Speech rate and vocal pitch are injected directly into neural synthesis prior to MP3 rendering for zero time-stretch artifacts.
            </p>
          </div>

          <select
            value={config.tts.mode}
            onChange={(e) =>
              commitChange(
                {
                  ...config,
                  tts: {
                    ...config.tts,
                    mode: e.target.value as 'rotate' | 'single',
                  },
                },
                `Switched to ${e.target.value} voice mode`
              )
            }
            className="bg-[#0B0D11] border border-[#222631] rounded-xl px-3 py-2 text-xs font-semibold text-[#F3F4F6]"
          >
            <option value="rotate">Rotate Checked Voice Pool</option>
            <option value="single">Single Locked Voice Persona</option>
          </select>
        </div>

        {/* Pre-Generation Speech Rate & Pitch Sliders */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-[#0B0D11] border border-[#222631] rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-[#D1D5DB]">
                Pre-Generation Speech Rate
              </span>
              <span className="font-mono font-semibold tabular-nums text-[var(--accent)]">
                {config.tts.rate}
              </span>
            </div>
            <input
              type="range"
              min={-25}
              max={45}
              step={5}
              value={rateNumeric}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                const formatted = `${v >= 0 ? '+' : ''}${v}%`;
                void commitChange(
                  { ...config, tts: { ...config.tts, rate: formatted } },
                  `Staged ${formatted} speech rate for next episode`
                );
              }}
              className="w-full cursor-pointer"
            />
            <div className="flex justify-between text-[11px] font-mono tabular-nums text-[#6B7280]">
              <span>-25% (Measured)</span>
              <span>+0% (Natural)</span>
              <span>+45% (Brisk)</span>
            </div>
          </div>

          <div className="bg-[#0B0D11] border border-[#222631] rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-[#D1D5DB]">
                Pre-Generation Vocal Pitch
              </span>
              <span className="font-mono font-semibold tabular-nums text-[var(--accent)]">
                {config.tts.pitch}
              </span>
            </div>
            <input
              type="range"
              min={-20}
              max={20}
              step={2}
              value={pitchNumeric}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                const formatted = `${v >= 0 ? '+' : ''}${v}Hz`;
                void commitChange(
                  { ...config, tts: { ...config.tts, pitch: formatted } },
                  `Staged ${formatted} vocal pitch for next episode`
                );
              }}
              className="w-full cursor-pointer"
            />
            <div className="flex justify-between text-[11px] font-mono tabular-nums text-[#6B7280]">
              <span>-20Hz (Deeper)</span>
              <span>+0Hz (Neutral)</span>
              <span>+20Hz (Brighter)</span>
            </div>
          </div>
        </div>

        {/* Single Voice Selector if Locked Mode */}
        {config.tts.mode === 'single' && (
          <div className="bg-[#0B0D11] border border-[#222631] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-[#F3F4F6]">
                Locked Voice Model
              </div>
              <div className="text-[11px] text-[#9CA3AF]">
                All upcoming episodes will be synthesized exclusively with this voice
              </div>
            </div>
            <select
              value={config.tts.single_voice}
              onChange={(e) =>
                commitChange(
                  {
                    ...config,
                    tts: { ...config.tts, single_voice: e.target.value },
                  },
                  `Locked voice to ${e.target.value}`
                )
              }
              className="bg-[#13161C] border border-[#222631] rounded-xl px-3.5 py-2 text-xs text-[#F3F4F6]"
            >
              {availableVoices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.gender} · {v.style})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Checkable Rotation Matrix */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#9CA3AF]">
              Available EN-US Neural Personas ({config.tts.enabled_voices.length} of{' '}
              {availableVoices.length} checked for rotation)
            </span>
            <div className="flex items-center gap-3 text-xs">
              <button
                type="button"
                onClick={() =>
                  commitChange(
                    {
                      ...config,
                      tts: {
                        ...config.tts,
                        enabled_voices: availableVoices.map((v) => v.id),
                      },
                    },
                    'Enabled all 12 EN-US voices'
                  )
                }
                className="text-[var(--accent)] hover:underline cursor-pointer"
              >
                Check All
              </button>
              <button
                type="button"
                onClick={() =>
                  commitChange(
                    {
                      ...config,
                      tts: {
                        ...config.tts,
                        enabled_voices: ['en-US-AndrewNeural'],
                      },
                    },
                    'Reset rotation pool to Andrew'
                  )
                }
                className="text-[#9CA3AF] hover:text-[#F3F4F6] hover:underline cursor-pointer"
              >
                Reset
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {availableVoices.map((voice) => {
              const isChecked = config.tts.enabled_voices.includes(voice.id);
              const isAuditioning = auditioningVoice === voice.id;
              return (
                <div
                  key={voice.id}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-2 transition-colors ${
                    isChecked
                      ? 'bg-[#0B0D11] border-[#222631]'
                      : 'bg-[#0B0D11]/40 border-[#222631]/50 opacity-60'
                  }`}
                >
                  <label className="flex items-start gap-2.5 cursor-pointer min-w-0 flex-1">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleVoiceInPool(voice.id)}
                      className="mt-0.5 w-4 h-4 rounded"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#F3F4F6] flex items-center gap-1.5">
                        <span>{voice.name}</span>
                        <span className="text-[11px] font-normal text-[#6B7280]">
                          · {voice.gender}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#9CA3AF] truncate">
                        {voice.style}
                      </div>
                    </div>
                  </label>

                  <button
                    type="button"
                    onClick={() => handleAuditionVoice(voice.id)}
                    disabled={isTestGenerating}
                    title={`Synthesize test episode with ${voice.name}`}
                    className="px-2.5 py-1.5 rounded-lg border border-[#222631] bg-[#13161C] hover:border-[var(--accent)] text-[11px] font-medium text-[#F3F4F6] flex items-center gap-1 shrink-0 cursor-pointer disabled:opacity-40"
                  >
                    {isAuditioning ? (
                      <Loader2 className="w-3 h-3 animate-spin text-[var(--accent)]" />
                    ) : (
                      <Volume2 className="w-3 h-3 text-[var(--accent)]" />
                    )}
                    <span>Test</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <label className="flex items-center justify-between pt-2 border-t border-[#222631] text-xs text-[#D1D5DB] cursor-pointer">
          <span>
            Announce speaker persona in spoken intro (e.g., &ldquo;Published on Tom&apos;s Hardware. Read by Ava.&rdquo;)
          </span>
          <input
            type="checkbox"
            checked={config.tts.announce_persona}
            onChange={(e) =>
              commitChange({
                ...config,
                tts: { ...config.tts, announce_persona: e.target.checked },
              })
            }
            className="w-4 h-4 rounded"
          />
        </label>
      </div>

      {/* 2. SCRAPING INTERVAL, ROUTING & DEDUPLICATION */}
      <div className="bg-[#13161C] border border-[#222631] rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#222631] pb-3.5">
          <div>
            <h3 className="font-display text-base font-bold text-[#F3F4F6]">
              02. Scraper Cadence, Smart Content Routing &amp; Deduplication
            </h3>
            <p className="text-xs text-[#9CA3AF] mt-0.5">
              Control batch polling intervals, Playwright scroll depth, X link resolution, and SQLite hash deduplication.
            </p>
          </div>
          <button
            type="button"
            onClick={onClearDedupeHashes}
            className="px-3 py-1.5 rounded-xl border border-[#222631] bg-[#0B0D11] hover:border-red-500/50 text-xs text-[#9CA3AF] hover:text-red-400 flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Reset Seen Hashes ({dedupeStats.totalSeenHashes})</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-[#0B0D11] border border-[#222631] rounded-xl p-4 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-[#9CA3AF]">Batch Schedule Interval</span>
              <span className="font-mono font-semibold tabular-nums text-[#F3F4F6]">
                Every {config.scraper.interval_hours}h
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={24}
              step={1}
              value={config.scraper.interval_hours}
              onChange={(e) =>
                commitChange({
                  ...config,
                  scraper: {
                    ...config.scraper,
                    interval_hours: parseInt(e.target.value, 10),
                  },
                })
              }
              className="w-full cursor-pointer"
            />
          </div>

          <div className="bg-[#0B0D11] border border-[#222631] rounded-xl p-4 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-[#9CA3AF]">Playwright Scroll Depth</span>
              <span className="font-mono font-semibold tabular-nums text-[#F3F4F6]">
                {config.scraper.scroll_depth}x viewport
              </span>
            </div>
            <input
              type="range"
              min={3}
              max={20}
              step={1}
              value={config.scraper.scroll_depth}
              onChange={(e) =>
                commitChange({
                  ...config,
                  scraper: {
                    ...config.scraper,
                    scroll_depth: parseInt(e.target.value, 10),
                  },
                })
              }
              className="w-full cursor-pointer"
            />
          </div>

          <div className="bg-[#0B0D11] border border-[#222631] rounded-xl p-4 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-[#9CA3AF]">Max Episodes Per Batch</span>
              <span className="font-mono font-semibold tabular-nums text-[#F3F4F6]">
                {config.scraper.max_articles_per_batch} items
              </span>
            </div>
            <input
              type="range"
              min={2}
              max={20}
              step={1}
              value={config.scraper.max_articles_per_batch}
              onChange={(e) =>
                commitChange({
                  ...config,
                  scraper: {
                    ...config.scraper,
                    max_articles_per_batch: parseInt(e.target.value, 10),
                  },
                })
              }
              className="w-full cursor-pointer"
            />
          </div>
        </div>

        <div className="space-y-3 pt-1 text-xs text-[#D1D5DB]">
          <label className="flex items-center justify-between cursor-pointer">
            <span>
              Strict Canonical URL SHA-256 + Normalized Title Slug Deduplication
            </span>
            <input
              type="checkbox"
              checked={config.scraper.dedupe_title_similarity}
              onChange={(e) =>
                commitChange({
                  ...config,
                  scraper: {
                    ...config.scraper,
                    dedupe_title_similarity: e.target.checked,
                  },
                })
              }
              className="w-4 h-4 rounded"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer">
            <span>
              Follow secondary external blog links inside X / Twitter posts (e.g., Replit engineering blogs)
            </span>
            <input
              type="checkbox"
              checked={config.scraper.follow_x_secondary_links}
              onChange={(e) =>
                commitChange({
                  ...config,
                  scraper: {
                    ...config.scraper,
                    follow_x_secondary_links: e.target.checked,
                  },
                })
              }
              className="w-4 h-4 rounded"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer">
            <span>
              Automatically filter out Music / Guitar Tab YouTube videos
            </span>
            <input
              type="checkbox"
              checked={config.scraper.youtube_music_filter}
              onChange={(e) =>
                commitChange({
                  ...config,
                  scraper: {
                    ...config.scraper,
                    youtube_music_filter: e.target.checked,
                  },
                })
              }
              className="w-4 h-4 rounded"
            />
          </label>
        </div>
      </div>

      {/* 3. UI / UX ERGONOMICS & READER TWEAKS */}
      <div className="bg-[#13161C] border border-[#222631] rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-[#222631] pb-3.5">
          <div>
            <h3 className="font-display text-base font-bold text-[#F3F4F6]">
              03. Interface Layout, Reader Typography &amp; Transport Ergonomics
            </h3>
            <p className="text-xs text-[#9CA3AF] mt-0.5">
              Live-reactive visual controls affecting feed density, reader legibility, and player skip steps.
            </p>
          </div>

          {!isInstalled && isInstallable && (
            <button
              type="button"
              onClick={install}
              className="px-3.5 py-2 rounded-xl bg-[var(--accent)] text-[#0B0D11] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Install Android / Desktop PWA</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-[#0B0D11] border border-[#222631] rounded-xl p-4 space-y-2">
            <label className="block text-xs text-[#9CA3AF]">Card Density</label>
            <select
              value={config.ui.card_density}
              onChange={(e) =>
                commitChange({
                  ...config,
                  ui: {
                    ...config.ui,
                    card_density: e.target.value as AppConfig['ui']['card_density'],
                  },
                })
              }
              className="w-full bg-[#13161C] border border-[#222631] rounded-lg px-3 py-2 text-xs text-[#F3F4F6]"
            >
              <option value="compact">Compact (High Density)</option>
              <option value="comfortable">Comfortable (Default)</option>
              <option value="spacious">Spacious (Editorial)</option>
            </select>
          </div>

          <div className="bg-[#0B0D11] border border-[#222631] rounded-xl p-4 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-[#9CA3AF]">Reader Font Size</span>
              <span className="font-mono font-semibold tabular-nums text-[#F3F4F6]">
                {config.ui.reader_font_size}px
              </span>
            </div>
            <input
              type="range"
              min={13}
              max={22}
              step={1}
              value={config.ui.reader_font_size}
              onChange={(e) =>
                commitChange({
                  ...config,
                  ui: {
                    ...config.ui,
                    reader_font_size: parseInt(e.target.value, 10),
                  },
                })
              }
              className="w-full cursor-pointer"
            />
          </div>

          <div className="bg-[#0B0D11] border border-[#222631] rounded-xl p-4 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-[#9CA3AF]">Transport Skip Step</span>
              <span className="font-mono font-semibold tabular-nums text-[#F3F4F6]">
                ±{config.ui.skip_forward_sec}s
              </span>
            </div>
            <input
              type="range"
              min={5}
              max={60}
              step={5}
              value={config.ui.skip_forward_sec}
              onChange={(e) => {
                const sec = parseInt(e.target.value, 10);
                void commitChange({
                  ...config,
                  ui: {
                    ...config.ui,
                    skip_forward_sec: sec,
                    skip_back_sec: sec,
                  },
                });
              }}
              className="w-full cursor-pointer"
            />
          </div>
        </div>

        {/* Accent Color Swatches */}
        <div className="bg-[#0B0D11] border border-[#222631] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-xs font-medium text-[#D1D5DB]">
              Interface Accent Color
            </div>
            <div className="text-[11px] text-[#9CA3AF]">
              Concentrated 10% accent budget applied across active controls and indicators
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {ACCENT_PRESETS.map((preset) => {
              const isSelected =
                config.ui.accent_color.toLowerCase() === preset.hex.toLowerCase();
              return (
                <button
                  key={preset.hex}
                  type="button"
                  title={preset.name}
                  onClick={() =>
                    commitChange({
                      ...config,
                      ui: { ...config.ui, accent_color: preset.hex },
                    })
                  }
                  style={{ backgroundColor: preset.hex }}
                  className={`w-7 h-7 rounded-full cursor-pointer transition-transform ${
                    isSelected
                      ? 'ring-2 ring-white scale-110'
                      : 'opacity-80 hover:opacity-100'
                  }`}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
