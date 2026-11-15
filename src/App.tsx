import React, { useEffect, useRef, useState } from 'react';
import { Hash, Sparkles, X } from 'lucide-react';
import { AdminDashboardView } from './components/AdminDashboardView';
import { AiAssistantPanel } from './components/AiAssistantPanel';
import { AuthModal } from './components/AuthModal';
import { Avatar } from './components/Avatar';
import { CreatePostModal } from './components/CreatePostModal';
import { ExploreBrowserView } from './components/ExploreBrowserView';
import { MessagesView } from './components/MessagesView';
import { NotificationsView } from './components/NotificationsView';
import { PostCard } from './components/PostCard';
import { ProfileView } from './components/ProfileView';
import { ReelsView } from './components/ReelsView';
import { SidebarNav } from './components/SidebarNav';
import { StoriesBar } from './components/StoriesBar';
import { StoryViewerModal } from './components/StoryViewerModal';
import { onAuthStateChanged } from 'firebase/auth';
import {
  apiRequest,
  getStoredSessionToken,
  setStoredSessionToken,
} from './lib/api';
import { auth } from './lib/firebase';
import type {
  AppTab,
  NotificationItem,
  PostItem,
  StoryItem,
  UserProfile,
} from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('feed');
  const [feedMode, setFeedMode] = useState<'discover' | 'following'>('discover');
  const [activeHashtag, setActiveHashtag] = useState<string | null>(null);
  const [viewingUsername, setViewingUsername] = useState<string | null>(null);

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [reels, setReels] = useState<PostItem[]>([]);
  const [stories, setStories] = useState<StoryItem[]>([]);
  const [creators, setCreators] = useState<UserProfile[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [onlineIds, setOnlineIds] = useState<Set<number>>(new Set());
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [loadingFeed, setLoadingFeed] = useState(true);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createMode, setCreateMode] = useState<'post' | 'reel' | 'story'>('post');
  const [activeStoryId, setActiveStoryId] = useState<number | null>(null);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiAttachedPost, setAiAttachedPost] = useState<PostItem | null>(null);
  const [activeConvoId, setActiveConvoId] = useState<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const explicitlyLoggedOutRef = useRef(false);
  const firebaseSyncInFlightRef = useRef(false);

  const fetchInitialData = async (showSkeleton = false) => {
    if (showSkeleton) setLoadingFeed(true);
    try {
      const meRes = await apiRequest<{ user: UserProfile | null }>('/api/auth/me');
      let resolvedUser = meRes.user;

      if (
        !resolvedUser &&
        !explicitlyLoggedOutRef.current &&
        auth.currentUser &&
        !firebaseSyncInFlightRef.current
      ) {
        firebaseSyncInFlightRef.current = true;
        try {
          const idToken = await auth.currentUser.getIdToken();
          const syncRes = await apiRequest<{
            user: UserProfile;
            sessionToken?: string;
          }>('/api/auth/firebase', {
            method: 'POST',
            body: JSON.stringify({ idToken }),
          });
          setStoredSessionToken(syncRes.sessionToken);
          resolvedUser = syncRes.user;
        } catch {
          // ignore silent sync failure
        } finally {
          firebaseSyncInFlightRef.current = false;
        }
      }

      setCurrentUser(resolvedUser);

      const [postsRes, reelsRes, storiesRes, usersRes] = await Promise.all([
        apiRequest<{ posts: PostItem[] }>(
          `/api/posts?feed=${activeHashtag ? 'discover' : feedMode}${
            activeHashtag ? `&hashtag=${encodeURIComponent(activeHashtag)}` : ''
          }`
        ),
        apiRequest<{ posts: PostItem[] }>('/api/posts?feed=reels'),
        apiRequest<{ stories: StoryItem[] }>('/api/stories'),
        apiRequest<{ users: UserProfile[] }>('/api/users'),
      ]);

      setPosts(postsRes.posts);
      setReels(reelsRes.posts);
      setStories(storiesRes.stories);
      setCreators(usersRes.users);

      if (resolvedUser) {
        const [notifRes, convoRes] = await Promise.all([
          apiRequest<{ notifications: NotificationItem[] }>('/api/notifications'),
          apiRequest<{ conversations: Array<{ unreadCount: number }> }>(
            '/api/conversations'
          ),
        ]);
        setNotifications(notifRes.notifications);
        setUnreadMessages(
          convoRes.conversations.reduce((acc, c) => acc + c.unreadCount, 0)
        );
      } else {
        setNotifications([]);
        setUnreadMessages(0);
      }
    } catch {
      // handled cleanly
    } finally {
      setLoadingFeed(false);
    }
  };

  useEffect(() => {
    fetchInitialData(posts.length === 0);
  }, [feedMode, activeHashtag, currentUser?.id]);

  // Restore Google Firebase session if client storage or cookie was missing on reload
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (
        !fbUser ||
        explicitlyLoggedOutRef.current ||
        getStoredSessionToken() ||
        firebaseSyncInFlightRef.current
      ) {
        return;
      }
      firebaseSyncInFlightRef.current = true;
      try {
        const idToken = await fbUser.getIdToken();
        const syncRes = await apiRequest<{
          user: UserProfile;
          sessionToken?: string;
        }>('/api/auth/firebase', {
          method: 'POST',
          body: JSON.stringify({ idToken }),
        });
        setStoredSessionToken(syncRes.sessionToken);
        setCurrentUser(syncRes.user);
      } catch {
        // ignore
      } finally {
        firebaseSyncInFlightRef.current = false;
      }
    });
    return () => unsub();
  }, []);

  // WebSocket live connection when authenticated
  useEffect(() => {
    if (!currentUser) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = getStoredSessionToken();
    const wsUrl = token
      ? `${proto}//${window.location.host}/ws?token=${encodeURIComponent(token)}`
      : `${proto}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(ev.data) as {
          event: string;
          data: Record<string, unknown>;
        };
        if (parsed.event === 'presence:update') {
          const ids = (parsed.data.onlineIds as number[]) || [];
          setOnlineIds(new Set(ids));
        } else if (parsed.event === 'notification:new') {
          const n = parsed.data as unknown as NotificationItem;
          setNotifications((prev) => [n, ...prev]);
          if (n.type === 'message') {
            setUnreadMessages((c) => c + 1);
          }
        }
      } catch {
        // ignore
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [currentUser?.id]);

  const handleOpenProfile = (username: string) => {
    setViewingUsername(username);
    setActiveTab('profile');
  };

  const handleOpenAiForPost = (post: PostItem) => {
    setAiAttachedPost(post);
    setAiPanelOpen(true);
  };

  const handleStartMessage = async (targetUserId: number) => {
    if (!currentUser) {
      setAuthModalOpen(true);
      return;
    }
    const res = await apiRequest<{ conversationId: number }>('/api/conversations', {
      method: 'POST',
      body: JSON.stringify({ targetUserId }),
    });
    setActiveConvoId(res.conversationId);
    setActiveTab('messages');
  };

  const handleToggleFollowCreator = async (creator: UserProfile) => {
    if (!currentUser) {
      setAuthModalOpen(true);
      return;
    }
    const res = await apiRequest<{ following: boolean; followersCount: number }>(
      `/api/users/${creator.id}/follow`,
      { method: 'POST' }
    );
    setCreators((prev) =>
      prev.map((u) =>
        u.id === creator.id
          ? {
              ...u,
              isFollowedByMe: res.following,
              followersCount: res.followersCount,
            }
          : u
      )
    );
  };

  const handleMarkNotificationsRead = async () => {
    await apiRequest('/api/notifications/read', { method: 'POST' });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const unreadNotificationsCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-[#F4F4F6] flex flex-col md:flex-row">
      <SidebarNav
        activeTab={activeTab}
        onSelectTab={(tab) => {
          if (tab === 'profile') setViewingUsername(null);
          setActiveTab(tab);
        }}
        onOpenCreate={() => {
          if (!currentUser) return setAuthModalOpen(true);
          setCreateMode('post');
          setCreateModalOpen(true);
        }}
        onOpenAi={() => {
          setAiPanelOpen(true);
        }}
        onOpenAuth={() => setAuthModalOpen(true)}
        currentUser={currentUser}
        unreadNotifications={unreadNotificationsCount}
        unreadMessages={unreadMessages}
      />

      <main className="flex-1 min-w-0 pt-14 pb-16 md:pt-0 md:pb-0">
        {activeTab === 'feed' && (
          <div className="max-w-5xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[minmax(0,620px)_300px] gap-8 lg:justify-center">
            {/* Main Feed Column */}
            <div className="min-w-0 space-y-6">
              <StoriesBar
                stories={stories}
                currentUser={currentUser}
                onSelectStory={(s) => setActiveStoryId(s.id)}
                onAddStory={() => {
                  if (!currentUser) return setAuthModalOpen(true);
                  setCreateMode('story');
                  setCreateModalOpen(true);
                }}
              />

              {/* Feed Mode Controls */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-1 p-1 rounded-xl bg-[#121216] border border-[#24242C]">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveHashtag(null);
                      setFeedMode('discover');
                    }}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      feedMode === 'discover' && !activeHashtag
                        ? 'bg-[#1D1D24] text-white'
                        : 'text-[#8E8E99] hover:text-white'
                    }`}
                  >
                    Discover
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!currentUser) return setAuthModalOpen(true);
                      setActiveHashtag(null);
                      setFeedMode('following');
                    }}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      feedMode === 'following' && !activeHashtag
                        ? 'bg-[#1D1D24] text-white'
                        : 'text-[#8E8E99] hover:text-white'
                    }`}
                  >
                    Following
                  </button>
                </div>

                {activeHashtag && (
                  <button
                    type="button"
                    onClick={() => setActiveHashtag(null)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-[#FF6B85]"
                  >
                    <Hash className="w-3.5 h-3.5" />
                    <span>{activeHashtag}</span>
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Feed Stream */}
              {loadingFeed ? (
                <div className="space-y-6">
                  {[1, 2].map((n) => (
                    <div
                      key={n}
                      className="h-96 rounded-2xl bg-[#121216] border border-[#1E1E26] animate-pulse"
                    />
                  ))}
                </div>
              ) : posts.length === 0 ? (
                <div className="rounded-2xl bg-[#121216] border border-[#1E1E26] p-10 text-center space-y-3">
                  <p className="text-base font-display font-semibold text-white">
                    {feedMode === 'following'
                      ? 'Your Following feed is quiet'
                      : 'No posts match this view yet'}
                  </p>
                  <p className="text-xs text-[#8E8E99]">
                    Follow creators or switch back to Discover to explore visual stories.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveHashtag(null);
                      setFeedMode('discover');
                    }}
                    className="px-4 py-2 rounded-xl bg-[#FF385C] text-white text-xs font-semibold"
                  >
                    Explore Discover Feed
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {posts.map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      currentUser={currentUser}
                      onRequireAuth={() => setAuthModalOpen(true)}
                      onOpenProfile={handleOpenProfile}
                      onOpenAiForPost={handleOpenAiForPost}
                      onFilterHashtag={(tag) => setActiveHashtag(tag)}
                      onPostUpdated={(updated) => {
                        setPosts((prev) =>
                          prev.map((p) => (p.id === updated.id ? updated : p))
                        );
                        setReels((prev) =>
                          prev.map((p) => (p.id === updated.id ? updated : p))
                        );
                      }}
                      onPostDeleted={(postId) => {
                        setPosts((prev) => prev.filter((p) => p.id !== postId));
                        setReels((prev) => prev.filter((p) => p.id !== postId));
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Right Context Rail */}
            <aside className="hidden lg:block space-y-6 sticky top-6 self-start">
              {!currentUser && (
                <div className="rounded-2xl bg-[#121216] border border-[#24242C] p-5 space-y-3">
                  <h2 className="text-sm font-display font-bold text-white">
                    Join Kova
                  </h2>
                  <p className="text-xs text-[#8E8E99] leading-relaxed">
                    Share photography and reels, message creators in real time, and explore with AI.
                  </p>
                  <button
                    type="button"
                    onClick={() => setAuthModalOpen(true)}
                    className="w-full py-2.5 rounded-xl bg-[#FF385C] hover:bg-[#E11D48] text-white text-xs font-semibold transition-colors"
                  >
                    Sign In or Register
                  </button>
                </div>
              )}

              <div className="rounded-2xl bg-[#121216] border border-[#1E1E26] p-5 space-y-4">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[#8E8E99]">
                  Creators to Follow
                </h2>
                <div className="space-y-3.5">
                  {creators
                    .filter((c) => c.id !== currentUser?.id)
                    .slice(0, 5)
                    .map((creator) => (
                      <div
                        key={creator.id}
                        className="flex items-center justify-between gap-2.5"
                      >
                        <button
                          type="button"
                          onClick={() => handleOpenProfile(creator.username)}
                          className="flex items-center gap-2.5 min-w-0 text-left"
                        >
                          <Avatar
                            src={creator.avatarUrl}
                            alt={creator.displayName}
                            size="sm"
                            online={onlineIds.has(creator.id) || creator.isOnline}
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-white truncate">
                              {creator.displayName}
                            </p>
                            <p className="text-[11px] text-[#8E8E99] truncate">
                              @{creator.username}
                            </p>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleFollowCreator(creator)}
                          className={`text-xs font-semibold shrink-0 ${
                            creator.isFollowedByMe
                              ? 'text-[#8E8E99] hover:text-white'
                              : 'text-[#FF6B85] hover:text-[#FF385C]'
                          }`}
                        >
                          {creator.isFollowedByMe ? 'Following' : 'Follow'}
                        </button>
                      </div>
                    ))}
                </div>
              </div>

              <div className="rounded-2xl bg-[#121216] border border-[#1E1E26] p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#FF385C]" />
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-[#8E8E99]">
                    AI Discovery
                  </h2>
                </div>
                <p className="text-xs text-[#A1A1AA] leading-relaxed">
                  Analyze any photo, reel, or discussion thread, or launch the built-in AI Web Browser.
                </p>
                <div className="flex flex-col gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setAiPanelOpen(true)}
                    className="w-full py-2 rounded-xl bg-[#191920] hover:bg-[#23232C] border border-[#2A2A34] text-xs font-semibold text-white"
                  >
                    Open Kova AI Assistant
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('explore')}
                    className="w-full py-2 rounded-xl bg-transparent hover:bg-[#191920] border border-[#24242C] text-xs font-medium text-[#D4D4DC]"
                  >
                    Open AI Web Browser
                  </button>
                </div>
              </div>
            </aside>
          </div>
        )}

        {activeTab === 'reels' && (
          <ReelsView
            reels={reels}
            currentUser={currentUser}
            onRequireAuth={() => setAuthModalOpen(true)}
            onOpenAiForPost={handleOpenAiForPost}
            onOpenProfile={handleOpenProfile}
            onPostUpdated={(updated) => {
              setReels((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
              setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
            }}
          />
        )}

        {activeTab === 'explore' && (
          <ExploreBrowserView
            allPosts={posts}
            onOpenProfile={handleOpenProfile}
            onOpenAiForPost={handleOpenAiForPost}
            onSelectHashtag={(tag) => {
              setActiveHashtag(tag);
              setActiveTab('feed');
            }}
          />
        )}

        {activeTab === 'messages' && (
          <MessagesView
            currentUser={currentUser}
            allUsers={creators}
            onlineIds={onlineIds}
            initialConvoId={activeConvoId}
            onRequireAuth={() => setAuthModalOpen(true)}
            wsSocket={wsRef.current}
          />
        )}

        {activeTab === 'notifications' && (
          <NotificationsView
            currentUser={currentUser}
            notifications={notifications}
            onMarkAllRead={handleMarkNotificationsRead}
            onOpenProfile={handleOpenProfile}
            onRequireAuth={() => setAuthModalOpen(true)}
          />
        )}

        {activeTab === 'profile' && (
          <ProfileView
            username={viewingUsername}
            currentUser={currentUser}
            onRequireAuth={() => setAuthModalOpen(true)}
            onUserUpdated={(user) => {
              explicitlyLoggedOutRef.current = user === null;
              setCurrentUser(user);
            }}
            onStartMessage={handleStartMessage}
            onOpenAiForPost={handleOpenAiForPost}
          />
        )}

        {activeTab === 'admin' && <AdminDashboardView />}
      </main>

      {/* Modals & Drawers */}
      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(user) => {
          explicitlyLoggedOutRef.current = false;
          setCurrentUser(user);
        }}
      />

      <CreatePostModal
        open={createModalOpen}
        initialMode={createMode}
        onClose={() => setCreateModalOpen(false)}
        onCreatedPost={(newPost) => {
          setPosts((prev) => [newPost, ...prev]);
          if (newPost.isReel) setReels((prev) => [newPost, ...prev]);
        }}
        onCreatedStory={(newStory) => {
          setStories((prev) => [newStory, ...prev]);
        }}
      />

      <StoryViewerModal
        stories={stories}
        activeStoryId={activeStoryId}
        currentUser={currentUser}
        onClose={() => setActiveStoryId(null)}
        onSelectStory={(id) => setActiveStoryId(id)}
        onStoryViewed={(id) =>
          setStories((prev) =>
            prev.map((s) => (s.id === id ? { ...s, viewedByMe: true } : s))
          )
        }
      />

      <AiAssistantPanel
        open={aiPanelOpen}
        attachedPost={aiAttachedPost}
        onClearPost={() => setAiAttachedPost(null)}
        onClose={() => setAiPanelOpen(false)}
      />
    </div>
  );
}
