import React, { useState } from 'react';
import {
  FileText,
  Image as ImageIcon,
  Link2,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import { AppConfig } from '../types.ts';

interface CustomIngestModalProps {
  isOpen: boolean;
  ttsConfig: AppConfig['tts'];
  onClose: () => void;
  onSubmitted: () => void;
}

type CustomMode = 'url' | 'screenshot' | 'text';

export const CustomIngestModal: React.FC<CustomIngestModalProps> = ({
  isOpen,
  ttsConfig,
  onClose,
  onSubmitted,
}) => {
  const [mode, setMode] = useState<CustomMode>('url');
  const [url, setUrl] = useState('');
  const [titleHint, setTitleHint] = useState('');
  const [sourceHint, setSourceHint] = useState('');
  const [rawText, setRawText] = useState('');
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [priority, setPriority] = useState<'immediate' | 'next'>('immediate');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('priority', priority);
      if (titleHint.trim()) formData.append('title_hint', titleHint.trim());
      if (sourceHint.trim()) formData.append('source_hint', sourceHint.trim());

      if (mode === 'url') {
        if (!url.trim()) {
          throw new Error('Please enter an article, X post, or YouTube URL.');
        }
        formData.append('url', url.trim());
      } else if (mode === 'screenshot') {
        if (!screenshotFile) {
          throw new Error('Please select a screenshot image to analyze.');
        }
        formData.append('screenshot', screenshotFile);
      } else {
        if (!rawText.trim()) {
          throw new Error('Please paste the text content to synthesize.');
        }
        formData.append('raw_text', rawText.trim());
      }

      const res = await fetch('/api/episodes/custom', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to enqueue custom content');
      }

      setUrl('');
      setTitleHint('');
      setSourceHint('');
      setRawText('');
      setScreenshotFile(null);
      onSubmitted();
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#13161C] border border-[#222631] rounded-2xl max-w-lg w-full p-5 sm:p-6 space-y-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[#222631] pb-3.5">
          <div>
            <h2 className="font-display text-base sm:text-lg font-bold text-[#F3F4F6]">
              Bring Custom Content
            </h2>
            <p className="text-xs text-[#9CA3AF] mt-0.5">
              Single-shot on-demand ingestion using the same verbatim scraper, Edge-TTS prosody, SQLite deduplication, and RAG Vault export pipeline.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg border border-[#222631] bg-[#0B0D11] text-[#9CA3AF] hover:text-[#F3F4F6] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Input Mode Tabs */}
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#0B0D11] border border-[#222631] rounded-xl">
          <button
            type="button"
            onClick={() => setMode('url')}
            className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              mode === 'url'
                ? 'bg-[var(--accent)] text-[#0B0D11]'
                : 'text-[#9CA3AF] hover:text-[#F3F4F6]'
            }`}
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>Web Link</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('screenshot')}
            className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              mode === 'screenshot'
                ? 'bg-[var(--accent)] text-[#0B0D11]'
                : 'text-[#9CA3AF] hover:text-[#F3F4F6]'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Screenshot</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('text')}
            className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              mode === 'text'
                ? 'bg-[var(--accent)] text-[#0B0D11]'
                : 'text-[#9CA3AF] hover:text-[#F3F4F6]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Raw Text</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'url' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[#D1D5DB] mb-1">
                  Target URL (Article, X Post with Blog Link, or YouTube Video)
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://www.tomshardware.com/... or https://x.com/..."
                  className="w-full bg-[#0B0D11] border border-[#222631] rounded-xl px-3.5 py-2.5 text-xs text-[#F3F4F6] placeholder-[#6B7280] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  value={titleHint}
                  onChange={(e) => setTitleHint(e.target.value)}
                  placeholder="Optional title override"
                  className="bg-[#0B0D11] border border-[#222631] rounded-xl px-3 py-2 text-xs text-[#F3F4F6] placeholder-[#6B7280] focus:outline-none focus:border-[var(--accent)]"
                />
                <input
                  type="text"
                  value={sourceHint}
                  onChange={(e) => setSourceHint(e.target.value)}
                  placeholder="Optional publisher label"
                  className="bg-[#0B0D11] border border-[#222631] rounded-xl px-3 py-2 text-xs text-[#F3F4F6] placeholder-[#6B7280] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>
          )}

          {mode === 'screenshot' && (
            <div className="space-y-3">
              <label className="flex flex-col items-center justify-center border border-dashed border-[#33394A] hover:border-[var(--accent)] rounded-xl p-6 cursor-pointer bg-[#0B0D11] text-center transition-colors">
                <Upload className="w-6 h-6 text-[var(--accent)] mb-2" />
                <span className="text-xs font-semibold text-[#F3F4F6]">
                  {screenshotFile
                    ? `Selected: ${screenshotFile.name}`
                    : 'Click to upload screenshot of an article or Discover card'}
                </span>
                <span className="text-[11px] text-[#9CA3AF] mt-1">
                  Gemini Vision extracts any visible URL, headline, source, and verbatim text
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setScreenshotFile(e.target.files[0]);
                    }
                  }}
                />
              </label>
              <input
                type="text"
                value={titleHint}
                onChange={(e) => setTitleHint(e.target.value)}
                placeholder="Optional headline hint (auto-detected via Vision if blank)"
                className="w-full bg-[#0B0D11] border border-[#222631] rounded-xl px-3 py-2 text-xs text-[#F3F4F6] placeholder-[#6B7280]"
              />
            </div>
          )}

          {mode === 'text' && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  value={titleHint}
                  onChange={(e) => setTitleHint(e.target.value)}
                  placeholder="Episode title..."
                  className="bg-[#0B0D11] border border-[#222631] rounded-xl px-3 py-2 text-xs text-[#F3F4F6] placeholder-[#6B7280]"
                />
                <input
                  type="text"
                  value={sourceHint}
                  onChange={(e) => setSourceHint(e.target.value)}
                  placeholder="Source / Author..."
                  className="bg-[#0B0D11] border border-[#222631] rounded-xl px-3 py-2 text-xs text-[#F3F4F6] placeholder-[#6B7280]"
                />
              </div>
              <textarea
                rows={5}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Paste full article text, newsletter, or technical document for 100% verbatim read-through..."
                className="w-full bg-[#0B0D11] border border-[#222631] rounded-xl p-3 text-xs text-[#F3F4F6] placeholder-[#6B7280] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
          )}

          {/* Queue Execution Priority */}
          <div className="bg-[#0B0D11] border border-[#222631] rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-[#D1D5DB]">
                Queue Placement & Pre-Generation Prosody
              </span>
              <span className="font-mono tabular-nums text-[#9CA3AF]">
                {ttsConfig.rate} / {ttsConfig.pitch}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label
                className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer text-xs ${
                  priority === 'immediate'
                    ? 'border-[var(--accent)] bg-[#13161C]'
                    : 'border-[#222631] bg-[#13161C]/50'
                }`}
              >
                <input
                  type="radio"
                  name="priority"
                  checked={priority === 'immediate'}
                  onChange={() => setPriority('immediate')}
                  className="mt-0.5"
                />
                <div>
                  <div className="font-semibold text-[#F3F4F6]">
                    Immediate / Jump Queue (#1)
                  </div>
                  <div className="text-[11px] text-[#9CA3AF]">
                    Starts right now or becomes next up in active batch
                  </div>
                </div>
              </label>

              <label
                className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer text-xs ${
                  priority === 'next'
                    ? 'border-[var(--accent)] bg-[#13161C]'
                    : 'border-[#222631] bg-[#13161C]/50'
                }`}
              >
                <input
                  type="radio"
                  name="priority"
                  checked={priority === 'next'}
                  onChange={() => setPriority('next')}
                  className="mt-0.5"
                />
                <div>
                  <div className="font-semibold text-[#F3F4F6]">
                    Append to Queue
                  </div>
                  <div className="text-[11px] text-[#9CA3AF]">
                    Synthesizes after currently queued items finish
                  </div>
                </div>
              </label>
            </div>
          </div>

          {errorMsg && (
            <p className="text-xs text-red-400 bg-red-950/40 border border-red-900/60 rounded-lg px-3 py-2">
              {errorMsg}
            </p>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-[#222631] bg-[#0B0D11] text-xs font-medium text-[#9CA3AF] hover:text-[#F3F4F6] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[#0B0D11] text-xs font-semibold hover:opacity-90 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Synthesize &amp; Add to Library</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
