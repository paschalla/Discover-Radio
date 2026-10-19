import React, { useState } from 'react';
import {
  Check,
  Copy,
  Database,
  Download,
  Loader2,
  Search,
  Sparkles,
} from 'lucide-react';
import { Episode, RegistryIndex } from '../types.ts';

interface VaultViewProps {
  episodes: Episode[];
  onDownloadMarkdown: (ep: Episode) => void;
  onDownloadJson: (ep: Episode) => void;
  onSelectForReader: (ep: Episode) => void;
}

export const VaultView: React.FC<VaultViewProps> = ({
  episodes,
  onDownloadMarkdown,
  onDownloadJson,
  onSelectForReader,
}) => {
  const [ragQuery, setRagQuery] = useState('');
  const [isQuerying, setIsQuerying] = useState(false);
  const [ragResult, setRagResult] = useState<{
    stage1_scanned_count: number;
    matched_episodes: Array<{
      id: string;
      title: string;
      source: string;
      captured_at: string;
      md_filename: string;
    }>;
    answer: string;
  } | null>(null);
  const [copiedRegistry, setCopiedRegistry] = useState(false);

  const registryObject: RegistryIndex = {
    schema_version: '1.2-agent-rag-index',
    updated_at: new Date().toISOString(),
    total_items: episodes.length,
    items: episodes.map((ep) => ({
      id: ep.id,
      origin_type: ep.origin_type,
      title: ep.title,
      source: ep.source,
      author: ep.author,
      captured_at: ep.created_at,
      content_type: ep.content_type,
      voice_used: ep.voice_used,
      tts_prosody: `${ep.tts_rate_used} / ${ep.tts_pitch_used}`,
      keywords: ep.keywords,
      summary_one_line: ep.summary_one_line,
      word_count: ep.word_count,
      canonical_url: ep.canonical_url,
      md_file: `md/${ep.md_filename}`,
      json_file: `json/${ep.json_filename}`,
    })),
  };

  const handleDownloadRegistry = () => {
    const blob = new Blob([JSON.stringify(registryObject, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'registry_index.json';
    a.click();
  };

  const handleCopyRegistry = async () => {
    await navigator.clipboard.writeText(JSON.stringify(registryObject, null, 2));
    setCopiedRegistry(true);
    setTimeout(() => setCopiedRegistry(false), 2000);
  };

  const handleRunRagQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ragQuery.trim()) return;
    setIsQuerying(true);
    try {
      const res = await fetch('/api/vault/rag-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: ragQuery.trim() }),
      });
      const data = await res.json();
      setRagResult(data);
    } catch (err) {
      setRagResult({
        stage1_scanned_count: episodes.length,
        matched_episodes: [],
        answer: err instanceof Error ? err.message : 'RAG lookup failed',
      });
    } finally {
      setIsQuerying(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Registry Export Card */}
      <div className="bg-[#13161C] border border-[#222631] rounded-2xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-display text-lg font-bold text-[#F3F4F6] flex items-center gap-2">
            <Database className="w-5 h-5 text-[var(--accent)]" />
            <span>Agent-Friendly RAG Knowledge Vault</span>
          </h2>
          <p className="text-xs sm:text-sm text-[#9CA3AF] max-w-3xl leading-relaxed">
            Every generated episode is automatically written to disk at{' '}
            <code className="font-mono text-[#F3F4F6]">data/exports/md/</code> (with rich YAML frontmatter) and{' '}
            <code className="font-mono text-[#F3F4F6]">data/exports/json/</code>, while updating the master{' '}
            <code className="font-mono text-[var(--accent)]">registry_index.json</code> catalog for two-stage agent retrieval.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleCopyRegistry}
            className="px-3.5 py-2 rounded-xl border border-[#222631] bg-[#0B0D11] hover:border-[#33394A] text-xs font-medium text-[#F3F4F6] flex items-center gap-1.5 cursor-pointer"
          >
            {copiedRegistry ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Copied JSON</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-[#9CA3AF]" />
                <span>Copy Registry JSON</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleDownloadRegistry}
            className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[#0B0D11] hover:opacity-90 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download registry_index.json</span>
          </button>
        </div>
      </div>

      {/* Interactive Two-Stage Agentic RAG Verification Sandbox */}
      <div className="bg-[#13161C] border border-[#222631] rounded-2xl p-5 sm:p-6 space-y-4">
        <div>
          <h3 className="font-display text-base font-bold text-[#F3F4F6] flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[var(--accent)]" />
            <span>Two-Stage Agent RAG Retrieval Tester</span>
          </h3>
          <p className="text-xs text-[#9CA3AF] mt-0.5">
            Stage 1 scans <code className="font-mono">registry_index.json</code> titles, keywords, and timestamps; Stage 2 ingests the full verbatim <code className="font-mono">.md</code> source documents of top matches to answer your query.
          </p>
        </div>

        <form onSubmit={handleRunRagQuery} className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#6B7280] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={ragQuery}
              onChange={(e) => setRagQuery(e.target.value)}
              placeholder="Ask about specs, quotes, or details from articles in your feed library..."
              className="w-full bg-[#0B0D11] border border-[#222631] rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-[#F3F4F6] placeholder-[#6B7280] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          <button
            type="submit"
            disabled={isQuerying || !ragQuery.trim()}
            className="px-5 py-2.5 rounded-xl bg-[var(--accent)] text-[#0B0D11] text-xs font-semibold hover:opacity-90 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
          >
            {isQuerying && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>Query RAG Vault</span>
          </button>
        </form>

        {ragResult && (
          <div className="bg-[#0B0D11] border border-[#222631] rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#9CA3AF] border-b border-[#222631] pb-2">
              <span>
                Stage 1 scanned {ragResult.stage1_scanned_count} registry entries · Stage 2 ingested{' '}
                {ragResult.matched_episodes.length} verbatim source docs
              </span>
              {ragResult.matched_episodes.length > 0 && (
                <span className="font-mono text-[11px] text-[var(--accent)]">
                  Matched: {ragResult.matched_episodes.map((m) => m.source).join(' · ')}
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-[#F3F4F6] leading-relaxed whitespace-pre-wrap">
              {ragResult.answer}
            </p>
          </div>
        )}
      </div>

      {/* Split Grid: Master Registry Index JSON Preview + Exported Episode Files */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 5 Cols: Live registry_index.json Preview */}
        <div className="lg:col-span-5 bg-[#13161C] border border-[#222631] rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-[#F3F4F6]">
              Master registry_index.json
            </h3>
            <span className="text-xs font-mono tabular-nums text-[#9CA3AF]">
              {registryObject.total_items} indexed
            </span>
          </div>
          <pre className="bg-[#0B0D11] border border-[#222631] rounded-xl p-3.5 text-[11px] font-mono text-[#9CA3AF] overflow-x-auto max-h-[460px] select-text">
            {JSON.stringify(registryObject, null, 2)}
          </pre>
        </div>

        {/* Right 7 Cols: Individual Exported Documents Table */}
        <div className="lg:col-span-7 bg-[#13161C] border border-[#222631] rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-[#F3F4F6]">
              Persisted Verbatim Documents (.md &amp; .json)
            </h3>
            <span className="text-xs text-[#9CA3AF]">
              Click any row to inspect verbatim script
            </span>
          </div>

          {episodes.length === 0 ? (
            <div className="bg-[#0B0D11] border border-[#222631] rounded-xl p-8 text-center text-xs text-[#9CA3AF]">
              No exported documents yet. Sync a batch or generate a test episode to populate the vault.
            </div>
          ) : (
            <div className="divide-y divide-[#222631] border border-[#222631] rounded-xl bg-[#0B0D11] overflow-hidden">
              {episodes.map((ep) => (
                <div
                  key={ep.id}
                  className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#13161C]/60 transition-colors"
                >
                  <div
                    onClick={() => onSelectForReader(ep)}
                    className="min-w-0 flex-1 cursor-pointer"
                  >
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono text-[#9CA3AF]">
                      <span className="text-[var(--accent)]">{ep.source}</span>
                      <span aria-hidden="true">·</span>
                      <span>{ep.created_at.slice(0, 10)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{ep.word_count} words</span>
                      <span aria-hidden="true">·</span>
                      <span>#{ep.url_hash.slice(0, 6)}</span>
                    </div>
                    <p className="text-xs sm:text-sm font-semibold text-[#F3F4F6] truncate mt-0.5">
                      {ep.title}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onDownloadMarkdown(ep)}
                      className="px-3 py-1.5 rounded-lg border border-[#222631] bg-[#13161C] hover:border-[#33394A] text-xs font-mono text-[#F3F4F6] flex items-center gap-1 cursor-pointer"
                    >
                      <Download className="w-3 h-3 text-[var(--accent)]" />
                      <span>.md</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDownloadJson(ep)}
                      className="px-3 py-1.5 rounded-lg border border-[#222631] bg-[#13161C] hover:border-[#33394A] text-xs font-mono text-[#F3F4F6] flex items-center gap-1 cursor-pointer"
                    >
                      <Download className="w-3 h-3 text-[var(--accent)]" />
                      <span>.json</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
