import { AppConfig, FeedSource, VoiceOption } from '../types.ts';

export const EN_US_VOICES: VoiceOption[] = [
  { id: 'en-US-AndrewNeural', name: 'Andrew', gender: 'Male', style: 'Warm, Natural News Anchor' },
  { id: 'en-US-AvaNeural', name: 'Ava', gender: 'Female', style: 'Expressive, Conversational Host' },
  { id: 'en-US-BrianNeural', name: 'Brian', gender: 'Male', style: 'Clear, Articulate Tech Reviewer' },
  { id: 'en-US-EmmaNeural', name: 'Emma', gender: 'Female', style: 'Polished, Editorial Podcast Host' },
  { id: 'en-US-ChristopherNeural', name: 'Christopher', gender: 'Male', style: 'Authoritative, Deep Broadcast' },
  { id: 'en-US-SteffanNeural', name: 'Steffan', gender: 'Male', style: 'Crisp, Analytical Journalism' },
  { id: 'en-US-AriaNeural', name: 'Aria', gender: 'Female', style: 'Upbeat, Dynamic Narrator' },
  { id: 'en-US-GuyNeural', name: 'Guy', gender: 'Male', style: 'Relaxed, Long-Form Feature Reader' },
  { id: 'en-US-JennyNeural', name: 'Jenny', gender: 'Female', style: 'Friendly, Balanced Assistant' },
  { id: 'en-US-EricNeural', name: 'Eric', gender: 'Male', style: 'Measured, Documentary Cadence' },
  { id: 'en-US-MichelleNeural', name: 'Michelle', gender: 'Female', style: 'Smooth, Essay & Deep-Dive Voice' },
  { id: 'en-US-RogerNeural', name: 'Roger', gender: 'Male', style: 'Classic Radio Baritone' },
];

export const DEFAULT_CONFIG: AppConfig = {
  tts: {
    mode: 'rotate',
    single_voice: 'en-US-AndrewNeural',
    enabled_voices: [
      'en-US-AndrewNeural',
      'en-US-AvaNeural',
      'en-US-BrianNeural',
      'en-US-EmmaNeural',
      'en-US-SteffanNeural',
      'en-US-ChristopherNeural',
    ],
    rate: '+5%',
    pitch: '+0Hz',
    announce_persona: true,
  },
  scraper: {
    interval_hours: 12,
    scroll_depth: 8,
    max_articles_per_batch: 6,
    follow_x_secondary_links: true,
    youtube_music_filter: true,
    dedupe_title_similarity: true,
  },
  export: {
    auto_export_md: true,
    auto_export_json: true,
    update_registry_index: true,
  },
  ui: {
    card_density: 'comfortable',
    thumbnail_style: 'side',
    accent_color: '#60A5FA',
    reader_font_size: 16,
    reader_line_height: 1.65,
    skip_forward_sec: 15,
    skip_back_sec: 15,
    auto_advance: true,
  },
};

export const DEFAULT_FEED_SOURCES: FeedSource[] = [
  {
    id: 'feed-tomshardware',
    name: "Tom's Hardware",
    url: 'https://www.tomshardware.com/feeds/all',
    category: 'Hardware & Semiconductors',
    enabled: true,
    last_checked_at: null,
  },
  {
    id: 'feed-xda',
    name: 'XDA Developers',
    url: 'https://www.xda-developers.com/feed/',
    category: 'Linux, Android & Self-Hosting',
    enabled: true,
    last_checked_at: null,
  },
  {
    id: 'feed-techradar',
    name: 'TechRadar Pro & Computing',
    url: 'https://www.techradar.com/rss',
    category: 'Enterprise & GPUs',
    enabled: true,
    last_checked_at: null,
  },
  {
    id: 'feed-cnx',
    name: 'CNX Software Embedded',
    url: 'https://www.cnx-software.com/feed/',
    category: 'SBCs & Embedded Linux',
    enabled: true,
    last_checked_at: null,
  },
  {
    id: 'feed-arstechnica',
    name: 'Ars Technica',
    url: 'https://feeds.arstechnica.com/arstechnica/index',
    category: 'Deep Tech & Science',
    enabled: true,
    last_checked_at: null,
  },
];
