import React, { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, MessageSquarePlus, Send, Trash2 } from 'lucide-react';
import { apiRequest, uploadMediaFile } from '../lib/api';
import type { ConversationSummary, DirectMessage, UserProfile } from '../types';
import { formatRelativeTime } from '../utils/socialLogic';
import { Avatar } from './Avatar';

interface MessagesViewProps {
  currentUser: UserProfile | null;
  allUsers: UserProfile[];
  onlineIds: Set<number>;
  initialConvoId?: number | null;
  onRequireAuth: () => void;
  wsSocket: WebSocket | null;
}

export const MessagesView: React.FC<MessagesViewProps> = ({
  currentUser,
  allUsers,
  onlineIds,
  initialConvoId,
  onRequireAuth,
  wsSocket,
}) => {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConvoId, setActiveConvoId] = useState<number | null>(initialConvoId || null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [mediaAttachment, setMediaAttachment] = useState<{
    url: string;
    mediaType: 'image' | 'video';
  } | null>(null);
  const [typingUserId, setTypingUserId] = useState<number | null>(null);
  const [showNewPicker, setShowNewPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const typingTimeoutRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const loadConversations = async () => {
    if (!currentUser) return;
    try {
      const res = await apiRequest<{ conversations: ConversationSummary[] }>(
        '/api/conversations'
      );
      setConversations(res.conversations);
      if (!activeConvoId && res.conversations.length > 0) {
        setActiveConvoId(res.conversations[0].id);
      }
    } catch {
      // ignore
    }
  };

  const loadMessages = async (convoId: number) => {
    setLoading(true);
    try {
      const res = await apiRequest<{ messages: DirectMessage[] }>(
        `/api/conversations/${convoId}/messages`
      );
      setMessages(res.messages);
      setConversations((prev) =>
        prev.map((c) => (c.id === convoId ? { ...c, unreadCount: 0 } : c))
      );
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConversations();
  }, [currentUser?.id]);

  useEffect(() => {
    if (initialConvoId) {
      setActiveConvoId(initialConvoId);
    }
  }, [initialConvoId]);

  useEffect(() => {
    if (activeConvoId) {
      loadMessages(activeConvoId);
    }
  }, [activeConvoId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Listen to WebSocket real-time events
  useEffect(() => {
    if (!wsSocket) return;
    const handler = (ev: MessageEvent) => {
      try {
        const parsed = JSON.parse(ev.data) as {
          event: string;
          data: Record<string, unknown>;
        };
        if (parsed.event === 'message:new') {
          const msg = parsed.data as unknown as DirectMessage;
          if (msg.conversationId === activeConvoId) {
            setMessages((prev) =>
              prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
            );
          }
          loadConversations();
        } else if (parsed.event === 'message:deleted') {
          const { messageId } = parsed.data as { messageId: number };
          setMessages((prev) => prev.filter((m) => m.id !== messageId));
          loadConversations();
        } else if (parsed.event === 'typing') {
          const { conversationId, userId, isTyping } = parsed.data as {
            conversationId: number;
            userId: number;
            isTyping: boolean;
          };
          if (conversationId === activeConvoId) {
            setTypingUserId(isTyping ? userId : null);
          }
        }
      } catch {
        // ignore
      }
    };
    wsSocket.addEventListener('message', handler);
    return () => wsSocket.removeEventListener('message', handler);
  }, [wsSocket, activeConvoId]);

  if (!currentUser) {
    return (
      <div className="max-w-lg mx-auto py-24 px-4 text-center space-y-4">
        <h2 className="text-2xl font-display font-bold text-white">Direct Messages</h2>
        <p className="text-sm text-[#8E8E99]">
          Sign in to chat in real time, share photos and videos, and see live creator presence.
        </p>
        <button
          type="button"
          onClick={onRequireAuth}
          className="px-5 py-2.5 rounded-xl bg-[#FF385C] hover:bg-[#E11D48] text-white text-sm font-semibold"
        >
          Sign In to Message
        </button>
      </div>
    );
  }

  const activeConvo = conversations.find((c) => c.id === activeConvoId) || null;
  const recipientId = activeConvo?.otherUser?.id;

  const sendTypingSignal = (isTyping: boolean) => {
    if (!wsSocket || wsSocket.readyState !== WebSocket.OPEN || !recipientId || !activeConvoId) {
      return;
    }
    wsSocket.send(
      JSON.stringify({
        event: 'typing',
        data: { recipientId, conversationId: activeConvoId, isTyping },
      })
    );
  };

  const handleDraftChange = (val: string) => {
    setDraft(val);
    sendTypingSignal(true);
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = window.setTimeout(() => {
      sendTypingSignal(false);
    }, 1500);
  };

  const handleUploadMedia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const up = await uploadMediaFile(file);
      setMediaAttachment({ url: up.url, mediaType: up.mediaType });
    } catch {
      // ignore
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConvoId || (!draft.trim() && !mediaAttachment)) return;
    try {
      const res = await apiRequest<{ message: DirectMessage }>(
        `/api/conversations/${activeConvoId}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({
            content: draft.trim(),
            mediaUrl: mediaAttachment?.url || '',
            mediaType: mediaAttachment?.mediaType || 'text',
          }),
        }
      );
      setMessages((prev) =>
        prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]
      );
      setDraft('');
      setMediaAttachment(null);
      sendTypingSignal(false);
      loadConversations();
    } catch {
      // ignore
    }
  };

  const handleDeleteMessage = async (messageId: number) => {
    try {
      await apiRequest(`/api/messages/${messageId}`, { method: 'DELETE' });
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      loadConversations();
    } catch {
      // ignore
    }
  };

  const handleStartConversation = async (targetUserId: number) => {
    try {
      const res = await apiRequest<{ conversationId: number }>('/api/conversations', {
        method: 'POST',
        body: JSON.stringify({ targetUserId }),
      });
      setShowNewPicker(false);
      await loadConversations();
      setActiveConvoId(res.conversationId);
    } catch {
      // ignore
    }
  };

  const handleDeleteConversation = async (convoId: number) => {
    try {
      await apiRequest(`/api/conversations/${convoId}`, { method: 'DELETE' });
      setConversations((prev) => prev.filter((c) => c.id !== convoId));
      if (activeConvoId === convoId) {
        setActiveConvoId(null);
        setMessages([]);
      }
    } catch {
      // ignore
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="rounded-2xl bg-[#121216] border border-[#24242C] overflow-hidden grid md:grid-cols-[300px_1fr] h-[calc(100vh-8rem)]">
        {/* Conversation List */}
        <div className="border-r border-[#1E1E26] flex flex-col">
          <div className="p-4 border-b border-[#1E1E26] flex items-center justify-between">
            <h1 className="text-base font-display font-bold text-white">Messages</h1>
            <button
              type="button"
              onClick={() => setShowNewPicker((v) => !v)}
              aria-label="Start new conversation"
              className="p-2 rounded-lg text-[#D4D4DC] hover:text-white hover:bg-[#1B1B22]"
            >
              <MessageSquarePlus className="w-4 h-4" />
            </button>
          </div>

          {showNewPicker && (
            <div className="p-3 bg-[#0A0A0C] border-b border-[#1E1E26] space-y-2 max-h-56 overflow-y-auto">
              <p className="text-xs font-semibold text-[#8E8E99]">Start chat with creator</p>
              {allUsers
                .filter((u) => u.id !== currentUser.id)
                .map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleStartConversation(u.id)}
                    className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-[#191920] text-left"
                  >
                    <Avatar
                      src={u.avatarUrl}
                      alt={u.displayName}
                      size="sm"
                      online={onlineIds.has(u.id)}
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">
                        {u.displayName}
                      </p>
                      <p className="text-[11px] text-[#8E8E99] truncate">@{u.username}</p>
                    </div>
                  </button>
                ))}
            </div>
          )}

          <div className="flex-1 overflow-y-auto divide-y divide-[#1A1A22]">
            {conversations.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#8E8E99]">
                No conversations yet. Click the new chat icon above to message a creator.
              </div>
            ) : (
              conversations.map((c) => {
                const other = c.otherUser;
                const isOnline = other ? onlineIds.has(other.id) || c.isOnline : false;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setActiveConvoId(c.id)}
                    className={`w-full p-3.5 flex items-center gap-3 text-left transition-colors ${
                      activeConvoId === c.id ? 'bg-[#191920]' : 'hover:bg-[#16161C]'
                    }`}
                  >
                    <Avatar
                      src={other?.avatarUrl}
                      alt={other?.displayName || 'User'}
                      size="md"
                      online={isOnline}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-white truncate">
                          {other?.username || 'Creator'}
                        </span>
                        {c.unreadCount > 0 && (
                          <span className="font-mono-tabular text-[11px] font-bold text-[#FF385C]">
                            {c.unreadCount}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#8E8E99] truncate mt-0.5">
                        {c.lastMessage
                          ? c.lastMessage.content || `Sent ${c.lastMessage.mediaType}`
                          : 'Start the conversation'}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Active Chat Thread */}
        <div className="flex flex-col h-full">
          {activeConvo ? (
            <>
              <div className="px-5 py-3.5 border-b border-[#1E1E26] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar
                    src={activeConvo.otherUser?.avatarUrl}
                    alt={activeConvo.otherUser?.displayName || 'User'}
                    size="sm"
                    online={
                      activeConvo.otherUser
                        ? onlineIds.has(activeConvo.otherUser.id)
                        : false
                    }
                  />
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {activeConvo.otherUser?.displayName}
                    </p>
                    <p className="text-xs text-[#8E8E99]">
                      {activeConvo.otherUser && onlineIds.has(activeConvo.otherUser.id)
                        ? 'Online now'
                        : 'Offline'}
                      {typingUserId === activeConvo.otherUser?.id ? ' · typing...' : ''}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteConversation(activeConvo.id)}
                  aria-label="Delete conversation"
                  className="p-2 rounded-lg text-[#71717A] hover:text-[#FF385C] hover:bg-[#1B1B22]"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {loading && messages.length === 0 ? (
                  <p className="text-xs text-[#8E8E99]">Loading messages...</p>
                ) : (
                  messages.map((m) => {
                    const isMine = m.senderId === currentUser.id;
                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                      >
                        <div
                          className={`group relative max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                            isMine
                              ? 'bg-[#FF385C] text-white'
                              : 'bg-[#1B1B23] text-[#E4E4E7]'
                          }`}
                        >
                          {m.mediaUrl && (
                            <div className="mb-2 rounded-xl overflow-hidden max-w-xs">
                              {m.mediaType === 'video' ? (
                                <video src={m.mediaUrl} controls className="max-h-56 rounded-xl" />
                              ) : (
                                <img
                                  src={m.mediaUrl}
                                  alt="Message attachment"
                                  className="max-h-56 rounded-xl object-cover"
                                />
                              )}
                            </div>
                          )}
                          {m.content && <p className="leading-relaxed">{m.content}</p>}

                          {isMine && (
                            <button
                              type="button"
                              onClick={() => handleDeleteMessage(m.id)}
                              aria-label={`Delete message ${m.id}`}
                              className="opacity-0 group-hover:opacity-100 transition-opacity absolute -left-7 top-2 p-1 text-[#71717A] hover:text-[#FF385C]"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <span className="text-[10px] text-[#71717A] font-mono-tabular mt-1 px-1">
                          {formatRelativeTime(m.createdAt)}
                        </span>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <form
                onSubmit={handleSendMessage}
                className="p-4 border-t border-[#1E1E26] space-y-2"
              >
                {mediaAttachment && (
                  <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#0A0A0C] border border-[#24242C] text-xs text-[#D4D4DC]">
                    <span>Attached {mediaAttachment.mediaType}</span>
                    <button
                      type="button"
                      onClick={() => setMediaAttachment(null)}
                      className="text-[#FF6B85]"
                    >
                      Remove
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="dm-media-upload"
                    aria-label="Attach photo or video"
                    className="p-2.5 rounded-xl bg-[#191920] hover:bg-[#22222B] text-[#D4D4DC] cursor-pointer"
                  >
                    <ImageIcon className="w-4 h-4" />
                    <input
                      id="dm-media-upload"
                      type="file"
                      accept="image/*,video/*"
                      onChange={handleUploadMedia}
                      className="sr-only"
                    />
                  </label>
                  <input
                    type="text"
                    aria-label="Message input"
                    value={draft}
                    onChange={(e) => handleDraftChange(e.target.value)}
                    placeholder="Write a message..."
                    className="flex-1 px-4 py-2.5 rounded-xl bg-[#0A0A0C] border border-[#24242C] text-sm text-white placeholder:text-[#52525B] focus:outline-none focus:border-[#FF385C]"
                  />
                  <button
                    type="submit"
                    disabled={!draft.trim() && !mediaAttachment}
                    aria-label="Send message"
                    className="px-4 py-2.5 rounded-xl bg-[#FF385C] hover:bg-[#E11D48] disabled:opacity-40 text-white text-sm font-semibold flex items-center gap-1.5"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-8 text-center">
              <div className="space-y-2">
                <p className="text-base font-display font-semibold text-white">
                  Select a conversation
                </p>
                <p className="text-xs text-[#8E8E99]">
                  Real-time messaging with instant photo &amp; video sharing.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
