import React from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import type { NotificationItem, UserProfile } from '../types';
import { formatRelativeTime } from '../utils/socialLogic';
import { Avatar } from './Avatar';

interface NotificationsViewProps {
  currentUser: UserProfile | null;
  notifications: NotificationItem[];
  onMarkAllRead: () => void;
  onOpenProfile: (username: string) => void;
  onRequireAuth: () => void;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  currentUser,
  notifications,
  onMarkAllRead,
  onOpenProfile,
  onRequireAuth,
}) => {
  if (!currentUser) {
    return (
      <div className="max-w-lg mx-auto py-24 px-4 text-center space-y-4">
        <Bell className="w-8 h-8 text-[#8E8E99] mx-auto" />
        <h2 className="text-2xl font-display font-bold text-white">Notifications</h2>
        <p className="text-sm text-[#8E8E99]">
          Sign in to stay updated on likes, comments, follows, and new messages.
        </p>
        <button
          type="button"
          onClick={onRequireAuth}
          className="px-5 py-2.5 rounded-xl bg-[#FF385C] text-white text-sm font-semibold"
        >
          Sign In
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between border-b border-[#1E1E26] pb-4">
        <h1 className="text-2xl font-display font-bold text-white">Notifications</h1>
        {notifications.some((n) => !n.isRead) && (
          <button
            type="button"
            onClick={onMarkAllRead}
            className="text-xs font-semibold text-[#FF6B85] hover:underline flex items-center gap-1.5"
          >
            <CheckCheck className="w-4 h-4" />
            <span>Mark all read</span>
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <p className="text-sm text-[#8E8E99] py-12 text-center">
          You have no notifications yet.
        </p>
      ) : (
        <div className="divide-y divide-[#1A1A22] rounded-2xl bg-[#121216] border border-[#1E1E26]">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`p-4 flex items-center justify-between gap-3 ${
                !n.isRead ? 'bg-[#17171E]' : ''
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => n.actor && onOpenProfile(n.actor.username)}
                >
                  <Avatar
                    src={n.actor?.avatarUrl}
                    alt={n.actor?.displayName || 'Creator'}
                    size="md"
                  />
                </button>
                <p className="text-sm text-[#E4E4E7] leading-snug">
                  <button
                    type="button"
                    onClick={() => n.actor && onOpenProfile(n.actor.username)}
                    className="font-semibold text-white hover:underline mr-1.5"
                  >
                    @{n.actor?.username || 'creator'}
                  </button>
                  <span>{n.message}</span>
                </p>
              </div>
              <span className="text-xs text-[#71717A] font-mono-tabular shrink-0">
                {formatRelativeTime(n.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
