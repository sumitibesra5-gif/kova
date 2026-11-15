import fs from 'node:fs/promises';
import path from 'node:path';
import { GoogleGenAI, ThinkingLevel, type Part } from '@google/genai';
import { desc } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { aiConfig } from '../db/schema.ts';
import { buildAiSystemInstruction } from '../utils/socialLogic.ts';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

export async function getActiveAiConfig() {
  const [latest] = await db
    .select()
    .from(aiConfig)
    .orderBy(desc(aiConfig.id))
    .limit(1);

  return (
    latest || {
      id: 1,
      systemPrompt:
        'You are Kova AI, an intelligent, perceptive visual & social companion built into the Kova platform. Help users understand photos, videos, captions, discussions, and discover ideas on the platform.',
      personality: 'Editorial, observant, and genuinely helpful',
      tone: 'Crisp, warm, and conversational without fluff',
      responsePreferences:
        'Describe concrete visual details, summarize discussions accurately, and respect user privacy.',
      updatedBy: 'mili',
      updatedAt: new Date(),
    }
  );
}

export async function readMediaAsInlineData(
  mediaUrl: string
): Promise<Part | null> {
  if (!mediaUrl) return null;

  let resolvedPath: string | null = null;
  const root = process.cwd();

  if (mediaUrl.startsWith('/src/assets/images/')) {
    const filename = path.basename(mediaUrl);
    resolvedPath = path.join(root, 'src', 'assets', 'images', filename);
  } else if (mediaUrl.startsWith('/assets/videos/')) {
    const filename = path.basename(mediaUrl);
    resolvedPath = path.join(root, 'public', 'assets', 'videos', filename);
  } else if (mediaUrl.startsWith('/uploads/')) {
    const filename = path.basename(mediaUrl);
    resolvedPath = path.join(root, 'uploads', filename);
  }

  if (!resolvedPath) return null;

  try {
    const bytes = await fs.readFile(resolvedPath);
    if (bytes.byteLength > 15 * 1024 * 1024) {
      return null;
    }
    const ext = path.extname(resolvedPath).toLowerCase();
    const mimeType = MIME_BY_EXT[ext] || 'image/jpeg';
    return {
      inlineData: {
        mimeType,
        data: bytes.toString('base64'),
      },
    };
  } catch {
    return null;
  }
}

export interface ChatHistoryItem {
  role: 'user' | 'model';
  text: string;
}

export async function generateAiAssistantReply(params: {
  prompt: string;
  history?: ChatHistoryItem[];
  mediaUrl?: string;
  inlineMedia?: { mimeType: string; data: string };
  postContext?: {
    id: number;
    authorUsername: string;
    authorDisplayName: string;
    caption: string;
    location: string;
    hashtags: string[];
    mediaType: string;
    comments: Array<{ username: string; content: string }>;
  };
  customConfigOverride?: {
    systemPrompt: string;
    personality: string;
    tone: string;
    responsePreferences: string;
  };
}) {
  const activeConfig = params.customConfigOverride || (await getActiveAiConfig());
  const systemInstruction = buildAiSystemInstruction(activeConfig);

  const parts: Part[] = [];

  if (params.inlineMedia?.data && params.inlineMedia?.mimeType) {
    parts.push({
      inlineData: {
        mimeType: params.inlineMedia.mimeType,
        data: params.inlineMedia.data,
      },
    });
  } else if (params.mediaUrl) {
    const mediaPart = await readMediaAsInlineData(params.mediaUrl);
    if (mediaPart) {
      parts.push(mediaPart);
    }
  }

  let contextText = '';
  if (params.postContext) {
    const c = params.postContext;
    const commentLines =
      c.comments.length > 0
        ? c.comments.map((cm) => `- @${cm.username}: ${cm.content}`).join('\n')
        : 'No comments yet.';
    contextText = [
      `Post Context (Post #${c.id} by @${c.authorUsername} / ${c.authorDisplayName}):`,
      `Media Type: ${c.mediaType}`,
      c.location ? `Location: ${c.location}` : '',
      `Caption: ${c.caption}`,
      c.hashtags.length ? `Hashtags: ${c.hashtags.map((h) => '#' + h).join(' ')}` : '',
      `Comments:\n${commentLines}`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  const userMessage = contextText
    ? `${contextText}\n\nUser Question: ${params.prompt}`
    : params.prompt;

  parts.push({ text: userMessage });

  const contents = [
    ...(params.history || []).map((item) => ({
      role: item.role,
      parts: [{ text: item.text }],
    })),
    {
      role: 'user' as const,
      parts,
    },
  ];

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite',
    contents,
    config: {
      systemInstruction,
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
    },
  });

  return {
    text: response.text || 'I could not generate a response for that request.',
  };
}

export interface SearchSource {
  title: string;
  url: string;
  snippet?: string;
  thumbnailUrl?: string;
  domain: string;
  faviconUrl: string;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '')
    .trim();
}

async function fetchLiveDuckDuckGoResults(
  query: string,
  mode: 'web' | 'images' | 'videos' | 'news'
): Promise<SearchSource[]> {
  const modeSuffix =
    mode === 'videos' ? ' video' : mode === 'news' ? ' news' : '';
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(
    query + modeSuffix
  )}`;
  const res = await fetch(searchUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    },
  });
  if (!res.ok) return [];
  const html = await res.text();
  const results: SearchSource[] = [];
  const seen = new Set<string>();

  const blockRegex =
    /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/g;

  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(html)) !== null && results.length < 8) {
    let rawHref = match[1] || '';
    const title = decodeHtmlEntities(match[2] || '');
    const snippet = decodeHtmlEntities(match[3] || '');

    if (rawHref.includes('uddg=')) {
      try {
        const parsed = new URL(
          rawHref.startsWith('//') ? `https:${rawHref}` : rawHref
        );
        rawHref = parsed.searchParams.get('uddg') || rawHref;
      } catch {
        // keep rawHref
      }
    }
    if (!/^https?:\/\//i.test(rawHref) || seen.has(rawHref)) continue;
    seen.add(rawHref);

    let domain = '';
    try {
      domain = new URL(rawHref).hostname.replace(/^www\./, '');
    } catch {
      domain = rawHref;
    }

    results.push({
      title: title || domain,
      url: rawHref,
      snippet,
      domain,
      faviconUrl: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
        domain
      )}&sz=64`,
    });
  }

  return results;
}

async function fetchWikimediaImages(query: string): Promise<SearchSource[]> {
  const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(
    query
  )}&gsrlimit=8&prop=imageinfo&iiprop=url|mime|extmetadata&iiurlwidth=640&format=json`;
  const res = await fetch(apiUrl, {
    headers: { 'User-Agent': 'KovaBrowser/1.0' },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    query?: {
      pages?: Record<
        string,
        {
          title?: string;
          imageinfo?: Array<{
            thumburl?: string;
            url?: string;
            descriptionurl?: string;
            mime?: string;
          }>;
        }
      >;
    };
  };
  const pages = Object.values(data.query?.pages || {});
  const out: SearchSource[] = [];
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info || !info.mime?.startsWith('image/')) continue;
    const url = info.descriptionurl || info.url;
    if (!url) continue;
    out.push({
      title: (page.title || 'Wikimedia Image').replace(/^File:/, ''),
      url,
      thumbnailUrl: info.thumburl || info.url,
      domain: 'commons.wikimedia.org',
      faviconUrl: 'https://www.google.com/s2/favicons?domain=wikimedia.org&sz=64',
    });
  }
  return out;
}

export async function runGroundedWebSearch(params: {
  query: string;
  mode: 'web' | 'images' | 'videos' | 'news';
  history?: ChatHistoryItem[];
}) {
  const modeGuidance: Record<string, string> = {
    web: 'Provide a clear, well-structured overview answering the query using verified web sources.',
    images:
      'Focus on visual references, photography collections, galleries, and image resources matching the query.',
    videos:
      'Focus on video content, documentaries, tutorials, YouTube/Vimeo/streaming sources, and visual media matching the query.',
    news: 'Focus on the latest reporting, verified recent news articles, dates, and key developments.',
  };

  // 1. Try Gemini Google Search Grounding first
  try {
    const contents = [
      ...(params.history || []).map((item) => ({
        role: item.role,
        parts: [{ text: item.text }],
      })),
      {
        role: 'user' as const,
        parts: [
          {
            text: `${modeGuidance[params.mode] || modeGuidance.web}\n\nQuery: ${
              params.query
            }`,
          },
        ],
      },
    ];

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents,
      config: {
        systemInstruction:
          'You are the Kova AI Search Engine. Synthesize accurate, factual answers grounded strictly in Google Search results. Use concise headings and bullet points where helpful.',
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      },
    });

    const metadata = response.candidates?.[0]?.groundingMetadata;
    const rawChunks = metadata?.groundingChunks || [];
    const seenUrls = new Set<string>();
    const sources: SearchSource[] = [];

    for (const chunk of rawChunks) {
      const uri = chunk.web?.uri;
      const title = chunk.web?.title || uri || 'Web Source';
      if (!uri || seenUrls.has(uri)) continue;
      seenUrls.add(uri);
      let domain = '';
      try {
        domain = new URL(uri).hostname.replace(/^www\./, '');
      } catch {
        domain = uri;
      }
      sources.push({
        title,
        url: uri,
        domain,
        faviconUrl: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
          domain
        )}&sz=64`,
      });
    }

    if (response.text && sources.length > 0) {
      return {
        summary: response.text,
        sources,
        searchQueries: metadata?.webSearchQueries || [params.query],
      };
    }
  } catch (err) {
    console.warn('Google Search grounding unavailable, switching to live web search:', err);
  }

  // 2. Live Web Search (DuckDuckGo + Wikimedia Commons) + Gemini AI Synthesis
  const [webSources, imageSources] = await Promise.all([
    fetchLiveDuckDuckGoResults(params.query, params.mode).catch(() => []),
    params.mode === 'images'
      ? fetchWikimediaImages(params.query).catch(() => [])
      : Promise.resolve([]),
  ]);

  const combinedSources =
    params.mode === 'images' && imageSources.length > 0
      ? [...imageSources, ...webSources].slice(0, 10)
      : webSources;

  const sourceContext =
    combinedSources.length > 0
      ? combinedSources
          .map(
            (s, i) =>
              `[${i + 1}] ${s.title} (${s.url})\n${s.snippet || 'Visual/web source'}`
          )
          .join('\n\n')
      : 'No external web snippets returned.';

  const synthesisContents = [
    ...(params.history || []).map((item) => ({
      role: item.role,
      parts: [{ text: item.text }],
    })),
    {
      role: 'user' as const,
      parts: [
        {
          text: `${modeGuidance[params.mode] || modeGuidance.web}\n\nSearch Query: ${
            params.query
          }\n\nLive Web Search Results:\n${sourceContext}\n\nSynthesize a clear, accurate, well-organized answer citing the relevant sources above.`,
        },
      ],
    },
  ];

  const aiSummary = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite',
    contents: synthesisContents,
    config: {
      systemInstruction:
        'You are the Kova AI Search Engine. Synthesize clear, accurate summaries grounded in the provided live web search results.',
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
    },
  });

  return {
    summary: aiSummary.text || 'No search summary returned.',
    sources: combinedSources,
    searchQueries: [params.query],
  };
}

export async function runBrowserReadUrl(url: string) {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: `Read and summarize the key points, main subject, and notable takeaways from this webpage: ${url}`,
      config: {
        tools: [{ urlContext: {} }],
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      },
    });
    if (response.text) {
      return { url, summary: response.text };
    }
  } catch {
    // Fallback to live HTTP fetch + Gemini summarization
  }

  const pageRes = await fetch(url, {
    headers: { 'User-Agent': 'KovaBrowser/1.0' },
  });
  const html = await pageRes.text();
  const cleanText = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12000);

  const summaryRes = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite',
    contents: `Summarize the key points and main subject from this webpage (${url}):\n\n${cleanText}`,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
    },
  });

  return {
    url,
    summary: summaryRes.text || 'Unable to summarize this URL.',
  };
}
