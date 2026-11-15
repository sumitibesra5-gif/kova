import React, { useEffect } from 'react';
import { ChevronLeft, ChevronRight, Clock, X } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { StoryItem, UserProfile } from '../types';
import { formatRelativeTime } from '../utils/socialLogic';
import { Avatar } from './Avatar';

interface StoryViewerModalProps {
  stories: StoryItem[];
  activeStoryId: number | null;
  currentUser: UserProfile | null;
  onClose: () => void;
  onSelectStory: (id: number) => void;
  onStoryViewed: (id: number) => void;
}

export const StoryViewerModal: React.FC<StoryViewerModalProps> = ({
  stories,
  activeStoryId,
  currentUser,
  onClose,
  onSelectStory,
  onStoryViewed,
}) => {
  const index = stories.findIndex((s) => s.id === activeStoryId);
  const story = index >= 0 ? stories[index] : null;

  useEffect(() => {
    if (!story) return;
    if (currentUser && !story.viewedByMe) {
      apiRequest(`/api/stories/${story.id}/view`, { method: 'POST' })
        .then(() => onStoryViewed(story.id))
        .catch(() => {});
    }
  }, [story?.id, currentUser?.id]);

  if (!story) return null;

  const hoursLeft = Math.max(
    1,
    Math.round((new Date(story.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60))
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Story by ${story.author.username}`}
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close story viewer"
        className="absolute top-4 right-4 p-2.5 rounded-full bg-[#191920] text-white hover:bg-[#272731]"
      >
        <X className="w-5 h-5" />
      </button>

      {index > 0 && (
        <button
          type="button"
          onClick={() => onSelectStory(stories[index - 1].id)}
          aria-label="Previous story"
          className="hidden sm:flex p-3 rounded-full bg-[#191920] text-white hover:bg-[#272731] mr-4"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}

      <div className="relative w-full max-w-sm aspect-[9/16] rounded-2xl overflow-hidden bg-[#121216] border border-[#24242C]">
        {story.mediaType === 'video' ? (
          <video
            src={story.mediaUrl}
            autoPlay
            loop
            playsInline
            controls
            className="w-full h-full object-cover"
          />
        ) : (
          <img
            src={story.mediaUrl}
            alt={story.caption || `Story by ${story.author.username}`}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        )}

        <div className="absolute inset-x-0 top-0 p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Avatar src={story.author.avatarUrl} alt={story.author.displayName} size="sm" />
            <div>
              <p className="text-sm font-semibold text-white">{story.author.username}</p>
              <p className="text-xs text-[#D4D4DC] flex items-center gap-1.5 font-mono-tabular">
                <span>{formatRelativeTime(story.createdAt)}</span>
                <span aria-hidden="true">·</span>
                <Clock className="w-3 h-3" />
                <span>{hoursLeft}h left</span>
              </p>
            </div>
          </div>
        </div>

        {story.caption && (
          <div className="absolute inset-x-0 bottom-0 p-5 bg-gradient-to-t from-black/85 via-black/45 to-transparent">
            <p className="text-sm text-white leading-relaxed">{story.caption}</p>
          </div>
        )}
      </div>

      {index < stories.length - 1 && (
        <button
          type="button"
          onClick={() => onSelectStory(stories[index + 1].id)}
          aria-label="Next story"
          className="hidden sm:flex p-3 rounded-full bg-[#191920] text-white hover:bg-[#272731] ml-4"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      )}
    </div>
  );
};
