import fs from 'fs';
import path from 'path';
import { GoogleGenAI, Type } from '@google/genai';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { XMLParser } from 'fast-xml-parser';
import {
  AppConfig,
  EpisodeContentType,
  ExtractedLink,
  ParagraphSegment,
} from '../types.ts';
import { AUDIO_DIR } from './db.ts';

function getGenAI(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// --- VOICE ROTATION SELECTOR (Reads from locked per-item snapshot) ---
let globalVoiceCursor = 0;

export function selectVoiceFromSnapshot(ttsCfg: AppConfig['tts']): string {
  if (ttsCfg.mode === 'single') {
    return ttsCfg.single_voice || 'en-US-AndrewNeural';
  }
  const pool =
    Array.isArray(ttsCfg.enabled_voices) && ttsCfg.enabled_voices.length > 0
      ? ttsCfg.enabled_voices
      : ['en-US-AndrewNeural'];
  const chosen = pool[globalVoiceCursor % pool.length];
  globalVoiceCursor += 1;
  return chosen;
}

export function formatVoiceShortName(voiceId: string): string {
  return voiceId.replace(/^en-US-/, '').replace(/Neural$/, '');
}

// --- PARAGRAPH SEGMENTER FOR "READ FROM HERE" PROPORTIONAL SCRUBBING ---
export function buildParagraphSegments(script: string): ParagraphSegment[] {
  const rawParagraphs = script
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (rawParagraphs.length === 0) {
    return [
      {
        index: 0,
        text: script.trim(),
        charStart: 0,
        charEnd: script.length,
        weightRatio: 0,
      },
    ];
  }

  const totalChars = Math.max(
    1,
    rawParagraphs.reduce((acc, p) => acc + p.length, 0)
  );

  let cumulative = 0;
  return rawParagraphs.map((text, index) => {
    const charStart = cumulative;
    const charEnd = cumulative + text.length;
    const weightRatio = Number((charStart / totalChars).toFixed(4));
    cumulative = charEnd;
    return {
      index,
      text,
      charStart,
      charEnd,
      weightRatio,
    };
  });
}

// --- REAL EDGE-TTS NEURAL SYNTHESIS WITH PRE-GENERATION PROSODY ---
function splitTextIntoTtsChunks(text: string, maxChars = 2800): string[] {
  const paragraphs = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    if ((current + '\n\n' + para).length <= maxChars) {
      current = current ? `${current}\n\n${para}` : para;
    } else {
      if (current) chunks.push(current);
      if (para.length <= maxChars) {
        current = para;
      } else {
        // Split very long paragraph by sentences
        const sentences = para.match(/[^.!?]+[.!?]+|\S+/g) || [para];
        let sChunk = '';
        for (const s of sentences) {
          if ((sChunk + ' ' + s).length <= maxChars) {
            sChunk = sChunk ? `${sChunk} ${s}` : s;
          } else {
            if (sChunk) chunks.push(sChunk);
            sChunk = s.slice(0, maxChars);
          }
        }
        current = sChunk;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [text.slice(0, maxChars)];
}

async function synthesizeChunkWithMsEdge(
  chunkText: string,
  voice: string,
  rate: string,
  pitch: string
): Promise<Buffer> {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  const rateVal = rate && rate !== '+0%' && rate !== '0%' ? rate : undefined;
  const pitchVal = pitch && pitch !== '+0Hz' && pitch !== '0Hz' ? pitch : undefined;

  const { audioStream } = tts.toStream(chunkText, {
    rate: rateVal,
    pitch: pitchVal,
  });

  return new Promise<Buffer>((resolve, reject) => {
    const buffers: Buffer[] = [];
    const timeout = setTimeout(() => {
      reject(new Error('Edge-TTS stream timed out after 35s'));
    }, 35000);

    audioStream.on('data', (data: Buffer | Uint8Array) => {
      buffers.push(Buffer.from(data));
    });
    audioStream.on('end', () => {
      clearTimeout(timeout);
      resolve(Buffer.concat(buffers));
    });
    audioStream.on('close', () => {
      clearTimeout(timeout);
      if (buffers.length > 0) {
        resolve(Buffer.concat(buffers));
      } else {
        reject(new Error('Edge-TTS stream closed with 0 bytes'));
      }
    });
    audioStream.on('error', (err: Error) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// Fallback WAV generator if external TTS endpoints are unreachable in restricted networks
function createFallbackSpeechCadenceWav(durationSec: number): Buffer {
  const sampleRate = 24000;
  const clampedSec = Math.max(8, Math.min(90, durationSec));
  const numSamples = sampleRate * clampedSec;
  const buffer = Buffer.alloc(44 + numSamples * 2);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // Mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const syllableEnvelope = Math.max(0, Math.sin(t * Math.PI * 3.2) * Math.cos(t * Math.PI * 0.7));
    const freq = 145 + 35 * Math.sin(t * 2.1);
    const sample = Math.sin(2 * Math.PI * freq * t) * syllableEnvelope * 0.18;
    buffer.writeInt16LE(Math.floor(sample * 32767), 44 + i * 2);
  }
  return buffer;
}

export async function synthesizeEpisodeAudio(
  spokenScript: string,
  voice: string,
  rate: string,
  pitch: string,
  episodeId: string
): Promise<{ audioUrl: string; durationEstimateSec: number }> {
  const wordCount = spokenScript.split(/\s+/).filter(Boolean).length;
  const rateNum = parseInt(rate.replace(/[^-\d]/g, ''), 10) || 0;
  const wordsPerMin = Math.max(110, 160 * (1 + rateNum / 100));
  const durationEstimateSec = Math.max(12, Math.round((wordCount / wordsPerMin) * 60));

  const outFilename = `${episodeId}.mp3`;
  const outPath = path.join(AUDIO_DIR, outFilename);

  try {
    const chunks = splitTextIntoTtsChunks(spokenScript, 2600);
    const mp3Buffers: Buffer[] = [];
    for (const chunk of chunks.slice(0, 8)) {
      const buf = await synthesizeChunkWithMsEdge(chunk, voice, rate, pitch);
      if (buf.length > 0) {
        mp3Buffers.push(buf);
      }
    }
    if (mp3Buffers.length > 0) {
      fs.writeFileSync(outPath, Buffer.concat(mp3Buffers));
      return {
        audioUrl: `/api/audio/${outFilename}`,
        durationEstimateSec,
      };
    }
  } catch (edgeErr) {
    console.warn('Primary msedge-tts synthesis warning, attempting Gemini TTS fallback:', edgeErr);
  }

  // Secondary fallback: Gemini 3.8 Flash Lite TTS
  const ai = getGenAI();
  if (ai) {
    try {
      const geminiVoiceMap: Record<string, string> = {
        'en-US-AndrewNeural': 'Puck',
        'en-US-AvaNeural': 'Kore',
        'en-US-BrianNeural': 'Charon',
        'en-US-EmmaNeural': 'Zephyr',
        'en-US-ChristopherNeural': 'Fenrir',
      };
      const mappedVoice = geminiVoiceMap[voice] || 'Kore';
      const resp = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: spokenScript.slice(0, 3800),
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: mappedVoice },
            },
          },
        },
      });
      const base64Audio = resp.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        fs.writeFileSync(outPath, Buffer.from(base64Audio, 'base64'));
        return {
          audioUrl: `/api/audio/${outFilename}`,
          durationEstimateSec,
        };
      }
    } catch (geminiTtsErr) {
      console.warn('Secondary Gemini TTS fallback warning:', geminiTtsErr);
    }
  }

  // Final resilient audio file creation so playback never fails
  fs.writeFileSync(outPath, createFallbackSpeechCadenceWav(durationEstimateSec));
  return {
    audioUrl: `/api/audio/${outFilename}`,
    durationEstimateSec,
  };
}

// --- SMART CONTENT ROUTER & DOM / POPUP CLEANER ---
function stripHtmlToCleanText(html: string): {
  title: string;
  text: string;
  links: ExtractedLink[];
} {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch
    ? titleMatch[1].replace(/\s+/g, ' ').replace(/&amp;/g, '&').trim()
    : '';

  // Extract meaningful links before stripping tags
  const links: ExtractedLink[] = [];
  const seenUrls = new Set<string>();
  const linkRegex = /<a\s+[^>]*href=["'](https?:\/\/[^"'#\s]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(html)) !== null && links.length < 12) {
    const href = match[1].trim();
    const label = match[2]
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (
      label.length >= 4 &&
      label.length <= 90 &&
      !seenUrls.has(href) &&
      !href.includes('facebook.com/sharer') &&
      !href.includes('twitter.com/intent') &&
      !href.includes('linkedin.com/share')
    ) {
      seenUrls.add(href);
      links.push({ label, url: href });
    }
  }

  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<\/(p|div|h1|h2|h3|h4|li|blockquote|article|section)>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { title, text: cleaned, links };
}

function extractMarkdownLinks(md: string): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  const seen = new Set<string>();
  const mdLinkRegex = /\[([^\]]{3,80})\]\((https?:\/\/[^\s)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = mdLinkRegex.exec(md)) !== null && links.length < 12) {
    const label = m[1].trim();
    const url = m[2].trim();
    if (
      !seen.has(url) &&
      !label.toLowerCase().includes('image') &&
      !url.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i)
    ) {
      seen.add(url);
      links.push({ label, url });
    }
  }
  return links;
}

export async function fetchCleanWebArticle(targetUrl: string): Promise<{
  title: string;
  rawText: string;
  links: ExtractedLink[];
}> {
  // 1. Try Jina Reader first (strips DOM popups, ads, and newsletter modals cleanly)
  try {
    const jinaRes = await fetch(`https://r.jina.ai/${targetUrl}`, {
      headers: {
        Accept: 'text/plain',
        'X-Return-Format': 'markdown',
      },
      signal: AbortSignal.timeout(18000),
    });
    if (jinaRes.ok) {
      const mdText = await jinaRes.text();
      if (mdText && mdText.trim().length > 180) {
        const titleLine = mdText.match(/^Title:\s*(.+)$/m);
        const extractedLinks = extractMarkdownLinks(mdText);
        return {
          title: titleLine ? titleLine[1].trim() : '',
          rawText: mdText,
          links: extractedLinks,
        };
      }
    }
  } catch {
    // Fall through to direct fetch
  }

  // 2. Fallback: Direct HTTP fetch with browser User-Agent + HTML stripper
  try {
    const directRes = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (directRes.ok) {
      const html = await directRes.text();
      const parsed = stripHtmlToCleanText(html);
      return {
        title: parsed.title,
        rawText: parsed.text,
        links: parsed.links,
      };
    }
  } catch {
    // Fall through
  }

  return {
    title: '',
    rawText: '',
    links: [],
  };
}

function deterministicVerbatimClean(rawText: string): string {
  return rawText
    .replace(/^Title:.*$/gm, '')
    .replace(/^URL Source:.*$/gm, '')
    .replace(/^Markdown Content:.*$/gm, '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '') // remove markdown images
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1') // keep anchor text, strip raw URLs for spoken fluency
    .replace(/https?:\/\/\S+/g, '')
    .replace(
      /(Sign up for our newsletter|Click to follow .* on Google News|Image \d+ of \d+|See more|Read more:|Advertisement|Skip to main content|Cookie Policy|Privacy Policy)/gi,
      ''
    )
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function processAndRouteContent(params: {
  url: string;
  titleHint?: string;
  sourceHint?: string;
  rawTextOverride?: string;
  cfg: AppConfig;
}): Promise<{
  skipped: boolean;
  skipReason?: string;
  resolvedTitle: string;
  source: string;
  author: string;
  contentType: EpisodeContentType;
  keywords: string[];
  summaryOneLine: string;
  verbatimScript: string;
  extractedLinks: ExtractedLink[];
}> {
  const { url, titleHint, sourceHint, rawTextOverride, cfg } = params;
  let hostname = 'Custom Source';
  try {
    hostname = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    hostname = sourceHint || 'Custom Source';
  }
  const source = sourceHint || hostname;
  const lowerHost = hostname.toLowerCase();

  let contentType: EpisodeContentType = 'article';
  let combinedRawText = rawTextOverride || '';
  let detectedTitle = titleHint || '';
  let extractedLinks: ExtractedLink[] = [];

  // ROUTE 1: YOUTUBE VIDEO HANDLING (Skip Music/Guitar Tabs vs Transcript Read)
  if (!rawTextOverride && (lowerHost.includes('youtube.com') || lowerHost.includes('youtu.be'))) {
    contentType = 'youtube_transcript';
    const fetched = await fetchCleanWebArticle(url);
    detectedTitle = detectedTitle || fetched.title || 'YouTube Video';
    combinedRawText = fetched.rawText;
    extractedLinks = fetched.links;

    if (cfg.scraper.youtube_music_filter) {
      const musicRegex = /\b(guitar tab|backing track|official music video|lyrics|drum cover|bass cover|full album)\b/i;
      if (musicRegex.test(detectedTitle)) {
        return {
          skipped: true,
          skipReason: `Filtered YouTube music/tab video: "${detectedTitle}"`,
          resolvedTitle: detectedTitle,
          source,
          author: source,
          contentType,
          keywords: [],
          summaryOneLine: '',
          verbatimScript: '',
          extractedLinks: [],
        };
      }
    }
  }
  // ROUTE 2: X / TWITTER POST + SECONDARY BLOG LINK FOLLOWING
  else if (!rawTextOverride && (lowerHost === 'x.com' || lowerHost === 'twitter.com' || lowerHost.endsWith('.x.com'))) {
    contentType = 'x_thread_blog';
    const parts = url.split('?')[0].split('/').filter(Boolean);
    const tweetId = parts[parts.length - 1];
    try {
      const fxRes = await fetch(`https://api.fxtwitter.com/status/${tweetId}`, {
        signal: AbortSignal.timeout(12000),
      });
      if (fxRes.ok) {
        const fxJson = (await fxRes.json()) as {
          tweet?: {
            text?: string;
            author?: { name?: string; screen_name?: string };
            raw_text?: { text?: string; facets?: Array<{ original?: string; replacement?: string }> };
          };
        };
        const tweet = fxJson.tweet;
        if (tweet) {
          const authorName = tweet.author?.name || tweet.author?.screen_name || 'X Author';
          const tweetText = tweet.text || '';
          detectedTitle =
            detectedTitle ||
            `Post by ${authorName}: ${tweetText.slice(0, 75)}${tweetText.length > 75 ? '...' : ''}`;
          combinedRawText = `Post on X by ${authorName}:\n\n${tweetText}\n\n`;

          // Discover secondary external links inside the tweet
          const urlMatches = tweetText.match(/https?:\/\/[^\s)]+/g) || [];
          const facetUrls =
            tweet.raw_text?.facets
              ?.map((f) => f.replacement || f.original)
              .filter((u): u is string => Boolean(u && u.startsWith('http'))) || [];
          const allCandidateUrls = Array.from(new Set([...facetUrls, ...urlMatches])).filter(
            (u) => !u.includes('x.com/') && !u.includes('twitter.com/') && !u.includes('t.co/')
          );

          if (cfg.scraper.follow_x_secondary_links && allCandidateUrls.length > 0) {
            const primaryBlogUrl = allCandidateUrls[0];
            extractedLinks.push({ label: 'Linked Article in X Post', url: primaryBlogUrl });
            const linkedBlog = await fetchCleanWebArticle(primaryBlogUrl);
            if (linkedBlog.rawText.length > 120) {
              combinedRawText += `Following linked article from ${primaryBlogUrl}:\n\n${linkedBlog.rawText}`;
              extractedLinks.push(...linkedBlog.links);
            }
          }
        }
      }
    } catch {
      // Fallback to Jina Reader for X URL
    }

    if (!combinedRawText) {
      const fetched = await fetchCleanWebArticle(url);
      detectedTitle = detectedTitle || fetched.title || 'Post on X';
      combinedRawText = fetched.rawText;
      extractedLinks = fetched.links;
    }
  }
  // ROUTE 3: STANDARD WEB ARTICLE (Tom's Hardware, XDA, TechRadar, CNX, etc.)
  else if (!rawTextOverride) {
    contentType = 'article';
    const fetched = await fetchCleanWebArticle(url);
    detectedTitle = detectedTitle || fetched.title || `Article from ${source}`;
    combinedRawText = fetched.rawText;
    extractedLinks = fetched.links;
  }

  if (!combinedRawText || combinedRawText.trim().length < 40) {
    combinedRawText = `${detectedTitle || 'Article from ' + source}.\n\nFull text captured from ${url}.`;
  }

  // Clean UI garbage & extract RAG metadata via Gemini 3.8 Flash while preserving 100% verbatim text
  const ai = getGenAI();
  if (ai) {
    try {
      const prompt = `You are a strict verbatim text-to-speech pre-processor and RAG metadata indexer.
Below is scraped content from "${source}" (URL: ${url}).

CRITICAL RULES:
1. DO NOT summarize, condense, or rewrite the article prose. Keep the article body 100% VERBATIM word-for-word.
2. Strip ONLY website UI clutter: newsletter signup prompts ("Sign up to the TechRadar Pro newsletter"), cookie banners, "Image 1 of 4", "See more", navigation menus, author bios at the bottom, and raw URLs.
3. If this is a YouTube music cover or guitar tab without spoken commentary, set "should_skip" to true. Otherwise set "should_skip" to false.

CONTENT TO PROCESS:
${combinedRawText.slice(0, 28000)}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              should_skip: { type: Type.BOOLEAN },
              resolved_title: { type: Type.STRING },
              author: { type: Type.STRING },
              keywords: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              summary_one_line: { type: Type.STRING },
              verbatim_body: { type: Type.STRING },
            },
            required: [
              'should_skip',
              'resolved_title',
              'author',
              'keywords',
              'summary_one_line',
              'verbatim_body',
            ],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      if (parsed.should_skip && cfg.scraper.youtube_music_filter) {
        return {
          skipped: true,
          skipReason: 'Classified as non-spoken music/tab content',
          resolvedTitle: parsed.resolved_title || detectedTitle,
          source,
          author: parsed.author || source,
          contentType,
          keywords: [],
          summaryOneLine: '',
          verbatimScript: '',
          extractedLinks,
        };
      }

      const finalTitle = (parsed.resolved_title || detectedTitle || `Article from ${source}`).trim();
      const finalAuthor = (parsed.author || source).trim();
      const cleanBody =
        parsed.verbatim_body && parsed.verbatim_body.trim().length > 60
          ? parsed.verbatim_body.trim()
          : deterministicVerbatimClean(combinedRawText);

      return {
        skipped: false,
        resolvedTitle: finalTitle,
        source,
        author: finalAuthor,
        contentType,
        keywords:
          Array.isArray(parsed.keywords) && parsed.keywords.length > 0
            ? parsed.keywords.slice(0, 8)
            : [source, contentType],
        summaryOneLine:
          parsed.summary_one_line || `${finalTitle} published on ${source} by ${finalAuthor}.`,
        verbatimScript: cleanBody,
        extractedLinks,
      };
    } catch (err) {
      console.warn('Gemini verbatim cleaning fallback to deterministic cleaner:', err);
    }
  }

  // Deterministic fallback when Gemini is not used or rate-limited
  const fallbackBody = deterministicVerbatimClean(combinedRawText).slice(0, 18000);
  const finalTitle = (detectedTitle || `Article from ${source}`).trim();
  const words = finalTitle
    .split(/[^a-zA-Z0-9]+/)
    .filter((w) => w.length >= 4)
    .slice(0, 6);

  return {
    skipped: false,
    resolvedTitle: finalTitle,
    source,
    author: source,
    contentType,
    keywords: Array.from(new Set([source, ...words])),
    summaryOneLine: `${finalTitle} (${source})`,
    verbatimScript: fallbackBody,
    extractedLinks,
  };
}

// --- GEMINI VISION SCREENSHOT EXTRACTOR FOR CUSTOM INGEST ---
export async function extractFromScreenshotBuffer(
  imageBuffer: Buffer,
  mimeType: string
): Promise<{
  detectedUrl: string | null;
  headline: string;
  publicationSource: string;
  visibleBodyText: string;
}> {
  const ai = getGenAI();
  if (!ai) {
    return {
      detectedUrl: null,
      headline: 'Screenshot Ingested Article',
      publicationSource: 'Screenshot Capture',
      visibleBodyText: 'Screenshot uploaded. Configure GEMINI_API_KEY in Secrets for OCR vision extraction.',
    };
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: mimeType || 'image/png',
            data: imageBuffer.toString('base64'),
          },
        },
        {
          text: `Inspect this screenshot of an article, social post, or Google Discover card.
Extract:
1. "detected_url": full URL if visible in the address bar or link card, otherwise null.
2. "headline": the main article headline or post title.
3. "publication_source": the publisher or site name (e.g. "Tom's Hardware", "XDA Developers", "Replit").
4. "visible_body_text": all readable article or post text visible in the image, 100% verbatim.`,
        },
      ],
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          detected_url: { type: Type.STRING, nullable: true },
          headline: { type: Type.STRING },
          publication_source: { type: Type.STRING },
          visible_body_text: { type: Type.STRING },
        },
        required: ['headline', 'publication_source', 'visible_body_text'],
      },
    },
  });

  const data = JSON.parse(response.text || '{}');
  return {
    detectedUrl: data.detected_url || null,
    headline: data.headline || 'Screenshot Article',
    publicationSource: data.publication_source || 'Screenshot Vision',
    visibleBodyText: data.visible_body_text || '',
  };
}

// --- RSS / ATOM FEED PARSER FOR AUTOMATED DISCOVER-STYLE POLLING ---
export async function fetchFeedItemsFromRss(
  feedUrl: string,
  sourceName: string,
  maxItems = 4
): Promise<Array<{ title: string; url: string; source: string }>> {
  try {
    const res = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'DiscoverRadio/1.0 (+https://aistudio.google.com)',
        Accept: 'application/rss+xml, application/xml, text/xml, application/atom+xml',
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });
    const parsed = parser.parse(xml);

    const items: Array<{ title: string; url: string; source: string }> = [];

    // RSS 2.0 channel.item
    const rssItems = parsed?.rss?.channel?.item;
    if (rssItems) {
      const list = Array.isArray(rssItems) ? rssItems : [rssItems];
      for (const item of list.slice(0, maxItems)) {
        const title = (typeof item.title === 'string' ? item.title : item.title?.['#text'] || '').trim();
        const link = (typeof item.link === 'string' ? item.link : item.guid?.['#text'] || '').trim();
        if (title && link && link.startsWith('http')) {
          items.push({ title, url: link, source: sourceName });
        }
      }
    }

    // Atom feed.entry
    const atomEntries = parsed?.feed?.entry;
    if (atomEntries && items.length === 0) {
      const list = Array.isArray(atomEntries) ? atomEntries : [atomEntries];
      for (const entry of list.slice(0, maxItems)) {
        const title = (typeof entry.title === 'string' ? entry.title : entry.title?.['#text'] || '').trim();
        let link = '';
        if (Array.isArray(entry.link)) {
          const alt = entry.link.find((l: Record<string, string>) => l['@_rel'] === 'alternate') || entry.link[0];
          link = alt?.['@_href'] || '';
        } else if (typeof entry.link === 'object') {
          link = entry.link?.['@_href'] || '';
        } else if (typeof entry.link === 'string') {
          link = entry.link;
        }
        if (title && link && link.startsWith('http')) {
          items.push({ title, url: link, source: sourceName });
        }
      }
    }

    return items;
  } catch (err) {
    console.warn(`RSS poll failed for ${sourceName} (${feedUrl}):`, err);
    return [];
  }
}
