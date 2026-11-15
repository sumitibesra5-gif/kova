import React from 'react';
import {
  Bell,
  Compass,
  Film,
  Home,
  MessageCircle,
  PlusSquare,
  Shield,
  Sparkles,
  User,
} from 'lucide-react';
import type { AppTab, UserProfile } from '../types';
import { Avatar } from './Avatar';

interface SidebarNavProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  onOpenCreate: () => void;
  onOpenAi: () => void;
  onOpenAuth: () => void;
  currentUser: UserProfile | null;
  unreadNotifications: number;
  unreadMessages: number;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({
  activeTab,
  onSelectTab,
  onOpenCreate,
  onOpenAi,
  onOpenAuth,
  currentUser,
  unreadNotifications,
  unreadMessages,
}) => {
  const navItems: Array<{
    id: AppTab;
    label: string;
    icon: React.ReactNode;
    badge?: number;
  }> = [
    { id: 'feed', label: 'Feed', icon: <Home className="w-5 h-5" /> },
    { id: 'reels', label: 'Reels', icon: <Film className="w-5 h-5" /> },
    { id: 'explore', label: 'Explore & Web', icon: <Compass className="w-5 h-5" /> },
    {
      id: 'messages',
      label: 'Messages',
      icon: <MessageCircle className="w-5 h-5" />,
      badge: unreadMessages,
    },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: <Bell className="w-5 h-5" />,
      badge: unreadNotifications,
    },
    { id: 'profile', label: 'Profile', icon: <User className="w-5 h-5" /> },
    { id: 'admin', label: 'Admin', icon: <Shield className="w-5 h-5" /> },
  ];

  return (
    <>
      {/* Desktop Left Navigation Rail */}
      <aside className="hidden md:flex flex-col justify-between w-[240px] shrink-0 h-screen sticky top-0 border-r border-[#1E1E26] bg-[#0A0A0C] px-4 py-6">
        <div className="space-y-6">
          <div className="px-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => onSelectTab('feed')}
              className="text-2xl font-display font-bold tracking-tight text-white hover:opacity-90 transition-opacity whitespace-nowrap"
            >
              Kova
            </button>
          </div>

          <nav aria-label="Primary navigation" className="space-y-1">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-[#191920] text-white'
                      : 'text-[#A1A1AA] hover:text-white hover:bg-[#141419]'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <span className={isActive ? 'text-[#FF385C]' : ''}>{item.icon}</span>
                    <span>{item.label}</span>
                  </span>
                  {item.badge && item.badge > 0 ? (
                    <span className="font-mono-tabular text-xs font-semibold text-[#FF385C]">
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>

          <div className="pt-2 space-y-2.5">
            <button
              type="button"
              onClick={onOpenCreate}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#FF385C] hover:bg-[#E11D48] text-white text-sm font-semibold transition-colors whitespace-nowrap"
            >
              <PlusSquare className="w-4 h-4" />
              <span>Create Post</span>
            </button>

            <button
              type="button"
              onClick={onOpenAi}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#16161C] hover:bg-[#1E1E26] border border-[#272731] text-[#F4F4F6] text-sm font-medium transition-colors whitespace-nowrap"
            >
              <Sparkles className="w-4 h-4 text-[#FF385C]" />
              <span>Kova AI</span>
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-[#1E1E26]">
          {currentUser ? (
            <button
              type="button"
              onClick={() => onSelectTab('profile')}
              className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-[#141419] transition-colors text-left"
            >
              <Avatar src={currentUser.avatarUrl} alt={currentUser.displayName} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate">
                  {currentUser.displayName}
                </p>
                <p className="text-xs text-[#8E8E99] truncate">@{currentUser.username}</p>
              </div>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="w-full px-4 py-2.5 rounded-xl border border-[#272731] bg-[#121216] hover:bg-[#191920] text-sm font-medium text-white transition-colors whitespace-nowrap"
            >
              Sign In / Join
            </button>
          )}
        </div>
      </aside>

      {/* Mobile Compact Top Bar & Bottom Navigation (<= 15% sticky height cap) */}
      <header className="md:hidden fixed top-0 inset-x-0 z-30 h-12 bg-[#0A0A0C]/95 backdrop-blur-md border-b border-[#1E1E26] px-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onSelectTab('feed')}
          className="text-lg font-display font-bold tracking-tight text-white"
        >
          Kova
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenAi}
            aria-label="Open Kova AI"
            className="p-2 rounded-lg text-[#F4F4F6] hover:bg-[#16161C]"
          >
            <Sparkles className="w-4 h-4 text-[#FF385C]" />
          </button>
          <button
            type="button"
            onClick={onOpenCreate}
            aria-label="Create Post"
            className="p-2 rounded-lg text-[#F4F4F6] hover:bg-[#16161C]"
          >
            <PlusSquare className="w-4 h-4" />
          </button>
          {!currentUser && (
            <button
              type="button"
              onClick={onOpenAuth}
              className="px-3 py-1 rounded-lg bg-[#FF385C] text-white text-xs font-semibold"
            >
              Sign In
            </button>
          )}
        </div>
      </header>

      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 h-14 bg-[#0A0A0C]/95 backdrop-blur-md border-t border-[#1E1E26] flex items-center justify-around px-1"
      >
        {[
          { id: 'feed' as AppTab, label: 'Feed', icon: <Home className="w-5 h-5" /> },
          { id: 'reels' as AppTab, label: 'Reels', icon: <Film className="w-5 h-5" /> },
          { id: 'explore' as AppTab, label: 'Explore', icon: <Compass className="w-5 h-5" /> },
          {
            id: 'messages' as AppTab,
            label: 'Messages',
            icon: <MessageCircle className="w-5 h-5" />,
          },
          { id: 'profile' as AppTab, label: 'Profile', icon: <User className="w-5 h-5" /> },
        ].map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-label={item.label}
              className={`flex flex-col items-center justify-center min-w-[44px] min-h-[44px] rounded-lg ${
                active ? 'text-[#FF385C]' : 'text-[#8E8E99]'
              }`}
            >
              {item.icon}
            </button>
          );
        })}
      </nav>
    </>
  );
};
