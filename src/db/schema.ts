import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  displayName: text('display_name').notNull(),
  bio: text('bio').notNull().default(''),
  avatarUrl: text('avatar_url').notNull().default(''),
  website: text('website').notNull().default(''),
  isPrivate: boolean('is_private').notNull().default(false),
  isVerified: boolean('is_verified').notNull().default(false),
  isBanned: boolean('is_banned').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  role: text('role').notNull().default('user'),
  resetToken: text('reset_token'),
  resetTokenExpires: timestamp('reset_token_expires'),
  lastSeenAt: timestamp('last_seen_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const follows = pgTable(
  'follows',
  {
    id: serial('id').primaryKey(),
    followerId: integer('follower_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    followingId: integer('following_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('follows_follower_following_idx').on(
      table.followerId,
      table.followingId
    ),
  ]
);

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  authorId: integer('author_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  mediaUrl: text('media_url').notNull(),
  mediaType: text('media_type').notNull().default('image'),
  aspectRatio: text('aspect_ratio').notNull().default('4:3'),
  caption: text('caption').notNull().default(''),
  hashtags: text('hashtags').notNull().default('[]'),
  location: text('location').notNull().default(''),
  isReel: boolean('is_reel').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const likes = pgTable(
  'likes',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    postId: integer('post_id')
      .references(() => posts.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('likes_user_post_idx').on(table.userId, table.postId)]
);

export const bookmarks = pgTable(
  'bookmarks',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    postId: integer('post_id')
      .references(() => posts.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('bookmarks_user_post_idx').on(table.userId, table.postId),
  ]
);

export const comments = pgTable('comments', {
  id: serial('id').primaryKey(),
  postId: integer('post_id')
    .references(() => posts.id, { onDelete: 'cascade' })
    .notNull(),
  authorId: integer('author_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  parentId: integer('parent_id'),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const stories = pgTable('stories', {
  id: serial('id').primaryKey(),
  authorId: integer('author_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  mediaUrl: text('media_url').notNull(),
  mediaType: text('media_type').notNull().default('image'),
  caption: text('caption').notNull().default(''),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const storyViews = pgTable(
  'story_views',
  {
    id: serial('id').primaryKey(),
    storyId: integer('story_id')
      .references(() => stories.id, { onDelete: 'cascade' })
      .notNull(),
    viewerId: integer('viewer_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    viewedAt: timestamp('viewed_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('story_views_story_viewer_idx').on(table.storyId, table.viewerId),
  ]
);

export const conversations = pgTable('conversations', {
  id: serial('id').primaryKey(),
  participantOneId: integer('participant_one_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  participantTwoId: integer('participant_two_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  conversationId: integer('conversation_id')
    .references(() => conversations.id, { onDelete: 'cascade' })
    .notNull(),
  senderId: integer('sender_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  content: text('content').notNull().default(''),
  mediaUrl: text('media_url').notNull().default(''),
  mediaType: text('media_type').notNull().default('text'),
  isRead: boolean('is_read').notNull().default(false),
  isDeleted: boolean('is_deleted').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  actorId: integer('actor_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  type: text('type').notNull(),
  postId: integer('post_id').references(() => posts.id, { onDelete: 'cascade' }),
  message: text('message').notNull().default(''),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const reports = pgTable('reports', {
  id: serial('id').primaryKey(),
  reporterId: integer('reporter_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  targetType: text('target_type').notNull(),
  targetId: integer('target_id').notNull(),
  reason: text('reason').notNull(),
  status: text('status').notNull().default('pending'),
  resolvedBy: text('resolved_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const aiConfig = pgTable('ai_config', {
  id: serial('id').primaryKey(),
  systemPrompt: text('system_prompt').notNull(),
  personality: text('personality').notNull().default('Editorial & Insightful'),
  tone: text('tone').notNull().default('Concise, warm, and observant'),
  responsePreferences: text('response_preferences')
    .notNull()
    .default('Cite visual details accurately and respect user privacy.'),
  updatedBy: text('updated_by').notNull().default('mili'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
  comments: many(comments),
  likes: many(likes),
  bookmarks: many(bookmarks),
  stories: many(stories),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  author: one(users, {
    fields: [posts.authorId],
    references: [users.id],
  }),
  comments: many(comments),
  likes: many(likes),
  bookmarks: many(bookmarks),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  post: one(posts, {
    fields: [comments.postId],
    references: [posts.id],
  }),
  author: one(users, {
    fields: [comments.authorId],
    references: [users.id],
  }),
}));

export const storiesRelations = relations(stories, ({ one }) => ({
  author: one(users, {
    fields: [stories.authorId],
    references: [users.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id],
  }),
}));
