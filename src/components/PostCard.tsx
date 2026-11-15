import React, { useState } from 'react';
import {
  Bookmark,
  Check,
  Flag,
  Heart,
  MessageCircle,
  Send,
  Share2,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { CommentItem, PostItem, UserProfile } from '../types';
import { formatRelativeTime } from '../utils/socialLogic';
import { Avatar } from './Avatar';

interface PostCardProps {
  post: PostItem;
  currentUser: UserProfile | null;
  onRequireAuth: () => void;
  onOpenProfile: (username: string) => void;
  onOpenAiForPost: (post: PostItem) => void;
  onFilterHashtag: (tag: string) => void;
  onPostUpdated: (updated: PostItem) => void;
  onPostDeleted: (postId: number) => void;
}

export const PostCard: React.FC<PostCardProps> = ({
  post,
  currentUser,
  onRequireAuth,
  onOpenProfile,
  onOpenAiForPost,
  onFilterHashtag,
  onPostUpdated,
  onPostDeleted,
}) => {
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState<CommentItem | null>(null);
  const [showComments, setShowComments] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSent, setReportSent] = useState(false);
  const [imageError, setImageError] = useState(false);

  const handleToggleLike = async () => {
    if (!currentUser) return onRequireAuth();
    try {
      const res = await apiRequest<{ liked: boolean; likesCount: number }>(
        `/api/posts/${post.id}/like`,
        { method: 'POST' }
      );
      onPostUpdated({
        ...post,
        likedByMe: res.liked,
        likesCount: res.likesCount,
      });
    } catch {
      // handled silently
    }
  };

  const handleToggleBookmark = async () => {
    if (!currentUser) return onRequireAuth();
    try {
      const res = await apiRequest<{ bookmarked: boolean }>(
        `/api/posts/${post.id}/bookmark`,
        { method: 'POST' }
      );
      onPostUpdated({ ...post, bookmarkedByMe: res.bookmarked });
    } catch {
      // handled silently
    }
  };

  const handleToggleFollow = async () => {
    if (!currentUser) return onRequireAuth();
    try {
      const res = await apiRequest<{ following: boolean }>(
        `/api/users/${post.author.id}/follow`,
        { method: 'POST' }
      );
      onPostUpdated({ ...post, authorFollowedByMe: res.following });
    } catch {
      // handled silently
    }
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return onRequireAuth();
    if (!commentText.trim()) return;
    try {
      const res = await apiRequest<{ comment: CommentItem }>(
        `/api/posts/${post.id}/comments`,
        {
          method: 'POST',
          body: JSON.stringify({
            content: commentText.trim(),
            parentId: replyTo?.id || null,
          }),
        }
      );
      onPostUpdated({
        ...post,
        commentsCount: post.commentsCount + 1,
        comments: [...post.comments, res.comment],
      });
      setCommentText('');
      setReplyTo(null);
      setShowComments(true);
    } catch {
      // ignore
    }
  };

  const handleDeletePost = async () => {
    try {
      await apiRequest(`/api/posts/${post.id}`, { method: 'DELETE' });
      onPostDeleted(post.id);
    } catch {
      // ignore
    }
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/?post=${post.id}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // ignore clipboard fallback
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return onRequireAuth();
    if (!reportReason.trim()) return;
    try {
      await apiRequest('/api/reports', {
        method: 'POST',
        body: JSON.stringify({
          targetType: 'post',
          targetId: post.id,
          reason: reportReason.trim(),
        }),
      });
      setReportSent(true);
      setTimeout(() => {
        setReporting(false);
        setReportSent(false);
        setReportReason('');
      }, 1400);
    } catch {
      // ignore
    }
  };

  const topComments = post.comments.filter((c) => !c.parentId);
  const repliesByParent = new Map<number, CommentItem[]>();
  for (const c of post.comments) {
    if (c.parentId) {
      const arr = repliesByParent.get(c.parentId) || [];
      arr.push(c);
      repliesByParent.set(c.parentId, arr);
    }
  }

  return (
    <article
      data-testid={`post-card-${post.id}`}
      className="rounded-2xl bg-[#121216] border border-[#1E1E26] overflow-hidden"
    >
      {/* Post Header */}
      <div className="px-4 py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => onOpenProfile(post.author.username)}
            className="shrink-0"
            aria-label={`View profile for ${post.author.username}`}
          >
            <Avatar src={post.author.avatarUrl} alt={post.author.displayName} size="md" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onOpenProfile(post.author.username)}
                className="text-sm font-semibold text-white hover:underline truncate"
              >
                {post.author.username}
              </button>
              <span aria-hidden="true" className="text-[#52525B]">·</span>
              <span className="text-xs text-[#8E8E99] font-mono-tabular shrink-0">
                {formatRelativeTime(post.createdAt)}
              </span>
            </div>
            {post.location && (
              <p className="text-xs text-[#8E8E99] truncate">{post.location}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {currentUser?.id !== post.author.id && (
            <button
              type="button"
              onClick={handleToggleFollow}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                post.authorFollowedByMe
                  ? 'bg-[#1D1D24] text-[#D4D4DC] hover:bg-[#272731]'
                  : 'bg-[#FF385C]/15 text-[#FF6B85] hover:bg-[#FF385C]/25'
              }`}
            >
              {post.authorFollowedByMe ? 'Following' : 'Follow'}
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpenAiForPost(post)}
            aria-label={`Ask AI about ${post.author.username}'s post`}
            className="px-2.5 py-1 rounded-lg bg-[#1A1A22] hover:bg-[#23232E] border border-[#2B2B36] text-xs font-medium text-[#E4E4E7] flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#FF385C]" />
            <span>Ask AI</span>
          </button>
          {currentUser?.id === post.author.id ? (
            <button
              type="button"
              onClick={handleDeletePost}
              aria-label={`Delete post ${post.id}`}
              className="p-1.5 rounded-lg text-[#71717A] hover:text-[#FF385C] hover:bg-[#1B1B22]"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setReporting((r) => !r)}
              aria-label={`Report post ${post.id}`}
              className="p-1.5 rounded-lg text-[#71717A] hover:text-white hover:bg-[#1B1B22]"
            >
              <Flag className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Report Drawer */}
      {reporting && (
        <form
          onSubmit={handleSubmitReport}
          className="px-4 py-3 bg-[#18181E] border-y border-[#24242C] flex items-center gap-2"
        >
          {reportSent ? (
            <span className="text-xs text-emerald-400">Report submitted to moderation.</span>
          ) : (
            <>
              <input
                type="text"
                required
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder="Reason for reporting this post..."
                className="flex-1 px-3 py-1.5 rounded-lg bg-[#0A0A0C] border border-[#272731] text-xs text-white focus:outline-none focus:border-[#FF385C]"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-[#FF385C] text-white text-xs font-semibold"
              >
                Submit
              </button>
            </>
          )}
        </form>
      )}

      {/* Media Frame */}
      <div className="bg-[#09090B] border-y border-[#1B1B22] relative overflow-hidden">
        {post.mediaType === 'video' ? (
          <video
            src={post.mediaUrl}
            controls
            playsInline
            loop
            className="w-full max-h-[540px] object-contain mx-auto"
          />
        ) : !imageError ? (
          <img
            src={post.mediaUrl}
            alt={post.caption || `Photo by ${post.author.username}`}
            referrerPolicy="no-referrer"
            onDoubleClick={handleToggleLike}
            onError={() => setImageError(true)}
            className="w-full max-h-[560px] object-cover"
          />
        ) : (
          <div className="h-64 flex items-center justify-center bg-[#16161C] text-xs text-[#8E8E99]">
            Media unavailable
          </div>
        )}
      </div>

      {/* Action Bar */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleToggleLike}
            aria-label={post.likedByMe ? `Unlike post ${post.id}` : `Like post ${post.id}`}
            className={`flex items-center gap-1.5 text-sm transition-colors ${
              post.likedByMe ? 'text-[#FF385C]' : 'text-[#D4D4DC] hover:text-white'
            }`}
          >
            <Heart className={`w-5 h-5 ${post.likedByMe ? 'fill-[#FF385C]' : ''}`} />
            <span className="font-mono-tabular text-xs font-medium">{post.likesCount}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowComments((v) => !v)}
            aria-label={`Toggle comments for post ${post.id}`}
            className="flex items-center gap-1.5 text-sm text-[#D4D4DC] hover:text-white transition-colors"
          >
            <MessageCircle className="w-5 h-5" />
            <span className="font-mono-tabular text-xs font-medium">{post.commentsCount}</span>
          </button>

          <button
            type="button"
            onClick={handleShare}
            aria-label={`Share post ${post.id}`}
            className="flex items-center gap-1.5 text-sm text-[#D4D4DC] hover:text-white transition-colors"
          >
            {copied ? (
              <Check className="w-4 h-4 text-emerald-400" />
            ) : (
              <Share2 className="w-4 h-4" />
            )}
            {copied && <span className="text-xs text-emerald-400">Copied</span>}
          </button>
        </div>

        <button
          type="button"
          onClick={handleToggleBookmark}
          aria-label={
            post.bookmarkedByMe ? `Remove bookmark ${post.id}` : `Bookmark post ${post.id}`
          }
          className={`p-1.5 rounded-lg transition-colors ${
            post.bookmarkedByMe ? 'text-[#FF385C]' : 'text-[#D4D4DC] hover:text-white'
          }`}
        >
          <Bookmark className={`w-5 h-5 ${post.bookmarkedByMe ? 'fill-[#FF385C]' : ''}`} />
        </button>
      </div>

      {/* Caption & Unboxed Hashtags */}
      <div className="px-4 pb-3 space-y-1.5">
        <p className="text-sm text-[#E4E4E7] leading-relaxed">
          <button
            type="button"
            onClick={() => onOpenProfile(post.author.username)}
            className="font-semibold text-white hover:underline mr-2"
          >
            {post.author.username}
          </button>
          <span>{post.caption}</span>
        </p>

        {post.hashtags.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[#8E8E99]">
            {post.hashtags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => onFilterHashtag(tag)}
                className="hover:text-[#FF385C] transition-colors"
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Comments & Replies */}
      <div className="px-4 pb-4 border-t border-[#1A1A22] pt-3 space-y-3">
        {post.comments.length > 0 && (
          <button
            type="button"
            onClick={() => setShowComments((s) => !s)}
            className="text-xs font-medium text-[#8E8E99] hover:text-white"
          >
            {showComments
              ? 'Hide comments'
              : `View ${post.commentsCount} ${post.commentsCount === 1 ? 'comment' : 'comments'}`}
          </button>
        )}

        {showComments && (
          <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
            {topComments.map((c) => {
              const replies = repliesByParent.get(c.id) || [];
              return (
                <div key={c.id} className="space-y-1.5">
                  <div className="text-xs leading-relaxed flex items-start justify-between gap-2">
                    <p className="text-[#D4D4DC]">
                      <span className="font-semibold text-white mr-1.5">
                        {c.author?.username || 'user'}
                      </span>
                      <span>{c.content}</span>
                    </p>
                    <button
                      type="button"
                      onClick={() => setReplyTo(c)}
                      className="text-[11px] text-[#71717A] hover:text-white shrink-0"
                    >
                      Reply
                    </button>
                  </div>
                  {replies.map((r) => (
                    <div key={r.id} className="pl-4 text-xs text-[#B4B4BE]">
                      <span className="font-semibold text-white mr-1.5">
                        {r.author?.username || 'user'}
                      </span>
                      <span>{r.content}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        <form onSubmit={handleCommentSubmit} className="flex items-center gap-2">
          {replyTo && (
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="text-xs text-[#FF6B85] shrink-0"
            >
              @{replyTo.author?.username} ×
            </button>
          )}
          <input
            type="text"
            aria-label={`Add a comment on post ${post.id}`}
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder={replyTo ? `Reply to @${replyTo.author?.username}...` : 'Add a comment...'}
            className="flex-1 bg-transparent text-xs text-white placeholder:text-[#52525B] focus:outline-none py-1.5"
          />
          <button
            type="submit"
            disabled={!commentText.trim()}
            aria-label="Send comment"
            className="text-xs font-semibold text-[#FF385C] disabled:opacity-40 hover:text-[#FF6B85] flex items-center gap-1"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </article>
  );
};
