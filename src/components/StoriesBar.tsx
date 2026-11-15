import React from 'react';
import { Plus } from 'lucide-react';
import type { StoryItem, UserProfile } from '../types';
import { Avatar } from './Avatar';

interface StoriesBarProps {
  stories: StoryItem[];
  currentUser: UserProfile | null;
  onSelectStory: (story: StoryItem) => void;
  onAddStory: () => void;
}

export const StoriesBar: React.FC<StoriesBarProps> = ({
  stories,
  currentUser,
  onSelectStory,
  onAddStory,
}) => {
  return (
    <section
      aria-label="Active 24-hour stories"
      className="flex items-center gap-4 overflow-x-auto pb-3 pt-1 border-b border-[#1B1B22]"
    >
      <button
        type="button"
        onClick={onAddStory}
        className="flex flex-col items-center gap-1.5 shrink-0 group"
      >
        <div className="relative w-14 h-14 rounded-full bg-[#15151B] border border-dashed border-[#343442] group-hover:border-[#FF385C] flex items-center justify-center transition-colors">
          {currentUser?.avatarUrl ? (
            <Avatar src={currentUser.avatarUrl} alt={currentUser.displayName} size="lg" />
          ) : (
            <Plus className="w-5 h-5 text-[#A1A1AA] group-hover:text-white" />
          )}
          <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[#FF385C] text-white flex items-center justify-center border-2 border-[#0A0A0C]">
            <Plus className="w-3 h-3" />
          </span>
        </div>
        <span className="text-xs text-[#A1A1AA] group-hover:text-white max-w-[68px] truncate">
          Add Story
        </span>
      </button>

      {stories.map((story) => (
        <button
          key={story.id}
          type="button"
          onClick={() => onSelectStory(story)}
          className="flex flex-col items-center gap-1.5 shrink-0 group"
        >
          <Avatar
            src={story.author.avatarUrl}
            alt={story.author.displayName}
            size="lg"
            ring={!story.viewedByMe}
          />
          <span className="text-xs text-[#D4D4DC] group-hover:text-white max-w-[68px] truncate">
            {story.author.username}
          </span>
        </button>
      ))}
    </section>
  );
};
