import React, { useEffect, useState } from 'react';
import {
  Bookmark,
  Edit3,
  Film,
  Grid,
  Lock,
  LogOut,
  MessageCircle,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { apiRequest, clearStoredSessionToken, uploadMediaFile } from '../lib/api';
import { auth } from '../lib/firebase';
import type { PostItem, UserProfile } from '../types';
import { Avatar } from './Avatar';

interface ProfileViewProps {
  username: string | null;
  currentUser: UserProfile | null;
  onRequireAuth: () => void;
  onUserUpdated: (user: UserProfile | null) => void;
  onStartMessage: (userId: number) => void;
  onOpenAiForPost: (post: PostItem) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  username,
  currentUser,
  onRequireAuth,
  onUserUpdated,
  onStartMessage,
  onOpenAiForPost,
}) => {
  const targetUsername = username || currentUser?.username || null;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [userPosts, setUserPosts] = useState<PostItem[]>([]);
  const [savedPosts, setSavedPosts] = useState<PostItem[]>([]);
  const [tab, setTab] = useState<'posts' | 'reels' | 'saved'>('posts');
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    displayName: '',
    username: '',
    bio: '',
    website: '',
    avatarUrl: '',
    isPrivate: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadProfile = async (uname: string) => {
    try {
      const data = await apiRequest<{ profile: UserProfile; posts: PostItem[] }>(
        `/api/users/${encodeURIComponent(uname)}`
      );
      setProfile(data.profile);
      setUserPosts(data.posts);
      setEditForm({
        displayName: data.profile.displayName,
        username: data.profile.username,
        bio: data.profile.bio,
        website: data.profile.website,
        avatarUrl: data.profile.avatarUrl,
        isPrivate: data.profile.isPrivate,
      });

      if (currentUser && data.profile.id === currentUser.id) {
        const savedRes = await apiRequest<{ posts: PostItem[] }>('/api/posts?feed=saved');
        setSavedPosts(savedRes.posts);
      }
    } catch {
      setProfile(null);
    }
  };

  useEffect(() => {
    if (targetUsername) {
      loadProfile(targetUsername);
    }
  }, [targetUsername, currentUser?.id]);

  if (!targetUsername) {
    return (
      <div className="max-w-lg mx-auto py-24 px-4 text-center space-y-4">
        <h2 className="text-2xl font-display font-bold text-white">Your Kova Profile</h2>
        <p className="text-sm text-[#8E8E99]">
          Sign in or register to customize your profile, publish posts, and save bookmarks.
        </p>
        <button
          type="button"
          onClick={onRequireAuth}
          className="px-5 py-2.5 rounded-xl bg-[#FF385C] text-white text-sm font-semibold"
        >
          Sign In / Create Account
        </button>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center text-sm text-[#8E8E99]">
        Loading profile...
      </div>
    );
  }

  const isMe = currentUser?.id === profile.id;

  const handleFollowToggle = async () => {
    if (!currentUser) return onRequireAuth();
    const res = await apiRequest<{ following: boolean; followersCount: number }>(
      `/api/users/${profile.id}/follow`,
      { method: 'POST' }
    );
    setProfile((p) =>
      p ? { ...p, isFollowedByMe: res.following, followersCount: res.followersCount } : p
    );
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const up = await uploadMediaFile(file);
    setEditForm((f) => ({ ...f, avatarUrl: up.url }));
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await apiRequest<{ user: UserProfile }>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify(editForm),
      });
      onUserUpdated(res.user);
      setProfile((p) => (p ? { ...p, ...res.user } : p));
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => {});
    clearStoredSessionToken();
    await signOut(auth).catch(() => {});
    onUserUpdated(null);
  };

  const handleDeactivate = async () => {
    await apiRequest('/api/auth/deactivate', { method: 'POST' });
    clearStoredSessionToken();
    await signOut(auth).catch(() => {});
    onUserUpdated(null);
  };

  const handleDeleteAccount = async () => {
    await apiRequest('/api/auth/account', { method: 'DELETE' });
    clearStoredSessionToken();
    await signOut(auth).catch(() => {});
    onUserUpdated(null);
  };

  const displayedPosts =
    tab === 'saved'
      ? savedPosts
      : tab === 'reels'
      ? userPosts.filter((p) => p.isReel)
      : userPosts.filter((p) => !p.isReel);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 pb-8 border-b border-[#1E1E26]">
        <Avatar src={profile.avatarUrl} alt={profile.displayName} size="xl" />

        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-display font-bold text-white">
              {profile.displayName}
            </h1>
            <span className="text-sm text-[#8E8E99]">@{profile.username}</span>
            {profile.isPrivate && (
              <span className="inline-flex items-center gap-1 text-xs text-[#A1A1AA]">
                <Lock className="w-3.5 h-3.5" />
                Private
              </span>
            )}
          </div>

          <div className="flex items-center gap-6 text-sm">
            <span>
              <strong className="font-mono-tabular text-white">{profile.postsCount ?? userPosts.length}</strong>{' '}
              <span className="text-[#8E8E99]">posts</span>
            </span>
            <span>
              <strong className="font-mono-tabular text-white">{profile.followersCount ?? 0}</strong>{' '}
              <span className="text-[#8E8E99]">followers</span>
            </span>
            <span>
              <strong className="font-mono-tabular text-white">{profile.followingCount ?? 0}</strong>{' '}
              <span className="text-[#8E8E99]">following</span>
            </span>
          </div>

          {profile.bio && (
            <p className="text-sm text-[#D4D4DC] max-w-xl leading-relaxed">{profile.bio}</p>
          )}
          {profile.website && (
            <a
              href={profile.website}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-xs text-[#FF6B85] hover:underline"
            >
              {profile.website}
            </a>
          )}

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            {isMe ? (
              <>
                <button
                  type="button"
                  onClick={() => setEditing((v) => !v)}
                  className="px-4 py-2 rounded-xl bg-[#191920] hover:bg-[#22222B] border border-[#2A2A35] text-xs font-semibold text-white flex items-center gap-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Profile</span>
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-4 py-2 rounded-xl bg-[#191920] hover:bg-[#22222B] border border-[#2A2A35] text-xs font-semibold text-[#D4D4DC] flex items-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Log Out</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleFollowToggle}
                  className={`px-5 py-2 rounded-xl text-xs font-semibold transition-colors ${
                    profile.isFollowedByMe
                      ? 'bg-[#191920] text-white border border-[#2A2A35]'
                      : 'bg-[#FF385C] hover:bg-[#E11D48] text-white'
                  }`}
                >
                  {profile.isFollowedByMe ? 'Following' : 'Follow'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!currentUser) return onRequireAuth();
                    onStartMessage(profile.id);
                  }}
                  className="px-4 py-2 rounded-xl bg-[#191920] hover:bg-[#22222B] border border-[#2A2A35] text-xs font-semibold text-white flex items-center gap-1.5"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Message</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Edit Profile Panel */}
      {editing && isMe && (
        <form
          onSubmit={handleSaveProfile}
          className="rounded-2xl bg-[#121216] border border-[#24242C] p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-display font-bold text-white">Edit Profile</h2>
            <label className="text-xs font-semibold text-[#FF6B85] cursor-pointer hover:underline">
              Upload new avatar
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="sr-only"
              />
            </label>
          </div>

          {error && <p className="text-xs text-[#FF8A9E]">{error}</p>}

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="edit-display-name" className="block text-xs text-[#A1A1AA] mb-1">
                Display Name
              </label>
              <input
                id="edit-display-name"
                type="text"
                value={editForm.displayName}
                onChange={(e) => setEditForm((f) => ({ ...f, displayName: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl bg-[#0A0A0C] border border-[#24242C] text-sm text-white"
              />
            </div>
            <div>
              <label htmlFor="edit-username" className="block text-xs text-[#A1A1AA] mb-1">
                Username
              </label>
              <input
                id="edit-username"
                type="text"
                value={editForm.username}
                onChange={(e) => setEditForm((f) => ({ ...f, username: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl bg-[#0A0A0C] border border-[#24242C] text-sm text-white"
              />
            </div>
          </div>

          <div>
            <label htmlFor="edit-bio" className="block text-xs text-[#A1A1AA] mb-1">
              Bio
            </label>
            <textarea
              id="edit-bio"
              rows={2}
              value={editForm.bio}
              onChange={(e) => setEditForm((f) => ({ ...f, bio: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl bg-[#0A0A0C] border border-[#24242C] text-sm text-white resize-none"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4 items-center">
            <div>
              <label htmlFor="edit-website" className="block text-xs text-[#A1A1AA] mb-1">
                Website
              </label>
              <input
                id="edit-website"
                type="text"
                value={editForm.website}
                onChange={(e) => setEditForm((f) => ({ ...f, website: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl bg-[#0A0A0C] border border-[#24242C] text-sm text-white"
              />
            </div>

            <label className="flex items-center gap-2.5 text-xs text-[#D4D4DC] pt-4 cursor-pointer">
              <input
                type="checkbox"
                checked={editForm.isPrivate}
                onChange={(e) => setEditForm((f) => ({ ...f, isPrivate: e.target.checked }))}
                className="accent-[#FF385C]"
              />
              <span>Private Account (followers only)</span>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#1E1E26]">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleDeactivate}
                className="text-xs text-[#A1A1AA] hover:text-white"
              >
                Deactivate Account
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                className="text-xs text-[#FF6B85] hover:underline flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Permanently</span>
              </button>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="px-4 py-2 rounded-xl text-xs text-[#A1A1AA] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-[#FF385C] text-white text-xs font-semibold"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Profile Content Tabs */}
      <div className="flex items-center gap-6 border-b border-[#1E1E26]">
        <button
          type="button"
          onClick={() => setTab('posts')}
          className={`pb-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors ${
            tab === 'posts'
              ? 'border-[#FF385C] text-white'
              : 'border-transparent text-[#8E8E99] hover:text-white'
          }`}
        >
          <Grid className="w-3.5 h-3.5" />
          <span>Posts</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('reels')}
          className={`pb-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors ${
            tab === 'reels'
              ? 'border-[#FF385C] text-white'
              : 'border-transparent text-[#8E8E99] hover:text-white'
          }`}
        >
          <Film className="w-3.5 h-3.5" />
          <span>Reels</span>
        </button>
        {isMe && (
          <button
            type="button"
            onClick={() => setTab('saved')}
            className={`pb-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors ${
              tab === 'saved'
                ? 'border-[#FF385C] text-white'
                : 'border-transparent text-[#8E8E99] hover:text-white'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span>Saved ({savedPosts.length})</span>
          </button>
        )}
      </div>

      {!profile.canViewPosts && !isMe ? (
        <div className="py-16 text-center space-y-2">
          <Lock className="w-7 h-7 text-[#8E8E99] mx-auto" />
          <p className="text-sm font-semibold text-white">This account is private</p>
          <p className="text-xs text-[#8E8E99]">Follow @{profile.username} to view their posts.</p>
        </div>
      ) : displayedPosts.length === 0 ? (
        <p className="py-12 text-center text-sm text-[#8E8E99]">Nothing here yet.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayedPosts.map((p) => (
            <div
              key={p.id}
              className="rounded-xl overflow-hidden bg-[#121216] border border-[#24242C] aspect-square relative group"
            >
              {p.mediaType === 'video' ? (
                <video src={p.mediaUrl} muted loop playsInline className="w-full h-full object-cover" />
              ) : (
                <img src={p.mediaUrl} alt={p.caption} className="w-full h-full object-cover" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-3 flex items-end justify-between">
                <span className="text-xs text-white font-mono-tabular">
                  {p.likesCount} likes · {p.commentsCount} comments
                </span>
                <button
                  type="button"
                  onClick={() => onOpenAiForPost(p)}
                  aria-label="Ask AI about post"
                  className="p-1.5 rounded-lg bg-[#FF385C] text-white"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
