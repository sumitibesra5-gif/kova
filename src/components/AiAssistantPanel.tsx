import React, { useEffect, useState } from 'react';
import { Image as ImageIcon, Send, Sparkles, X } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { PostItem } from '../types';
import { FormattedProse } from './FormattedProse';

interface AiAssistantPanelProps {
  open: boolean;
  attachedPost: PostItem | null;
  onClearPost: () => void;
  onClose: () => void;
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export const AiAssistantPanel: React.FC<AiAssistantPanelProps> = ({
  open,
  attachedPost,
  onClearPost,
  onClose,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [inlineMedia, setInlineMedia] = useState<{
    mimeType: string;
    data: string;
    previewUrl: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (attachedPost) {
      setMessages([]);
      setError('');
    }
  }, [attachedPost?.id]);

  if (!open) return null;

  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.split(',')[1] || '';
      setInlineMedia({
        mimeType: file.type || 'image/jpeg',
        data: base64,
        previewUrl: result,
      });
    };
    reader.readAsDataURL(file);
  };

  const sendPrompt = async (promptText: string) => {
    const clean = promptText.trim();
    if (!clean) return;
    setError('');
    setLoading(true);
    const nextHistory = [...messages];
    setMessages((prev) => [...prev, { role: 'user', text: clean }]);
    setInput('');

    try {
      const res = await apiRequest<{ text: string }>('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          prompt: clean,
          history: nextHistory,
          postId: attachedPost?.id,
          inlineMedia: inlineMedia
            ? { mimeType: inlineMedia.mimeType, data: inlineMedia.data }
            : undefined,
        }),
      });
      setMessages((prev) => [...prev, { role: 'model', text: res.text }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI request failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendPrompt(input);
  };

  const quickPrompts = attachedPost
    ? [
        'Describe what is in this post, including lighting, objects, and visible text.',
        'Summarize the post caption and comment discussion.',
        'What camera mood or creative techniques stand out here?',
      ]
    : [
        'What kind of visual photography trends are featured on Kova?',
        'Suggest 3 creative composition prompts for twilight street photography.',
        'How should I structure hashtags to help creators find architectural work?',
      ];

  return (
    <aside
      aria-label="Kova AI Assistant"
      className="fixed inset-y-0 right-0 z-50 w-full sm:w-[420px] bg-[#121216] border-l border-[#24242C] flex flex-col shadow-2xl"
    >
      <div className="px-5 py-4 border-b border-[#1E1E26] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#FF385C]" />
          <h2 className="text-base font-display font-bold text-white">Kova AI</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close AI Assistant"
          className="p-1.5 rounded-lg text-[#8E8E99] hover:text-white hover:bg-[#1B1B22]"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Attached Post Context */}
      {attachedPost && (
        <div className="px-5 py-3 bg-[#0A0A0C] border-b border-[#1E1E26] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {attachedPost.mediaType === 'video' ? (
              <video
                src={attachedPost.mediaUrl}
                muted
                className="w-11 h-11 rounded-lg object-cover bg-[#18181E] shrink-0"
              />
            ) : (
              <img
                src={attachedPost.mediaUrl}
                alt="Attached post"
                className="w-11 h-11 rounded-lg object-cover shrink-0"
              />
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">
                Analyzing @{attachedPost.author.username}’s {attachedPost.mediaType}
              </p>
              <p className="text-[11px] text-[#8E8E99] truncate">{attachedPost.caption}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClearPost}
            aria-label="Detach post"
            className="text-xs text-[#8E8E99] hover:text-white shrink-0"
          >
            Clear
          </button>
        </div>
      )}

      {/* Conversation Feed */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.length === 0 && (
          <div className="space-y-4">
            <p className="text-sm text-[#A1A1AA] leading-relaxed">
              {attachedPost
                ? 'Ask me anything about this post — visual details, visible text, mood, location context, or a summary of the comments.'
                : 'Ask general questions, upload a photo or video to analyze, or click Ask AI on any post in your feed.'}
            </p>
            <div className="space-y-2">
              {quickPrompts.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => sendPrompt(q)}
                  className="w-full text-left p-3 rounded-xl bg-[#0A0A0C] hover:bg-[#191920] border border-[#24242C] text-xs text-[#E4E4E7] transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, idx) => (
          <div
            key={idx}
            data-testid={m.role === 'model' ? 'ai-model-message' : 'ai-user-message'}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-[#FF385C] text-white whitespace-pre-wrap'
                  : 'bg-[#191920] text-[#E4E4E7] border border-[#262630]'
              }`}
            >
              {m.role === 'model' ? <FormattedProse text={m.text} /> : m.text}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="px-4 py-2.5 rounded-2xl bg-[#191920] border border-[#262630] text-xs text-[#A1A1AA]">
              Analyzing...
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-[#FF385C]/10 border border-[#FF385C]/30 text-xs text-[#FF8A9E]">
            {error}
          </div>
        )}
      </div>

      {/* Input Area */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-[#1E1E26] space-y-2.5">
        {inlineMedia && (
          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#0A0A0C] border border-[#24242C] text-xs text-[#D4D4DC]">
            <span>Media attached for AI vision</span>
            <button
              type="button"
              onClick={() => setInlineMedia(null)}
              className="text-[#FF6B85]"
            >
              Remove
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <label
            htmlFor="ai-media-input"
            aria-label="Attach image or video for AI analysis"
            className="p-2.5 rounded-xl bg-[#191920] hover:bg-[#22222B] text-[#D4D4DC] cursor-pointer"
          >
            <ImageIcon className="w-4 h-4" />
            <input
              id="ai-media-input"
              type="file"
              accept="image/*,video/*"
              onChange={handleFileAttach}
              className="sr-only"
            />
          </label>
          <input
            type="text"
            aria-label="Ask Kova AI"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question or follow-up..."
            className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#0A0A0C] border border-[#24242C] text-sm text-white placeholder:text-[#52525B] focus:outline-none focus:border-[#FF385C]"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            aria-label="Send AI prompt"
            className="p-2.5 rounded-xl bg-[#FF385C] hover:bg-[#E11D48] disabled:opacity-40 text-white"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </aside>
  );
};
