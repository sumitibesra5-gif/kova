export type AppTab =
  | 'feed'
  | 'reels'
  | 'explore'
  | 'messages'
  | 'notifications'
  | 'profile'
  | 'admin';

export interface UserProfile {
  id: number;
  uid: string;
  username: string;
  email: string;
  displayName: string;
  bio: string;
  avatarUrl: string;
  website: string;
  isPrivate: boolean;
  isVerified: boolean;
  isBanned: boolean;
  isActive: boolean;
  role: string;
  followersCount?: number;
  followingCount?: number;
  postsCount?: number;
  isFollowedByMe?: boolean;
  isOnline?: boolean;
  canViewPosts?: boolean;
}

export interface CommentItem {
  id: number;
  postId: number;
  parentId: number | null;
  content: string;
  createdAt: string;
  author: UserProfile | null;
}

export interface PostItem {
  id: number;
  authorId: number;
  author: UserProfile;
  authorFollowedByMe: boolean;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  aspectRatio: string;
  caption: string;
  hashtags: string[];
  location: string;
  isReel: boolean;
  createdAt: string;
  likesCount: number;
  likedByMe: boolean;
  bookmarkedByMe: boolean;
  commentsCount: number;
  comments: CommentItem[];
}

export interface StoryItem {
  id: number;
  mediaUrl: string;
  mediaType: string;
  caption: string;
  expiresAt: string;
  createdAt: string;
  viewedByMe: boolean;
  author: UserProfile;
}

export interface ConversationSummary {
  id: number;
  updatedAt: string;
  otherUser: UserProfile | null;
  isOnline: boolean;
  lastMessage: {
    content: string;
    mediaType: string;
    createdAt: string;
    senderId: number;
  } | null;
  unreadCount: number;
}

export interface DirectMessage {
  id: number;
  conversationId: number;
  senderId: number;
  content: string;
  mediaUrl: string;
  mediaType: string;
  isRead: boolean;
  isDeleted: boolean;
  createdAt: string;
}

export interface NotificationItem {
  id: number;
  userId: number;
  actorId: number;
  type: 'like' | 'comment' | 'follow' | 'message';
  postId: number | null;
  message: string;
  isRead: boolean;
  createdAt: string;
  actor: UserProfile | null;
}

export interface AiConfigData {
  id: number;
  systemPrompt: string;
  personality: string;
  tone: string;
  responsePreferences: string;
  updatedBy: string;
  updatedAt: string;
}

export interface ReportItem {
  id: number;
  reporterId: number;
  targetType: string;
  targetId: number;
  reason: string;
  status: string;
  resolvedBy: string | null;
  createdAt: string;
  reporter: UserProfile | null;
  targetPreview: string;
}

export interface SearchSource {
  title: string;
  url: string;
  snippet?: string;
  thumbnailUrl?: string;
  domain: string;
  faviconUrl: string;
}
