import React, { useState } from 'react';
import { Bookmark, Heart, MessageCircle, Sparkles, Volume2, VolumeX } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { PostItem, UserProfile } from '../types';
import { Avatar } from './Avatar';

interface ReelsViewProps {
  reels: PostItem[];
  currentUser: UserProfile | null;
  onRequireAuth: () => void;
  onOpenAiForPost: (post: PostItem) => void;
  onOpenProfile: (username: string) => void;
  onPostUpdated: (updated: PostItem) => void;
}

export const ReelsView: React.FC<ReelsViewProps> = ({
  reels,
  currentUser,
  onRequireAuth,
  onOpenAiForPost,
  onOpenProfile,
  onPostUpdated,
}) => {
  const [muted, setMuted] = useState(true);
  const [activeCommentReelId, setActiveCommentReelId] = useState<number | null>(null);
  const [commentInput, setCommentInput] = useState('');

  const handleLike = async (reel: PostItem) => {
    if (!currentUser) return onRequireAuth();
    const res = await apiRequest<{ liked: boolean; likesCount: number }>(
      `/api/posts/${reel.id}/like`,
      { method: 'POST' }
    );
    onPostUpdated({ ...reel, likedByMe: res.liked, likesCount: res.likesCount });
  };

  const handleBookmark = async (reel: PostItem) => {
    if (!currentUser) return onRequireAuth();
    const res = await apiRequest<{ bookmarked: boolean }>(
      `/api/posts/${reel.id}/bookmark`,
      { method: 'POST' }
    );
    onPostUpdated({ ...reel, bookmarkedByMe: res.bookmarked });
  };

  const handleComment = async (e: React.FormEvent, reel: PostItem) => {
    e.preventDefault();
    if (!currentUser) return onRequireAuth();
    if (!commentInput.trim()) return;
    const res = await apiRequest<{ comment: PostItem['comments'][0] }>(
      `/api/posts/${reel.id}/comments`,
      {
        method: 'POST',
        body: JSON.stringify({ content: commentInput.trim() }),
      }
    );
    onPostUpdated({
      ...reel,
      commentsCount: reel.commentsCount + 1,
      comments: [...reel.comments, res.comment],
    });
    setCommentInput('');
  };

  if (reels.length === 0) {
    return (
      <div className="py-24 text-center">
        <h2 className="text-xl font-display font-bold text-white">No Reels yet</h2>
        <p className="text-sm text-[#8E8E99] mt-2">
          Upload a vertical video from Create Post to publish your first Reel.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto py-4 space-y-8">
      {reels.map((reel) => (
        <article
          key={reel.id}
          className="relative rounded-2xl overflow-hidden bg-[#121216] border border-[#24242C] aspect-[9/16]"
        >
          {reel.mediaType === 'video' ? (
            <video
              src={reel.mediaUrl}
              autoPlay
              loop
              muted={muted}
              playsInline
              onClick={(e) => {
                const vid = e.currentTarget;
                if (vid.paused) {
                  void vid.play();
                } else {
                  vid.pause();
                }
              }}
              className="w-full h-full object-cover cursor-pointer"
            />
          ) : (
            <img
              src={reel.mediaUrl}
              alt={reel.caption}
              className="w-full h-full object-cover"
            />
          )}

          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? 'Unmute video' : 'Mute video'}
            className="absolute top-4 right-4 p-2 rounded-full bg-black/60 text-white hover:bg-black/80"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {/* Bottom Scrim & Metadata */}
          <div className="absolute inset-x-0 bottom-0 p-5 pr-16 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none">
            <div className="flex items-center gap-2.5 mb-2 pointer-events-auto">
              <button
                type="button"
                onClick={() => onOpenProfile(reel.author.username)}
                className="flex items-center gap-2"
              >
                <Avatar src={reel.author.avatarUrl} alt={reel.author.displayName} size="sm" />
                <span className="text-sm font-semibold text-white">
                  @{reel.author.username}
                </span>
              </button>
            </div>
            <p className="text-xs text-[#E4E4E7] line-clamp-2">{reel.caption}</p>
            {reel.location && (
              <p className="text-[11px] text-[#A1A1AA] mt-1">{reel.location}</p>
            )}
          </div>

          {/* Right Action Rail */}
          <div className="absolute right-3 bottom-20 flex flex-col items-center gap-4">
            <button
              type="button"
              onClick={() => handleLike(reel)}
              aria-label={`Like reel ${reel.id}`}
              className="flex flex-col items-center gap-1 text-white"
            >
              <span className="p-2.5 rounded-full bg-black/55 hover:bg-black/80">
                <Heart
                  className={`w-5 h-5 ${reel.likedByMe ? 'fill-[#FF385C] text-[#FF385C]' : ''}`}
                />
              </span>
              <span className="font-mono-tabular text-xs">{reel.likesCount}</span>
            </button>

            <button
              type="button"
              onClick={() =>
                setActiveCommentReelId(activeCommentReelId === reel.id ? null : reel.id)
              }
              aria-label={`Comments for reel ${reel.id}`}
              className="flex flex-col items-center gap-1 text-white"
            >
              <span className="p-2.5 rounded-full bg-black/55 hover:bg-black/80">
                <MessageCircle className="w-5 h-5" />
              </span>
              <span className="font-mono-tabular text-xs">{reel.commentsCount}</span>
            </button>

            <button
              type="button"
              onClick={() => handleBookmark(reel)}
              aria-label={`Bookmark reel ${reel.id}`}
              className="p-2.5 rounded-full bg-black/55 hover:bg-black/80 text-white"
            >
              <Bookmark
                className={`w-5 h-5 ${reel.bookmarkedByMe ? 'fill-[#FF385C] text-[#FF385C]' : ''}`}
              />
            </button>

            <button
              type="button"
              onClick={() => onOpenAiForPost(reel)}
              aria-label={`Analyze reel ${reel.id} with AI`}
              className="p-2.5 rounded-full bg-[#FF385C] hover:bg-[#E11D48] text-white"
            >
              <Sparkles className="w-5 h-5" />
            </button>
          </div>

          {/* Inline Comment Drawer */}
          {activeCommentReelId === reel.id && (
            <div className="absolute inset-x-0 bottom-0 bg-[#121216]/95 border-t border-[#24242C] p-4 space-y-3 max-h-64 overflow-y-auto">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white">Comments</span>
                <button
                  type="button"
                  onClick={() => setActiveCommentReelId(null)}
                  className="text-xs text-[#8E8E99] hover:text-white"
                >
                  Close
                </button>
              </div>
              <div className="space-y-2">
                {reel.comments.map((c) => (
                  <p key={c.id} className="text-xs text-[#D4D4DC]">
                    <span className="font-semibold text-white mr-1.5">
                      {c.author?.username}
                    </span>
                    {c.content}
                  </p>
                ))}
              </div>
              <form onSubmit={(e) => handleComment(e, reel)} className="flex gap-2">
                <input
                  type="text"
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  placeholder="Write a comment..."
                  className="flex-1 px-3 py-1.5 rounded-lg bg-[#0A0A0C] border border-[#24242C] text-xs text-white"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-[#FF385C] text-white text-xs font-semibold"
                >
                  Post
                </button>
              </form>
            </div>
          )}
        </article>
      ))}
    </div>
  );
};
