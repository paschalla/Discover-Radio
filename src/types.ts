export interface ParagraphSegment {
  index: number;
  text: string;
  charStart: number;
  charEnd: number;
  weightRatio: number; // 0.0 to 1.0 proportional offset for "Read from here" scrubbing
}

export interface ExtractedLink {
  label: string;
  url: string;
}

export type EpisodeOriginType =
  | 'discover_feed'
  | 'android_webhook'
  | 'custom_url'
  | 'custom_screenshot'
  | 'custom_text'
  | 'test_episode';

export type EpisodeContentType =
  | 'article'
  | 'x_thread_blog'
  | 'youtube_transcript'
  | 'youtube_audio'
  | 'calibration';

export interface Episode {
  id: string;
  url_hash: string;
  title_slug: string;
  canonical_url: string;
  title: string;
  source: string;
  author: string;
  origin_type: EpisodeOriginType;
  content_type: EpisodeContentType;
  voice_used: string;
  tts_rate_used: string;
  tts_pitch_used: string;
  audio_url: string;
  duration_estimate_sec: number;
  word_count: number;
  keywords: string[];
  summary_one_line: string;
  verbatim_script: string;
  paragraphs: ParagraphSegment[];
  extracted_links: ExtractedLink[];
  md_filename: string;
  json_filename: string;
  created_at: string;
}

export interface VoiceOption {
  id: string;
  name: string;
  gender: 'Male' | 'Female';
  style: string;
}

export interface AppConfig {
  tts: {
    mode: 'rotate' | 'single';
    single_voice: string;
    enabled_voices: string[];
    rate: string; // e.g. "+5%"
    pitch: string; // e.g. "+0Hz"
    announce_persona: boolean;
  };
  scraper: {
    interval_hours: number;
    scroll_depth: number;
    max_articles_per_batch: number;
    follow_x_secondary_links: boolean;
    youtube_music_filter: boolean;
    dedupe_title_similarity: boolean;
  };
  export: {
    auto_export_md: boolean;
    auto_export_json: boolean;
    update_registry_index: boolean;
  };
  ui: {
    card_density: 'compact' | 'comfortable' | 'spacious';
    thumbnail_style: 'banner' | 'side' | 'hidden';
    accent_color: string;
    reader_font_size: number;
    reader_line_height: number;
    skip_forward_sec: number;
    skip_back_sec: number;
    auto_advance: boolean;
  };
}

export interface FeedSource {
  id: string;
  name: string;
  url: string;
  category: string;
  enabled: boolean;
  last_checked_at: string | null;
}

export interface QueuedItemSummary {
  id: string;
  title: string;
  url: string;
  source: string;
  origin_type: EpisodeOriginType;
  priority: 'immediate' | 'next';
  queued_at: string;
}

export interface QueueStatus {
  is_running: boolean;
  currently_generating: {
    id: string;
    title: string;
    source: string;
    origin_type: EpisodeOriginType;
    locked_voice: string;
    locked_rate: string;
    locked_pitch: string;
    stage: string;
    started_at: string;
  } | null;
  queued_count: number;
  queued_items: QueuedItemSummary[];
  completed_in_session: number;
  skipped_duplicates_count: number;
  last_batch_run_at: string | null;
  last_error: string | null;
}

export interface RegistryIndexEntry {
  id: string;
  origin_type: EpisodeOriginType;
  title: string;
  source: string;
  author: string;
  captured_at: string;
  content_type: EpisodeContentType;
  voice_used: string;
  tts_prosody: string;
  keywords: string[];
  summary_one_line: string;
  word_count: number;
  canonical_url: string;
  md_file: string;
  json_file: string;
}

export interface RegistryIndex {
  schema_version: string;
  updated_at: string;
  total_items: number;
  items: RegistryIndexEntry[];
}
