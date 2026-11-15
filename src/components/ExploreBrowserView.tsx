import React, { useState } from 'react';
import {
  ArrowRight,
  ExternalLink,
  FileText,
  Globe,
  Image as ImageIcon,
  Newspaper,
  Search,
  Sparkles,
  Video,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { PostItem, SearchSource, UserProfile } from '../types';
import { Avatar } from './Avatar';
import { FormattedProse } from './FormattedProse';

interface ExploreBrowserViewProps {
  allPosts: PostItem[];
  onOpenProfile: (username: string) => void;
  onOpenAiForPost: (post: PostItem) => void;
  onSelectHashtag: (tag: string) => void;
}

type SearchSection = 'web_browser' | 'kova_search';
type WebMode = 'web' | 'images' | 'videos' | 'news';

export const ExploreBrowserView: React.FC<ExploreBrowserViewProps> = ({
  allPosts,
  onOpenProfile,
  onOpenAiForPost,
  onSelectHashtag,
}) => {
  const [section, setSection] = useState<SearchSection>('web_browser');

  // Kova platform search state
  const [platformQuery, setPlatformQuery] = useState('');
  const [platformResults, setPlatformResults] = useState<{
    users: UserProfile[];
    posts: PostItem[];
    hashtags: Array<{ tag: string; count: number }>;
  } | null>(null);
  const [platformLoading, setPlatformLoading] = useState(false);

  // Built-in AI Browser / Search Engine state
  const [webQuery, setWebQuery] = useState('');
  const [webMode, setWebMode] = useState<WebMode>('web');
  const [webLoading, setWebLoading] = useState(false);
  const [webError, setWebError] = useState('');
  const [searchResult, setSearchResult] = useState<{
    query: string;
    summary: string;
    sources: SearchSource[];
    searchQueries: string[];
  } | null>(null);
  const [followUpInput, setFollowUpInput] = useState('');
  const [followUpHistory, setFollowUpHistory] = useState<
    Array<{ role: 'user' | 'model'; text: string }>
  >([]);
  const [pageSummary, setPageSummary] = useState<{
    url: string;
    summary: string;
  } | null>(null);
  const [readingUrl, setReadingUrl] = useState<string | null>(null);

  const handlePlatformSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!platformQuery.trim()) {
      setPlatformResults(null);
      return;
    }
    setPlatformLoading(true);
    try {
      const data = await apiRequest<{
        users: UserProfile[];
        posts: PostItem[];
        hashtags: Array<{ tag: string; count: number }>;
      }>(`/api/search?q=${encodeURIComponent(platformQuery.trim())}`);
      setPlatformResults(data);
    } catch {
      // ignore
    } finally {
      setPlatformLoading(false);
    }
  };

  const executeWebSearch = async (queryText: string, modeOverride?: WebMode) => {
    const clean = queryText.trim();
    if (!clean) return;
    const activeMode = modeOverride || webMode;
    setWebLoading(true);
    setWebError('');
    setPageSummary(null);
    try {
      const res = await apiRequest<{
        summary: string;
        sources: SearchSource[];
        searchQueries: string[];
      }>('/api/browser/search', {
        method: 'POST',
        body: JSON.stringify({ query: clean, mode: activeMode }),
      });
      setSearchResult({
        query: clean,
        summary: res.summary,
        sources: res.sources,
        searchQueries: res.searchQueries,
      });
      setFollowUpHistory([
        { role: 'user', text: clean },
        { role: 'model', text: res.summary },
      ]);
    } catch (err) {
      setWebError(err instanceof Error ? err.message : 'Web search failed.');
    } finally {
      setWebLoading(false);
    }
  };

  const handleWebFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeWebSearch(webQuery);
  };

  const handleFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!followUpInput.trim() || !searchResult) return;
    const q = followUpInput.trim();
    setFollowUpInput('');
    setWebLoading(true);
    setWebError('');
    try {
      const res = await apiRequest<{
        summary: string;
        sources: SearchSource[];
        searchQueries: string[];
      }>('/api/browser/search', {
        method: 'POST',
        body: JSON.stringify({
          query: q,
          mode: webMode,
          history: followUpHistory,
        }),
      });
      setFollowUpHistory((prev) => [
        ...prev,
        { role: 'user', text: q },
        { role: 'model', text: res.summary },
      ]);
      if (res.sources.length > 0) {
        setSearchResult((prev) =>
          prev
            ? {
                ...prev,
                sources: res.sources,
              }
            : prev
        );
      }
    } catch (err) {
      setWebError(err instanceof Error ? err.message : 'Follow-up search failed.');
    } finally {
      setWebLoading(false);
    }
  };

  const handleSummarizePage = async (url: string) => {
    setReadingUrl(url);
    setPageSummary(null);
    try {
      const res = await apiRequest<{ url: string; summary: string }>(
        '/api/browser/read-url',
        {
          method: 'POST',
          body: JSON.stringify({ url }),
        }
      );
      setPageSummary(res);
    } catch (err) {
      setWebError(err instanceof Error ? err.message : 'Unable to summarize URL.');
    } finally {
      setReadingUrl(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1E1E26] pb-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-white">
            Explore &amp; AI Web Browser
          </h1>
          <p className="text-sm text-[#8E8E99] mt-0.5">
            Search the live internet with AI grounding or discover creators and hashtags on Kova.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-[#121216] border border-[#24242C] self-start">
          <button
            type="button"
            onClick={() => setSection('web_browser')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              section === 'web_browser'
                ? 'bg-[#FF385C] text-white'
                : 'text-[#A1A1AA] hover:text-white'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>AI Web Browser</span>
          </button>
          <button
            type="button"
            onClick={() => setSection('kova_search')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              section === 'kova_search'
                ? 'bg-[#FF385C] text-white'
                : 'text-[#A1A1AA] hover:text-white'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>Kova Platform</span>
          </button>
        </div>
      </div>

      {section === 'web_browser' ? (
        <div className="space-y-6">
          {/* Search Engine Bar */}
          <div className="rounded-2xl bg-[#121216] border border-[#24242C] p-5 space-y-4">
            <form onSubmit={handleWebFormSubmit} className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Globe className="w-4 h-4 text-[#71717A] absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  aria-label="Search the internet with Kova AI Browser"
                  value={webQuery}
                  onChange={(e) => setWebQuery(e.target.value)}
                  placeholder="Search the web, news, architecture, photography gear, or any topic..."
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#0A0A0C] border border-[#272731] text-sm text-white placeholder:text-[#52525B] focus:outline-none focus:border-[#FF385C]"
                />
              </div>
              <button
                type="submit"
                disabled={webLoading}
                className="px-6 py-3 rounded-xl bg-[#FF385C] hover:bg-[#E11D48] disabled:opacity-60 text-white text-sm font-semibold transition-colors whitespace-nowrap"
              >
                {webLoading ? 'Searching...' : 'Search Web'}
              </button>
            </form>

            {/* Search Mode Filters */}
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  { id: 'web', label: 'All Web', icon: <Globe className="w-3.5 h-3.5" /> },
                  { id: 'images', label: 'Images', icon: <ImageIcon className="w-3.5 h-3.5" /> },
                  { id: 'videos', label: 'Videos', icon: <Video className="w-3.5 h-3.5" /> },
                  { id: 'news', label: 'News', icon: <Newspaper className="w-3.5 h-3.5" /> },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setWebMode(m.id);
                    if (webQuery.trim()) executeWebSearch(webQuery, m.id);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                    webMode === m.id
                      ? 'bg-[#1F1F28] text-white border border-[#323240]'
                      : 'text-[#8E8E99] hover:text-white border border-transparent'
                  }`}
                >
                  {m.icon}
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {webError && (
            <div className="p-4 rounded-xl bg-[#FF385C]/10 border border-[#FF385C]/30 text-sm text-[#FF8A9E]">
              {webError}
            </div>
          )}

          {!searchResult && !webLoading && (
            <div className="rounded-2xl bg-[#121216] border border-[#1E1E26] p-8 space-y-5">
              <div>
                <h2 className="text-lg font-display font-semibold text-white">
                  Live Grounded Internet Search
                </h2>
                <p className="text-sm text-[#8E8E99] mt-1">
                  Powered by real-time Google Search grounding. Ask anything, verify sources, inspect websites, and ask follow-up questions.
                </p>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  'Best 35mm film cameras for street photography in 2026',
                  'Latest brutalist architecture exhibitions in Europe',
                  'How does mirrorless full-frame autofocus compare to rangefinders?',
                  'Top contemporary ceramic artists and galleries in Copenhagen',
                ].map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => {
                      setWebQuery(sample);
                      executeWebSearch(sample);
                    }}
                    className="p-3.5 rounded-xl bg-[#0A0A0C] hover:bg-[#17171D] border border-[#24242C] text-left text-xs text-[#D4D4DC] hover:text-white flex items-center justify-between gap-3 transition-colors"
                  >
                    <span>{sample}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#FF385C] shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {webLoading && !searchResult && (
            <div className="space-y-4">
              <div className="h-36 rounded-2xl bg-[#121216] border border-[#1E1E26] animate-pulse" />
              <div className="grid md:grid-cols-2 gap-4">
                <div className="h-28 rounded-xl bg-[#121216] border border-[#1E1E26] animate-pulse" />
                <div className="h-28 rounded-xl bg-[#121216] border border-[#1E1E26] animate-pulse" />
              </div>
            </div>
          )}

          {searchResult && (
            <div className="grid lg:grid-cols-3 gap-6 items-start">
              {/* Left 2 cols: AI Search Overview + Follow-up Thread */}
              <div className="lg:col-span-2 space-y-4">
                <div className="rounded-2xl bg-[#121216] border border-[#24242C] p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-[#1E1E26] pb-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-white">
                      <Sparkles className="w-4 h-4 text-[#FF385C]" />
                      <span>AI Search Synthesis</span>
                    </div>
                    <span className="text-xs text-[#8E8E99] font-mono-tabular">
                      {searchResult.sources.length} sources grounded
                    </span>
                  </div>

                  <div className="space-y-4">
                    {followUpHistory
                      .filter((m) => m.role === 'model')
                      .map((entry, idx) => (
                        <div
                          key={idx}
                          className="text-sm text-[#E4E4E7] leading-relaxed"
                        >
                          {idx > 0 && (
                            <p className="text-xs font-semibold text-[#FF6B85] mb-1.5">
                              Follow-up Answer
                            </p>
                          )}
                          <FormattedProse text={entry.text} />
                        </div>
                      ))}
                  </div>

                  {pageSummary && (
                    <div className="mt-4 p-4 rounded-xl bg-[#0A0A0C] border border-[#272731] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-[#FF385C]" />
                          <span>Page Reader Summary</span>
                        </span>
                        <a
                          href={pageSummary.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-[#8E8E99] hover:text-white truncate max-w-xs"
                        >
                          {pageSummary.url}
                        </a>
                      </div>
                      <FormattedProse text={pageSummary.summary} className="text-xs text-[#D4D4DC]" />
                    </div>
                  )}

                  {/* Follow-up Input */}
                  <form
                    onSubmit={handleFollowUp}
                    className="pt-3 border-t border-[#1E1E26] flex items-center gap-2"
                  >
                    <input
                      type="text"
                      value={followUpInput}
                      onChange={(e) => setFollowUpInput(e.target.value)}
                      placeholder="Ask a follow-up question about these results..."
                      className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#0A0A0C] border border-[#24242C] text-xs text-white placeholder:text-[#52525B] focus:outline-none focus:border-[#FF385C]"
                    />
                    <button
                      type="submit"
                      disabled={webLoading || !followUpInput.trim()}
                      className="px-4 py-2.5 rounded-xl bg-[#1C1C24] hover:bg-[#252530] text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Ask
                    </button>
                  </form>
                </div>
              </div>

              {/* Right Col: Grounded Web Result Cards */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8E8E99]">
                  Web Sources ({searchResult.sources.length})
                </h3>
                {searchResult.sources.length === 0 ? (
                  <p className="text-xs text-[#8E8E99]">
                    No direct external URLs returned for this query. Try a broader web query.
                  </p>
                ) : (
                  searchResult.sources.map((src) => (
                    <div
                      key={src.url}
                      className="rounded-xl bg-[#121216] border border-[#24242C] p-3.5 space-y-2"
                    >
                      {src.thumbnailUrl && (
                        <img
                          src={src.thumbnailUrl}
                          alt={src.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-32 object-cover rounded-lg mb-2 bg-[#0A0A0C]"
                        />
                      )}
                      <div className="flex items-center gap-2">
                        <img
                          src={src.faviconUrl}
                          alt={src.domain}
                          referrerPolicy="no-referrer"
                          className="w-4 h-4 rounded-sm bg-[#1E1E26]"
                        />
                        <span className="text-xs text-[#8E8E99] truncate">{src.domain}</span>
                      </div>
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block text-sm font-semibold text-white hover:text-[#FF6B85] transition-colors line-clamp-2"
                      >
                        {src.title}
                      </a>
                      {src.snippet && (
                        <p className="text-xs text-[#A1A1AA] line-clamp-2 leading-relaxed">
                          {src.snippet}
                        </p>
                      )}
                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          onClick={() => handleSummarizePage(src.url)}
                          disabled={readingUrl === src.url}
                          className="text-xs font-medium text-[#FF6B85] hover:underline"
                        >
                          {readingUrl === src.url ? 'Reading page...' : 'AI Summarize Page'}
                        </button>
                        <a
                          href={src.url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Open ${src.title}`}
                          className="text-xs text-[#8E8E99] hover:text-white flex items-center gap-1"
                        >
                          <span>Visit</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Kova Internal Search & Explore Grid */
        <div className="space-y-6">
          <form onSubmit={handlePlatformSearch} className="flex gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#71717A] absolute left-3.5 top-3.5" />
              <input
                type="text"
                aria-label="Search Kova users, hashtags, and posts"
                value={platformQuery}
                onChange={(e) => setPlatformQuery(e.target.value)}
                placeholder="Search creators (@maya.arch), #hashtags, or locations..."
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#121216] border border-[#24242C] text-sm text-white placeholder:text-[#52525B] focus:outline-none focus:border-[#FF385C]"
              />
            </div>
            <button
              type="submit"
              disabled={platformLoading}
              className="px-5 py-3 rounded-xl bg-[#FF385C] hover:bg-[#E11D48] text-white text-sm font-semibold"
            >
              {platformLoading ? 'Searching...' : 'Search'}
            </button>
          </form>

          {platformResults ? (
            <div className="space-y-6">
              {platformResults.users.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-white">Matching Creators</h2>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {platformResults.users.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => onOpenProfile(u.username)}
                        className="p-3.5 rounded-xl bg-[#121216] border border-[#24242C] hover:border-[#343440] flex items-center gap-3 text-left"
                      >
                        <Avatar src={u.avatarUrl} alt={u.displayName} size="md" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">
                            {u.displayName}
                          </p>
                          <p className="text-xs text-[#8E8E99] truncate">@{u.username}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {platformResults.hashtags.length > 0 && (
                <div className="space-y-2">
                  <h2 className="text-sm font-semibold text-white">Hashtags</h2>
                  <div className="flex flex-wrap gap-3 text-sm text-[#D4D4DC]">
                    {platformResults.hashtags.map((h) => (
                      <button
                        key={h.tag}
                        type="button"
                        onClick={() => onSelectHashtag(h.tag)}
                        className="hover:text-[#FF385C]"
                      >
                        #{h.tag} ({h.count})
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-white">
                  Posts ({platformResults.posts.length})
                </h2>
                {platformResults.posts.length === 0 ? (
                  <p className="text-sm text-[#8E8E99]">No posts matched your query.</p>
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {platformResults.posts.map((p) => (
                      <div
                        key={p.id}
                        className="rounded-xl overflow-hidden bg-[#121216] border border-[#24242C] group relative aspect-square"
                      >
                        {p.mediaType === 'video' ? (
                          <video src={p.mediaUrl} muted loop playsInline className="w-full h-full object-cover" />
                        ) : (
                          <img src={p.mediaUrl} alt={p.caption} className="w-full h-full object-cover" />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-end">
                          <p className="text-xs font-semibold text-white">@{p.author.username}</p>
                          <p className="text-xs text-[#D4D4DC] line-clamp-2">{p.caption}</p>
                          <button
                            type="button"
                            onClick={() => onOpenAiForPost(p)}
                            className="mt-2 self-start px-2.5 py-1 rounded-lg bg-[#FF385C] text-white text-[11px] font-semibold"
                          >
                            Ask AI
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {allPosts.map((p) => (
                <div
                  key={p.id}
                  className="rounded-xl overflow-hidden bg-[#121216] border border-[#24242C] group relative aspect-[4/3]"
                >
                  {p.mediaType === 'video' ? (
                    <video
                      src={p.mediaUrl}
                      muted
                      loop
                      playsInline
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <img
                      src={p.mediaUrl}
                      alt={p.caption}
                      className="w-full h-full object-cover"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-4 flex flex-col justify-end">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenProfile(p.author.username)}
                        className="text-xs font-semibold text-white hover:underline"
                      >
                        @{p.author.username}
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenAiForPost(p)}
                        className="px-2.5 py-1 rounded-lg bg-[#FF385C] text-white text-[11px] font-semibold"
                      >
                        Analyze
                      </button>
                    </div>
                    <p className="text-xs text-[#D4D4DC] line-clamp-2 mt-1">{p.caption}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
