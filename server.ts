import 'dotenv/config';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import {
  and,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  or,
} from 'drizzle-orm';
import express from 'express';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { db } from './src/db/index.ts';
import {
  aiConfig,
  bookmarks,
  comments,
  conversations,
  follows,
  likes,
  messages,
  notifications,
  posts,
  reports,
  stories,
  storyViews,
  users,
} from './src/db/schema.ts';
import { adminAuth } from './src/lib/firebase-admin.ts';
import {
  type AuthRequest,
  clearAdminCookie,
  clearSessionCookie,
  getOrCreateFirebaseUser,
  hashPassword,
  optionalAuth,
  requireAdmin,
  requireAuth,
  sanitizeUser,
  setAdminCookie,
  setSessionCookie,
  verifyAdminCredentials,
  verifyPassword,
} from './src/server/auth.ts';
import {
  generateAiAssistantReply,
  getActiveAiConfig,
  runBrowserReadUrl,
  runGroundedWebSearch,
} from './src/server/gemini.ts';
import { ensureSeeded } from './src/server/seed.ts';
import { emitToUser, getOnlineUserIds, initWebSocketServer } from './src/server/ws.ts';
import {
  canViewContent,
  extractHashtags,
  normalizeUsername,
  validatePostInput,
  validateRegistration,
} from './src/utils/socialLogic.ts';

const PORT = Number(process.env.PORT) || 3000;
const uploadsDir = path.resolve(process.cwd(), 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    const safeExt = ext.replace(/[^a-z0-9.]/g, '');
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed =
      file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/');
    cb(null, allowed);
  },
});

async function getFollowingIdSet(userId: number | null): Promise<Set<number>> {
  if (!userId) return new Set();
  const rows = await db
    .select({ followingId: follows.followingId })
    .from(follows)
    .where(eq(follows.followerId, userId));
  return new Set(rows.map((r) => r.followingId));
}

async function hydratePosts(
  postRows: Array<typeof posts.$inferSelect>,
  viewerId: number | null
) {
  if (postRows.length === 0) return [];
  const postIds = postRows.map((p) => p.id);
  const authorIds = Array.from(new Set(postRows.map((p) => p.authorId)));

  const [authorRows, likeRows, bookmarkRows, commentRows, followingSet] =
    await Promise.all([
      db.select().from(users).where(inArray(users.id, authorIds)),
      db.select().from(likes).where(inArray(likes.postId, postIds)),
      db.select().from(bookmarks).where(inArray(bookmarks.postId, postIds)),
      db
        .select()
        .from(comments)
        .where(inArray(comments.postId, postIds))
        .orderBy(comments.createdAt),
      getFollowingIdSet(viewerId),
    ]);

  const commentAuthorIds = Array.from(
    new Set(commentRows.map((c) => c.authorId))
  );
  const commentAuthors =
    commentAuthorIds.length > 0
      ? await db.select().from(users).where(inArray(users.id, commentAuthorIds))
      : [];

  const userMap = new Map<number, typeof users.$inferSelect>();
  for (const u of [...authorRows, ...commentAuthors]) {
    userMap.set(u.id, u);
  }

  return postRows
    .filter((p) => {
      const author = userMap.get(p.authorId);
      if (!author) return false;
      return canViewContent(viewerId, author, followingSet);
    })
    .map((p) => {
      const author = userMap.get(p.authorId)!;
      const postLikes = likeRows.filter((l) => l.postId === p.id);
      const postBookmarks = bookmarkRows.filter((b) => b.postId === p.id);
      const postComments = commentRows
        .filter((c) => c.postId === p.id)
        .map((c) => {
          const cAuthor = userMap.get(c.authorId);
          return {
            id: c.id,
            postId: c.postId,
            parentId: c.parentId,
            content: c.content,
            createdAt: c.createdAt,
            author: cAuthor ? sanitizeUser(cAuthor) : null,
          };
        });

      let parsedTags: string[] = [];
      try {
        parsedTags = JSON.parse(p.hashtags);
      } catch {
        parsedTags = [];
      }

      return {
        id: p.id,
        authorId: p.authorId,
        author: sanitizeUser(author),
        authorFollowedByMe: followingSet.has(author.id),
        mediaUrl: p.mediaUrl,
        mediaType: p.mediaType,
        aspectRatio: p.aspectRatio,
        caption: p.caption,
        hashtags: parsedTags,
        location: p.location,
        isReel: p.isReel,
        createdAt: p.createdAt,
        likesCount: postLikes.length,
        likedByMe: viewerId ? postLikes.some((l) => l.userId === viewerId) : false,
        bookmarkedByMe: viewerId
          ? postBookmarks.some((b) => b.userId === viewerId)
          : false,
        commentsCount: postComments.length,
        comments: postComments,
      };
    });
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '15mb' }));
  app.use(cookieParser());

  // Static directories for generated images, videos, and uploaded user media
  app.use(
    '/src/assets/images',
    express.static(path.resolve(process.cwd(), 'src/assets/images'))
  );
  app.use('/uploads', express.static(uploadsDir));
  app.use(
    '/assets/videos',
    express.static(path.resolve(process.cwd(), 'public/assets/videos'))
  );

  // Lazy seed middleware on /api routes (no eager startup DB probe)
  app.use('/api', async (_req, res, next) => {
    try {
      await ensureSeeded();
      next();
    } catch (error) {
      console.error('Database initialization error:', error);
      res.status(503).json({
        error: 'Database service temporarily unavailable. Please retry.',
      });
    }
  });

  // ── AUTH ROUTES ────────────────────────────────────────────────────────────
  app.get('/api/auth/me', optionalAuth, async (req: AuthRequest, res) => {
    if (!req.authUser) {
      return res.json({ user: null });
    }
    const [followerCountRow, followingCountRow, postCountRow] = await Promise.all([
      db
        .select({ value: count() })
        .from(follows)
        .where(eq(follows.followingId, req.authUser.id)),
      db
        .select({ value: count() })
        .from(follows)
        .where(eq(follows.followerId, req.authUser.id)),
      db
        .select({ value: count() })
        .from(posts)
        .where(eq(posts.authorId, req.authUser.id)),
    ]);

    res.json({
      user: {
        ...req.authUser,
        followersCount: Number(followerCountRow[0]?.value || 0),
        followingCount: Number(followingCountRow[0]?.value || 0),
        postsCount: Number(postCountRow[0]?.value || 0),
      },
    });
  });

  app.post('/api/auth/register', async (req, res) => {
    try {
      const { username, email, password, displayName } = req.body || {};
      const validation = validateRegistration({
        username: String(username || ''),
        email: String(email || ''),
        password: String(password || ''),
        displayName: String(displayName || ''),
      });
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const cleanUsername = normalizeUsername(String(username));
      const cleanEmail = String(email).trim().toLowerCase();

      const existing = await db
        .select()
        .from(users)
        .where(or(eq(users.username, cleanUsername), eq(users.email, cleanEmail)))
        .limit(1);

      if (existing.length > 0) {
        return res
          .status(409)
          .json({ error: 'Username or email is already registered.' });
      }

      const passwordHash = await hashPassword(String(password));
      const uid = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const [created] = await db
        .insert(users)
        .values({
          uid,
          username: cleanUsername,
          email: cleanEmail,
          passwordHash,
          displayName: String(displayName).trim(),
          avatarUrl: '/src/assets/images/avatar_maya_1794751325714.jpg',
          bio: 'Visual creator on Kova.',
        })
        .returning();

      const sessionToken = setSessionCookie(req, res, created.id, created.uid);
      res.status(201).json({ user: sanitizeUser(created), sessionToken });
    } catch (error) {
      console.error('Register error:', error);
      res.status(500).json({ error: 'Unable to create account right now.' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { identifier, password } = req.body || {};
      if (!identifier || !password) {
        return res
          .status(400)
          .json({ error: 'Username or email and password are required.' });
      }
      const clean = String(identifier).trim().replace(/^@/, '').toLowerCase();
      const [user] = await db
        .select()
        .from(users)
        .where(or(eq(users.username, clean), eq(users.email, clean)))
        .limit(1);

      if (!user || !user.passwordHash) {
        return res.status(401).json({ error: 'Invalid credentials.' });
      }
      if (user.isBanned) {
        return res
          .status(403)
          .json({ error: 'This account has been suspended by moderation.' });
      }
      if (!user.isActive) {
        return res.status(403).json({
          error: 'This account was deactivated. Register or contact support.',
        });
      }

      const ok = await verifyPassword(String(password), user.passwordHash);
      if (!ok) {
        return res.status(401).json({ error: 'Invalid credentials.' });
      }

      await db
        .update(users)
        .set({ lastSeenAt: new Date() })
        .where(eq(users.id, user.id));

      const sessionToken = setSessionCookie(req, res, user.id, user.uid);
      res.json({ user: sanitizeUser(user), sessionToken });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Sign-in failed. Please try again.' });
    }
  });

  app.post('/api/auth/firebase', async (req, res) => {
    try {
      const { idToken } = req.body || {};
      if (!idToken) {
        return res.status(400).json({ error: 'Missing Firebase ID token.' });
      }
      const decoded = await adminAuth.verifyIdToken(String(idToken));
      const user = await getOrCreateFirebaseUser(
        decoded.uid,
        decoded.email || '',
        decoded.name,
        decoded.picture
      );
      if (user.isBanned) {
        return res
          .status(403)
          .json({ error: 'This account has been suspended by moderation.' });
      }
      if (!user.isActive) {
        await db
          .update(users)
          .set({ isActive: true })
          .where(eq(users.id, user.id));
      }
      const sessionToken = setSessionCookie(req, res, user.id, user.uid);
      res.json({ user: sanitizeUser(user), sessionToken });
    } catch (error) {
      console.error('Firebase auth error:', error);
      res.status(401).json({ error: 'Google sign-in verification failed.' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  app.post('/api/auth/request-reset', async (req, res) => {
    try {
      const { email } = req.body || {};
      const cleanEmail = String(email || '').trim().toLowerCase();
      if (!cleanEmail) {
        return res.status(400).json({ error: 'Email is required.' });
      }
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, cleanEmail))
        .limit(1);

      if (!user) {
        return res.json({
          message: 'If that email exists, a recovery code has been issued.',
        });
      }

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expires = new Date(Date.now() + 1000 * 60 * 15);
      await db
        .update(users)
        .set({ resetToken: code, resetTokenExpires: expires })
        .where(eq(users.id, user.id));

      res.json({
        message: 'Recovery code generated (valid for 15 minutes).',
        recoveryCodePreview: code,
      });
    } catch (error) {
      console.error('Password reset request error:', error);
      res.status(500).json({ error: 'Unable to process password reset.' });
    }
  });

  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const { email, code, newPassword } = req.body || {};
      if (!email || !code || !newPassword || String(newPassword).length < 8) {
        return res.status(400).json({
          error: 'Email, recovery code, and a new password (8+ chars) are required.',
        });
      }
      const cleanEmail = String(email).trim().toLowerCase();
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, cleanEmail))
        .limit(1);

      if (
        !user ||
        !user.resetToken ||
        user.resetToken !== String(code).trim() ||
        !user.resetTokenExpires ||
        user.resetTokenExpires.getTime() < Date.now()
      ) {
        return res.status(400).json({ error: 'Invalid or expired recovery code.' });
      }

      const passwordHash = await hashPassword(String(newPassword));
      await db
        .update(users)
        .set({
          passwordHash,
          resetToken: null,
          resetTokenExpires: null,
        })
        .where(eq(users.id, user.id));

      res.json({ ok: true, message: 'Password updated. You can now sign in.' });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({ error: 'Unable to reset password.' });
    }
  });

  app.patch('/api/auth/profile', requireAuth, async (req: AuthRequest, res) => {
    try {
      const me = req.authUser!;
      const { displayName, bio, avatarUrl, website, isPrivate, username } =
        req.body || {};

      let nextUsername = me.username;
      if (username && normalizeUsername(String(username)) !== me.username) {
        const candidate = normalizeUsername(String(username));
        if (candidate.length < 3) {
          return res
            .status(400)
            .json({ error: 'Username must be at least 3 characters.' });
        }
        const [taken] = await db
          .select()
          .from(users)
          .where(eq(users.username, candidate))
          .limit(1);
        if (taken && taken.id !== me.id) {
          return res.status(409).json({ error: 'That username is already taken.' });
        }
        nextUsername = candidate;
      }

      const [updated] = await db
        .update(users)
        .set({
          username: nextUsername,
          displayName:
            displayName !== undefined
              ? String(displayName).trim().slice(0, 48) || me.displayName
              : me.displayName,
          bio: bio !== undefined ? String(bio).slice(0, 300) : me.bio,
          avatarUrl:
            avatarUrl !== undefined ? String(avatarUrl) : me.avatarUrl,
          website:
            website !== undefined ? String(website).slice(0, 120) : me.website,
          isPrivate:
            isPrivate !== undefined ? Boolean(isPrivate) : me.isPrivate,
        })
        .where(eq(users.id, me.id))
        .returning();

      res.json({ user: sanitizeUser(updated) });
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({ error: 'Failed to update profile.' });
    }
  });

  app.post('/api/auth/deactivate', requireAuth, async (req: AuthRequest, res) => {
    try {
      await db
        .update(users)
        .set({ isActive: false })
        .where(eq(users.id, req.authUser!.id));
      clearSessionCookie(req, res);
      res.json({ ok: true });
    } catch (error) {
      console.error('Deactivate error:', error);
      res.status(500).json({ error: 'Failed to deactivate account.' });
    }
  });

  app.delete('/api/auth/account', requireAuth, async (req: AuthRequest, res) => {
    try {
      await db.delete(users).where(eq(users.id, req.authUser!.id));
      clearSessionCookie(req, res);
      res.json({ ok: true });
    } catch (error) {
      console.error('Delete account error:', error);
      res.status(500).json({ error: 'Failed to delete account.' });
    }
  });

  // ── UPLOAD ROUTE ───────────────────────────────────────────────────────────
  app.post(
    '/api/upload',
    requireAuth,
    upload.single('file'),
    (req: AuthRequest, res) => {
      if (!req.file) {
        return res
          .status(400)
          .json({ error: 'Please choose a valid image or video file.' });
      }
      const mediaType = req.file.mimetype.startsWith('video/')
        ? 'video'
        : 'image';
      res.status(201).json({
        url: `/uploads/${req.file.filename}`,
        mediaType,
        size: req.file.size,
      });
    }
  );

  // ── POSTS & FEED ROUTES ────────────────────────────────────────────────────
  app.get('/api/posts', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const viewerId = req.authUser?.id ?? null;
      const feed = String(req.query.feed || 'discover');
      const username = req.query.username ? String(req.query.username) : null;
      const hashtag = req.query.hashtag
        ? String(req.query.hashtag).toLowerCase()
        : null;

      let rows: Array<typeof posts.$inferSelect> = [];

      if (username) {
        const [targetUser] = await db
          .select()
          .from(users)
          .where(eq(users.username, username))
          .limit(1);
        if (!targetUser) return res.json({ posts: [] });
        rows = await db
          .select()
          .from(posts)
          .where(eq(posts.authorId, targetUser.id))
          .orderBy(desc(posts.createdAt));
      } else if (feed === 'reels') {
        rows = await db
          .select()
          .from(posts)
          .where(eq(posts.isReel, true))
          .orderBy(desc(posts.createdAt));
      } else if (feed === 'saved' && viewerId) {
        const savedRows = await db
          .select({ postId: bookmarks.postId })
          .from(bookmarks)
          .where(eq(bookmarks.userId, viewerId));
        const savedIds = savedRows.map((s) => s.postId);
        rows =
          savedIds.length > 0
            ? await db
                .select()
                .from(posts)
                .where(inArray(posts.id, savedIds))
                .orderBy(desc(posts.createdAt))
            : [];
      } else if (feed === 'following' && viewerId) {
        const followingSet = await getFollowingIdSet(viewerId);
        followingSet.add(viewerId);
        const ids = Array.from(followingSet);
        rows =
          ids.length > 0
            ? await db
                .select()
                .from(posts)
                .where(inArray(posts.authorId, ids))
                .orderBy(desc(posts.createdAt))
            : [];
      } else {
        rows = await db
          .select()
          .from(posts)
          .orderBy(desc(posts.createdAt))
          .limit(60);
      }

      let hydrated = await hydratePosts(rows, viewerId);
      if (hashtag) {
        hydrated = hydrated.filter((p) => p.hashtags.includes(hashtag));
      }

      res.json({ posts: hydrated });
    } catch (error) {
      console.error('Fetch posts error:', error);
      res.status(500).json({ error: 'Unable to load posts.' });
    }
  });

  app.get('/api/posts/:id', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: 'Invalid post ID.' });
      }
      const [row] = await db
        .select()
        .from(posts)
        .where(eq(posts.id, id))
        .limit(1);
      if (!row) {
        return res.status(404).json({ error: 'Post not found.' });
      }
      const hydrated = await hydratePosts([row], req.authUser?.id ?? null);
      if (hydrated.length === 0) {
        return res
          .status(403)
          .json({ error: 'You do not have permission to view this post.' });
      }
      res.json({ post: hydrated[0] });
    } catch (error) {
      console.error('Get post error:', error);
      res.status(500).json({ error: 'Failed to load post.' });
    }
  });

  app.post('/api/posts', requireAuth, async (req: AuthRequest, res) => {
    try {
      const me = req.authUser!;
      const { mediaUrl, mediaType, aspectRatio, caption, location, isReel } =
        req.body || {};

      const validation = validatePostInput({
        mediaUrl: String(mediaUrl || ''),
        caption: String(caption || ''),
        mediaType: String(mediaType || 'image'),
      });
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const tags = extractHashtags(String(caption || ''));
      const [inserted] = await db
        .insert(posts)
        .values({
          authorId: me.id,
          mediaUrl: String(mediaUrl),
          mediaType: String(mediaType || 'image'),
          aspectRatio: String(aspectRatio || (isReel ? '9:16' : '4:3')),
          caption: String(caption || '').trim(),
          hashtags: JSON.stringify(tags),
          location: String(location || '').trim(),
          isReel: Boolean(isReel) || mediaType === 'video',
        })
        .returning();

      const hydrated = await hydratePosts([inserted], me.id);
      res.status(201).json({ post: hydrated[0] });
    } catch (error) {
      console.error('Create post error:', error);
      res.status(500).json({ error: 'Unable to publish post.' });
    }
  });

  app.delete('/api/posts/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const [post] = await db
        .select()
        .from(posts)
        .where(eq(posts.id, id))
        .limit(1);
      if (!post) return res.status(404).json({ error: 'Post not found.' });
      if (post.authorId !== req.authUser!.id && req.authUser!.role !== 'admin') {
        return res.status(403).json({ error: 'Not authorized to delete this post.' });
      }
      await db.delete(posts).where(eq(posts.id, id));
      res.json({ ok: true });
    } catch (error) {
      console.error('Delete post error:', error);
      res.status(500).json({ error: 'Failed to delete post.' });
    }
  });

  app.post('/api/posts/:id/like', requireAuth, async (req: AuthRequest, res) => {
    try {
      const me = req.authUser!;
      const postId = Number(req.params.id);
      const [post] = await db
        .select()
        .from(posts)
        .where(eq(posts.id, postId))
        .limit(1);
      if (!post) return res.status(404).json({ error: 'Post not found.' });

      const [existing] = await db
        .select()
        .from(likes)
        .where(and(eq(likes.userId, me.id), eq(likes.postId, postId)))
        .limit(1);

      let liked = false;
      if (existing) {
        await db.delete(likes).where(eq(likes.id, existing.id));
      } else {
        await db.insert(likes).values({ userId: me.id, postId });
        liked = true;
        if (post.authorId !== me.id) {
          const [notif] = await db
            .insert(notifications)
            .values({
              userId: post.authorId,
              actorId: me.id,
              type: 'like',
              postId,
              message: 'liked your post.',
            })
            .returning();
          emitToUser(post.authorId, 'notification:new', {
            ...notif,
            actor: me,
          });
        }
      }

      const [countRow] = await db
        .select({ value: count() })
        .from(likes)
        .where(eq(likes.postId, postId));
      res.json({ liked, likesCount: Number(countRow?.value || 0) });
    } catch (error) {
      console.error('Like toggle error:', error);
      res.status(500).json({ error: 'Failed to update like.' });
    }
  });

  app.post(
    '/api/posts/:id/bookmark',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const me = req.authUser!;
        const postId = Number(req.params.id);
        const [existing] = await db
          .select()
          .from(bookmarks)
          .where(and(eq(bookmarks.userId, me.id), eq(bookmarks.postId, postId)))
          .limit(1);

        let bookmarked = false;
        if (existing) {
          await db.delete(bookmarks).where(eq(bookmarks.id, existing.id));
        } else {
          await db.insert(bookmarks).values({ userId: me.id, postId });
          bookmarked = true;
        }
        res.json({ bookmarked });
      } catch (error) {
        console.error('Bookmark toggle error:', error);
        res.status(500).json({ error: 'Failed to update bookmark.' });
      }
    }
  );

  app.post(
    '/api/posts/:id/comments',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const me = req.authUser!;
        const postId = Number(req.params.id);
        const content = String(req.body?.content || '').trim();
        const parentId = req.body?.parentId ? Number(req.body.parentId) : null;

        if (!content) {
          return res.status(400).json({ error: 'Comment cannot be empty.' });
        }

        const [post] = await db
          .select()
          .from(posts)
          .where(eq(posts.id, postId))
          .limit(1);
        if (!post) return res.status(404).json({ error: 'Post not found.' });

        const [created] = await db
          .insert(comments)
          .values({
            postId,
            authorId: me.id,
            parentId,
            content: content.slice(0, 1000),
          })
          .returning();

        if (post.authorId !== me.id) {
          const [notif] = await db
            .insert(notifications)
            .values({
              userId: post.authorId,
              actorId: me.id,
              type: 'comment',
              postId,
              message: `commented: "${content.slice(0, 60)}"`,
            })
            .returning();
          emitToUser(post.authorId, 'notification:new', {
            ...notif,
            actor: me,
          });
        }

        res.status(201).json({
          comment: {
            id: created.id,
            postId: created.postId,
            parentId: created.parentId,
            content: created.content,
            createdAt: created.createdAt,
            author: me,
          },
        });
      } catch (error) {
        console.error('Comment error:', error);
        res.status(500).json({ error: 'Failed to post comment.' });
      }
    }
  );

  app.delete('/api/comments/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const [c] = await db
        .select()
        .from(comments)
        .where(eq(comments.id, id))
        .limit(1);
      if (!c) return res.status(404).json({ error: 'Comment not found.' });
      if (c.authorId !== req.authUser!.id && req.authUser!.role !== 'admin') {
        return res.status(403).json({ error: 'Not authorized.' });
      }
      await db.delete(comments).where(eq(comments.id, id));
      res.json({ ok: true });
    } catch (error) {
      console.error('Delete comment error:', error);
      res.status(500).json({ error: 'Failed to delete comment.' });
    }
  });

  // ── STORIES ROUTES (24H EXPIRATION) ────────────────────────────────────────
  app.get('/api/stories', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const viewerId = req.authUser?.id ?? null;
      const now = new Date();
      const activeStories = await db
        .select()
        .from(stories)
        .where(gt(stories.expiresAt, now))
        .orderBy(desc(stories.createdAt));

      if (activeStories.length === 0) return res.json({ stories: [] });

      const authorIds = Array.from(new Set(activeStories.map((s) => s.authorId)));
      const [authorRows, followingSet, viewsRows] = await Promise.all([
        db.select().from(users).where(inArray(users.id, authorIds)),
        getFollowingIdSet(viewerId),
        viewerId
          ? db
              .select()
              .from(storyViews)
              .where(eq(storyViews.viewerId, viewerId))
          : Promise.resolve([]),
      ]);

      const authorMap = new Map(authorRows.map((a) => [a.id, a]));
      const viewedIds = new Set(viewsRows.map((v) => v.storyId));

      const result = activeStories
        .filter((s) => {
          const a = authorMap.get(s.authorId);
          return a ? canViewContent(viewerId, a, followingSet) : false;
        })
        .map((s) => ({
          id: s.id,
          mediaUrl: s.mediaUrl,
          mediaType: s.mediaType,
          caption: s.caption,
          expiresAt: s.expiresAt,
          createdAt: s.createdAt,
          viewedByMe: viewedIds.has(s.id),
          author: sanitizeUser(authorMap.get(s.authorId)!),
        }));

      res.json({ stories: result });
    } catch (error) {
      console.error('Stories error:', error);
      res.status(500).json({ error: 'Failed to load stories.' });
    }
  });

  app.post('/api/stories', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { mediaUrl, mediaType, caption } = req.body || {};
      if (!mediaUrl) {
        return res.status(400).json({ error: 'Story media is required.' });
      }
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const [created] = await db
        .insert(stories)
        .values({
          authorId: req.authUser!.id,
          mediaUrl: String(mediaUrl),
          mediaType: String(mediaType || 'image'),
          caption: String(caption || '').slice(0, 240),
          expiresAt,
        })
        .returning();

      res.status(201).json({
        story: {
          ...created,
          viewedByMe: false,
          author: req.authUser!,
        },
      });
    } catch (error) {
      console.error('Create story error:', error);
      res.status(500).json({ error: 'Failed to publish story.' });
    }
  });

  app.post('/api/stories/:id/view', requireAuth, async (req: AuthRequest, res) => {
    try {
      const storyId = Number(req.params.id);
      await db
        .insert(storyViews)
        .values({ storyId, viewerId: req.authUser!.id })
        .onConflictDoNothing();
      res.json({ ok: true });
    } catch {
      res.json({ ok: true });
    }
  });

  // ── USERS & FOLLOWS ────────────────────────────────────────────────────────
  app.get('/api/users', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const viewerId = req.authUser?.id ?? null;
      const allUsers = await db
        .select()
        .from(users)
        .where(and(eq(users.isActive, true), eq(users.isBanned, false)));

      const [followRows, followingSet] = await Promise.all([
        db.select().from(follows),
        getFollowingIdSet(viewerId),
      ]);
      const onlineIds = new Set(getOnlineUserIds());

      const list = allUsers
        .filter((u) => u.role !== 'admin')
        .map((u) => ({
          ...sanitizeUser(u),
          followersCount: followRows.filter((f) => f.followingId === u.id).length,
          followingCount: followRows.filter((f) => f.followerId === u.id).length,
          isFollowedByMe: followingSet.has(u.id),
          isOnline: onlineIds.has(u.id),
        }));

      res.json({ users: list });
    } catch (error) {
      console.error('List users error:', error);
      res.status(500).json({ error: 'Unable to load creators.' });
    }
  });

  app.get('/api/users/:username', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const viewerId = req.authUser?.id ?? null;
      const username = String(req.params.username).toLowerCase();
      const [target] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (!target || target.isBanned || !target.isActive) {
        return res.status(404).json({ error: 'Profile not found.' });
      }

      const [followerRows, followingRows, followingSet, userPosts] =
        await Promise.all([
          db.select().from(follows).where(eq(follows.followingId, target.id)),
          db.select().from(follows).where(eq(follows.followerId, target.id)),
          getFollowingIdSet(viewerId),
          db
            .select()
            .from(posts)
            .where(eq(posts.authorId, target.id))
            .orderBy(desc(posts.createdAt)),
        ]);

      const allowed = canViewContent(viewerId, target, followingSet);
      const hydratedPosts = allowed ? await hydratePosts(userPosts, viewerId) : [];

      res.json({
        profile: {
          ...sanitizeUser(target),
          followersCount: followerRows.length,
          followingCount: followingRows.length,
          postsCount: userPosts.length,
          isFollowedByMe: followingSet.has(target.id),
          canViewPosts: allowed,
        },
        posts: hydratedPosts,
      });
    } catch (error) {
      console.error('Profile error:', error);
      res.status(500).json({ error: 'Failed to load profile.' });
    }
  });

  app.post('/api/users/:id/follow', requireAuth, async (req: AuthRequest, res) => {
    try {
      const me = req.authUser!;
      const targetId = Number(req.params.id);
      if (targetId === me.id) {
        return res.status(400).json({ error: 'You cannot follow yourself.' });
      }

      const [existing] = await db
        .select()
        .from(follows)
        .where(
          and(eq(follows.followerId, me.id), eq(follows.followingId, targetId))
        )
        .limit(1);

      let following = false;
      if (existing) {
        await db.delete(follows).where(eq(follows.id, existing.id));
      } else {
        await db
          .insert(follows)
          .values({ followerId: me.id, followingId: targetId });
        following = true;

        const [notif] = await db
          .insert(notifications)
          .values({
            userId: targetId,
            actorId: me.id,
            type: 'follow',
            message: 'started following you.',
          })
          .returning();
        emitToUser(targetId, 'notification:new', { ...notif, actor: me });
      }

      const [countRow] = await db
        .select({ value: count() })
        .from(follows)
        .where(eq(follows.followingId, targetId));

      res.json({ following, followersCount: Number(countRow?.value || 0) });
    } catch (error) {
      console.error('Follow error:', error);
      res.status(500).json({ error: 'Failed to update follow status.' });
    }
  });

  // ── PLATFORM SEARCH (USERS, HASHTAGS, POSTS) ───────────────────────────────
  app.get('/api/search', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const q = String(req.query.q || '').trim();
      const viewerId = req.authUser?.id ?? null;
      if (!q) {
        return res.json({ users: [], posts: [], hashtags: [] });
      }
      const cleanQ = q.replace(/^#/, '');

      const [matchedUsers, matchedPosts] = await Promise.all([
        db
          .select()
          .from(users)
          .where(
            and(
              eq(users.isActive, true),
              eq(users.isBanned, false),
              or(
                ilike(users.username, `%${cleanQ}%`),
                ilike(users.displayName, `%${cleanQ}%`)
              )
            )
          )
          .limit(12),
        db
          .select()
          .from(posts)
          .where(
            or(
              ilike(posts.caption, `%${cleanQ}%`),
              ilike(posts.hashtags, `%${cleanQ}%`),
              ilike(posts.location, `%${cleanQ}%`)
            )
          )
          .orderBy(desc(posts.createdAt))
          .limit(24),
      ]);

      const hydratedPosts = await hydratePosts(matchedPosts, viewerId);
      const tagMap = new Map<string, number>();
      for (const p of hydratedPosts) {
        for (const tag of p.hashtags) {
          if (tag.includes(cleanQ.toLowerCase())) {
            tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
          }
        }
      }

      res.json({
        users: matchedUsers
          .filter((u) => u.role !== 'admin')
          .map((u) => sanitizeUser(u)),
        posts: hydratedPosts,
        hashtags: Array.from(tagMap.entries()).map(([tag, count]) => ({
          tag,
          count,
        })),
      });
    } catch (error) {
      console.error('Search error:', error);
      res.status(500).json({ error: 'Platform search failed.' });
    }
  });

  // ── NOTIFICATIONS ──────────────────────────────────────────────────────────
  app.get('/api/notifications', requireAuth, async (req: AuthRequest, res) => {
    try {
      const rows = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, req.authUser!.id))
        .orderBy(desc(notifications.createdAt))
        .limit(40);

      const actorIds = Array.from(new Set(rows.map((r) => r.actorId)));
      const actors =
        actorIds.length > 0
          ? await db.select().from(users).where(inArray(users.id, actorIds))
          : [];
      const actorMap = new Map(actors.map((a) => [a.id, sanitizeUser(a)]));

      res.json({
        notifications: rows.map((r) => ({
          ...r,
          actor: actorMap.get(r.actorId) || null,
        })),
      });
    } catch (error) {
      console.error('Notifications error:', error);
      res.status(500).json({ error: 'Failed to load notifications.' });
    }
  });

  app.post(
    '/api/notifications/read',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        await db
          .update(notifications)
          .set({ isRead: true })
          .where(eq(notifications.userId, req.authUser!.id));
        res.json({ ok: true });
      } catch {
        res.status(500).json({ error: 'Failed to mark notifications read.' });
      }
    }
  );

  // ── MESSAGING ROUTES ───────────────────────────────────────────────────────
  app.get('/api/conversations', requireAuth, async (req: AuthRequest, res) => {
    try {
      const me = req.authUser!;
      const convos = await db
        .select()
        .from(conversations)
        .where(
          or(
            eq(conversations.participantOneId, me.id),
            eq(conversations.participantTwoId, me.id)
          )
        )
        .orderBy(desc(conversations.updatedAt));

      if (convos.length === 0) return res.json({ conversations: [] });

      const otherIds = convos.map((c) =>
        c.participantOneId === me.id ? c.participantTwoId : c.participantOneId
      );
      const convoIds = convos.map((c) => c.id);

      const [otherUsers, allMsgs] = await Promise.all([
        db.select().from(users).where(inArray(users.id, otherIds)),
        db
          .select()
          .from(messages)
          .where(inArray(messages.conversationId, convoIds))
          .orderBy(desc(messages.createdAt)),
      ]);

      const userMap = new Map(otherUsers.map((u) => [u.id, sanitizeUser(u)]));
      const onlineSet = new Set(getOnlineUserIds());

      const list = convos.map((c) => {
        const otherId =
          c.participantOneId === me.id ? c.participantTwoId : c.participantOneId;
        const convoMsgs = allMsgs.filter(
          (m) => m.conversationId === c.id && !m.isDeleted
        );
        const lastMessage = convoMsgs[0] || null;
        const unreadCount = convoMsgs.filter(
          (m) => m.senderId !== me.id && !m.isRead
        ).length;

        return {
          id: c.id,
          updatedAt: c.updatedAt,
          otherUser: userMap.get(otherId) || null,
          isOnline: onlineSet.has(otherId),
          lastMessage: lastMessage
            ? {
                content: lastMessage.content,
                mediaType: lastMessage.mediaType,
                createdAt: lastMessage.createdAt,
                senderId: lastMessage.senderId,
              }
            : null,
          unreadCount,
        };
      });

      res.json({ conversations: list });
    } catch (error) {
      console.error('List conversations error:', error);
      res.status(500).json({ error: 'Failed to load conversations.' });
    }
  });

  app.post('/api/conversations', requireAuth, async (req: AuthRequest, res) => {
    try {
      const me = req.authUser!;
      const targetUserId = Number(req.body?.targetUserId);
      if (!targetUserId || targetUserId === me.id) {
        return res.status(400).json({ error: 'Valid recipient is required.' });
      }

      const [existing] = await db
        .select()
        .from(conversations)
        .where(
          or(
            and(
              eq(conversations.participantOneId, me.id),
              eq(conversations.participantTwoId, targetUserId)
            ),
            and(
              eq(conversations.participantOneId, targetUserId),
              eq(conversations.participantTwoId, me.id)
            )
          )
        )
        .limit(1);

      if (existing) {
        return res.json({ conversationId: existing.id });
      }

      const [created] = await db
        .insert(conversations)
        .values({
          participantOneId: me.id,
          participantTwoId: targetUserId,
        })
        .returning();

      res.status(201).json({ conversationId: created.id });
    } catch (error) {
      console.error('Create conversation error:', error);
      res.status(500).json({ error: 'Unable to start conversation.' });
    }
  });

  app.get(
    '/api/conversations/:id/messages',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const me = req.authUser!;
        const convoId = Number(req.params.id);
        const [convo] = await db
          .select()
          .from(conversations)
          .where(eq(conversations.id, convoId))
          .limit(1);

        if (
          !convo ||
          (convo.participantOneId !== me.id && convo.participantTwoId !== me.id)
        ) {
          return res.status(403).json({ error: 'Access denied.' });
        }

        // Mark incoming unread messages as read
        await db
          .update(messages)
          .set({ isRead: true })
          .where(
            and(
              eq(messages.conversationId, convoId),
              eq(messages.isRead, false),
              eq(
                messages.senderId,
                convo.participantOneId === me.id
                  ? convo.participantTwoId
                  : convo.participantOneId
              )
            )
          );

        const rows = await db
          .select()
          .from(messages)
          .where(
            and(eq(messages.conversationId, convoId), eq(messages.isDeleted, false))
          )
          .orderBy(messages.createdAt);

        res.json({ messages: rows });
      } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: 'Failed to load messages.' });
      }
    }
  );

  app.post(
    '/api/conversations/:id/messages',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const me = req.authUser!;
        const convoId = Number(req.params.id);
        const content = String(req.body?.content || '').trim();
        const mediaUrl = String(req.body?.mediaUrl || '').trim();
        const mediaType = String(req.body?.mediaType || (mediaUrl ? 'image' : 'text'));

        if (!content && !mediaUrl) {
          return res.status(400).json({ error: 'Message cannot be empty.' });
        }

        const [convo] = await db
          .select()
          .from(conversations)
          .where(eq(conversations.id, convoId))
          .limit(1);

        if (
          !convo ||
          (convo.participantOneId !== me.id && convo.participantTwoId !== me.id)
        ) {
          return res.status(403).json({ error: 'Access denied.' });
        }

        const recipientId =
          convo.participantOneId === me.id
            ? convo.participantTwoId
            : convo.participantOneId;

        const [created] = await db
          .insert(messages)
          .values({
            conversationId: convoId,
            senderId: me.id,
            content,
            mediaUrl,
            mediaType,
          })
          .returning();

        await db
          .update(conversations)
          .set({ updatedAt: new Date() })
          .where(eq(conversations.id, convoId));

        // Emit real-time WebSocket message to recipient & sender's other tabs
        emitToUser(recipientId, 'message:new', created);
        emitToUser(me.id, 'message:new', created);

        const [notif] = await db
          .insert(notifications)
          .values({
            userId: recipientId,
            actorId: me.id,
            type: 'message',
            message: content ? `sent a message: "${content.slice(0, 50)}"` : 'sent you media.',
          })
          .returning();
        emitToUser(recipientId, 'notification:new', { ...notif, actor: me });

        res.status(201).json({ message: created });
      } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: 'Failed to send message.' });
      }
    }
  );

  app.delete('/api/messages/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const me = req.authUser!;
      const msgId = Number(req.params.id);
      const [msg] = await db
        .select()
        .from(messages)
        .where(eq(messages.id, msgId))
        .limit(1);
      if (!msg) return res.status(404).json({ error: 'Message not found.' });
      if (msg.senderId !== me.id) {
        return res.status(403).json({ error: 'You can only delete your own messages.' });
      }

      await db
        .update(messages)
        .set({ isDeleted: true })
        .where(eq(messages.id, msgId));

      const [convo] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, msg.conversationId))
        .limit(1);
      if (convo) {
        const otherId =
          convo.participantOneId === me.id
            ? convo.participantTwoId
            : convo.participantOneId;
        emitToUser(otherId, 'message:deleted', {
          messageId: msgId,
          conversationId: convo.id,
        });
      }

      res.json({ ok: true });
    } catch (error) {
      console.error('Delete message error:', error);
      res.status(500).json({ error: 'Failed to delete message.' });
    }
  });

  app.delete(
    '/api/conversations/:id',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const me = req.authUser!;
        const convoId = Number(req.params.id);
        const [convo] = await db
          .select()
          .from(conversations)
          .where(eq(conversations.id, convoId))
          .limit(1);
        if (
          !convo ||
          (convo.participantOneId !== me.id && convo.participantTwoId !== me.id)
        ) {
          return res.status(403).json({ error: 'Access denied.' });
        }
        await db.delete(conversations).where(eq(conversations.id, convoId));
        res.json({ ok: true });
      } catch (error) {
        console.error('Delete conversation error:', error);
        res.status(500).json({ error: 'Failed to delete conversation.' });
      }
    }
  );

  // ── REPORTS ────────────────────────────────────────────────────────────────
  app.post('/api/reports', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { targetType, targetId, reason } = req.body || {};
      if (!targetType || !targetId || !reason) {
        return res
          .status(400)
          .json({ error: 'Target type, ID, and reason are required.' });
      }
      const [created] = await db
        .insert(reports)
        .values({
          reporterId: req.authUser!.id,
          targetType: String(targetType),
          targetId: Number(targetId),
          reason: String(reason).slice(0, 500),
        })
        .returning();
      res.status(201).json({ report: created });
    } catch (error) {
      console.error('Create report error:', error);
      res.status(500).json({ error: 'Failed to submit report.' });
    }
  });

  // ── INTEGRATED AI ASSISTANT & CONTENT UNDERSTANDING ────────────────────────
  app.post('/api/ai/chat', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const viewerId = req.authUser?.id ?? null;
      const { prompt, history, postId, inlineMedia } = req.body || {};
      if (!prompt || !String(prompt).trim()) {
        return res.status(400).json({ error: 'Please enter a question or prompt.' });
      }

      let postContext:
        | {
            id: number;
            authorUsername: string;
            authorDisplayName: string;
            caption: string;
            location: string;
            hashtags: string[];
            mediaType: string;
            comments: Array<{ username: string; content: string }>;
          }
        | undefined;
      let mediaUrl: string | undefined;

      if (postId) {
        const [postRow] = await db
          .select()
          .from(posts)
          .where(eq(posts.id, Number(postId)))
          .limit(1);
        if (!postRow) {
          return res.status(404).json({ error: 'Referenced post not found.' });
        }
        const [authorRow] = await db
          .select()
          .from(users)
          .where(eq(users.id, postRow.authorId))
          .limit(1);
        const followingSet = await getFollowingIdSet(viewerId);
        if (!authorRow || !canViewContent(viewerId, authorRow, followingSet)) {
          return res.status(403).json({
            error:
              'Privacy guard: you do not have permission to analyze content from this private account.',
          });
        }

        const hydrated = await hydratePosts([postRow], viewerId);
        if (hydrated[0]) {
          const p = hydrated[0];
          mediaUrl = p.mediaUrl;
          postContext = {
            id: p.id,
            authorUsername: p.author.username,
            authorDisplayName: p.author.displayName,
            caption: p.caption,
            location: p.location,
            hashtags: p.hashtags,
            mediaType: p.mediaType,
            comments: p.comments.map((c) => ({
              username: c.author?.username || 'user',
              content: c.content,
            })),
          };
        }
      }

      const result = await generateAiAssistantReply({
        prompt: String(prompt),
        history: Array.isArray(history) ? history : [],
        mediaUrl,
        inlineMedia,
        postContext,
      });

      res.json(result);
    } catch (error: any) {
      console.error('AI chat error:', error);
      res.status(500).json({
        error:
          error?.message ||
          'AI Assistant encountered an error. Please verify your API configuration and try again.',
      });
    }
  });

  // ── BUILT-IN AI BROWSER / REAL WEB SEARCH ENGINE ───────────────────────────
  app.post('/api/browser/search', async (req, res) => {
    try {
      const { query, mode, history } = req.body || {};
      if (!query || !String(query).trim()) {
        return res.status(400).json({ error: 'Search query is required.' });
      }
      const validMode =
        mode === 'images' || mode === 'videos' || mode === 'news' ? mode : 'web';
      const result = await runGroundedWebSearch({
        query: String(query).trim(),
        mode: validMode,
        history: Array.isArray(history) ? history : [],
      });
      res.json(result);
    } catch (error: any) {
      console.error('Browser search error:', error);
      res.status(500).json({
        error: error?.message || 'Web search failed. Please retry in a moment.',
      });
    }
  });

  app.post('/api/browser/read-url', async (req, res) => {
    try {
      const { url } = req.body || {};
      if (!url || !/^https?:\/\//i.test(String(url))) {
        return res.status(400).json({ error: 'Valid http/https URL required.' });
      }
      const result = await runBrowserReadUrl(String(url));
      res.json(result);
    } catch (error) {
      console.error('Read URL error:', error);
      res.status(500).json({ error: 'Unable to summarize that page.' });
    }
  });

  // ── ADMIN DASHBOARD ROUTES (mili) ──────────────────────────────────────────
  app.get('/api/admin/me', (req: AuthRequest, res) => {
    requireAdmin(req, res, () => {
      res.json({ admin: { username: req.adminUsername } });
    });
  });

  app.post('/api/admin/login', async (req, res) => {
    try {
      const { username, password } = req.body || {};
      if (!username || !password) {
        return res
          .status(400)
          .json({ error: 'Admin username and password are required.' });
      }
      const ok = await verifyAdminCredentials(String(username), String(password));
      if (!ok) {
        return res.status(401).json({ error: 'Invalid administrator credentials.' });
      }
      const adminUser = String(username).trim().toLowerCase();
      const adminToken = setAdminCookie(req, res, adminUser);
      res.json({ admin: { username: adminUser }, adminToken });
    } catch (error) {
      console.error('Admin login error:', error);
      res.status(500).json({ error: 'Administrator login failed.' });
    }
  });

  app.post('/api/admin/logout', (req, res) => {
    clearAdminCookie(req, res);
    res.json({ ok: true });
  });

  app.get('/api/admin/stats', requireAdmin, async (_req, res) => {
    try {
      const [uCount, pCount, mCount, rPending, bannedCount] = await Promise.all([
        db.select({ value: count() }).from(users),
        db.select({ value: count() }).from(posts),
        db.select({ value: count() }).from(messages),
        db
          .select({ value: count() })
          .from(reports)
          .where(eq(reports.status, 'pending')),
        db
          .select({ value: count() })
          .from(users)
          .where(eq(users.isBanned, true)),
      ]);
      res.json({
        stats: {
          totalUsers: Number(uCount[0]?.value || 0),
          totalPosts: Number(pCount[0]?.value || 0),
          totalMessages: Number(mCount[0]?.value || 0),
          pendingReports: Number(rPending[0]?.value || 0),
          bannedUsers: Number(bannedCount[0]?.value || 0),
          onlineNow: getOnlineUserIds().length,
        },
      });
    } catch (error) {
      console.error('Admin stats error:', error);
      res.status(500).json({ error: 'Failed to load stats.' });
    }
  });

  app.get('/api/admin/users', requireAdmin, async (_req, res) => {
    try {
      const all = await db.select().from(users).orderBy(desc(users.createdAt));
      res.json({ users: all.map((u) => sanitizeUser(u)) });
    } catch {
      res.status(500).json({ error: 'Failed to load users.' });
    }
  });

  app.post('/api/admin/users/:id/ban', requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const [target] = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      if (!target) return res.status(404).json({ error: 'User not found.' });
      if (target.role === 'admin') {
        return res.status(400).json({ error: 'Cannot ban administrator.' });
      }
      const nextBanned = !target.isBanned;
      const [updated] = await db
        .update(users)
        .set({ isBanned: nextBanned })
        .where(eq(users.id, id))
        .returning();
      res.json({ user: sanitizeUser(updated) });
    } catch {
      res.status(500).json({ error: 'Failed to update user status.' });
    }
  });

  app.get('/api/admin/reports', requireAdmin, async (_req, res) => {
    try {
      const rows = await db
        .select()
        .from(reports)
        .orderBy(desc(reports.createdAt));

      const reporterIds = Array.from(new Set(rows.map((r) => r.reporterId)));
      const reporters =
        reporterIds.length > 0
          ? await db.select().from(users).where(inArray(users.id, reporterIds))
          : [];
      const repMap = new Map(reporters.map((u) => [u.id, sanitizeUser(u)]));

      const postIds = rows
        .filter((r) => r.targetType === 'post')
        .map((r) => r.targetId);
      const commentIds = rows
        .filter((r) => r.targetType === 'comment')
        .map((r) => r.targetId);

      const [postTargets, commentTargets] = await Promise.all([
        postIds.length > 0
          ? db.select().from(posts).where(inArray(posts.id, postIds))
          : Promise.resolve([]),
        commentIds.length > 0
          ? db.select().from(comments).where(inArray(comments.id, commentIds))
          : Promise.resolve([]),
      ]);

      const postMap = new Map(postTargets.map((p) => [p.id, p]));
      const commentMap = new Map(commentTargets.map((c) => [c.id, c]));

      res.json({
        reports: rows.map((r) => ({
          ...r,
          reporter: repMap.get(r.reporterId) || null,
          targetPreview:
            r.targetType === 'post'
              ? postMap.get(r.targetId)?.caption || '[Post removed]'
              : r.targetType === 'comment'
              ? commentMap.get(r.targetId)?.content || '[Comment removed]'
              : `User #${r.targetId}`,
        })),
      });
    } catch {
      res.status(500).json({ error: 'Failed to load moderation reports.' });
    }
  });

  app.post(
    '/api/admin/reports/:id/resolve',
    requireAdmin,
    async (req: AuthRequest, res) => {
      try {
        const id = Number(req.params.id);
        const action = String(req.body?.action || 'dismiss');
        const [report] = await db
          .select()
          .from(reports)
          .where(eq(reports.id, id))
          .limit(1);
        if (!report) return res.status(404).json({ error: 'Report not found.' });

        if (action === 'remove_target') {
          if (report.targetType === 'post') {
            await db.delete(posts).where(eq(posts.id, report.targetId));
          } else if (report.targetType === 'comment') {
            await db.delete(comments).where(eq(comments.id, report.targetId));
          }
        }

        const [updated] = await db
          .update(reports)
          .set({
            status: action === 'dismiss' ? 'dismissed' : 'resolved',
            resolvedBy: req.adminUsername || 'mili',
          })
          .where(eq(reports.id, id))
          .returning();

        res.json({ report: updated });
      } catch {
        res.status(500).json({ error: 'Failed to resolve report.' });
      }
    }
  );

  app.delete('/api/admin/posts/:id', requireAdmin, async (req, res) => {
    try {
      await db.delete(posts).where(eq(posts.id, Number(req.params.id)));
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Failed to remove post.' });
    }
  });

  app.delete('/api/admin/comments/:id', requireAdmin, async (req, res) => {
    try {
      await db.delete(comments).where(eq(comments.id, Number(req.params.id)));
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Failed to remove comment.' });
    }
  });

  app.get('/api/admin/ai-config', requireAdmin, async (_req, res) => {
    try {
      const config = await getActiveAiConfig();
      res.json({ config });
    } catch {
      res.status(500).json({ error: 'Failed to load AI configuration.' });
    }
  });

  app.put('/api/admin/ai-config', requireAdmin, async (req: AuthRequest, res) => {
    try {
      const { systemPrompt, personality, tone, responsePreferences } =
        req.body || {};
      if (!systemPrompt || !String(systemPrompt).trim()) {
        return res.status(400).json({ error: 'System prompt is required.' });
      }
      const [created] = await db
        .insert(aiConfig)
        .values({
          systemPrompt: String(systemPrompt).trim(),
          personality: String(personality || 'Editorial & Insightful').trim(),
          tone: String(tone || 'Concise, warm, and observant').trim(),
          responsePreferences: String(
            responsePreferences ||
              'Cite visual details accurately and respect user privacy.'
          ).trim(),
          updatedBy: req.adminUsername || 'mili',
        })
        .returning();

      res.json({ config: created });
    } catch {
      res.status(500).json({ error: 'Failed to save AI configuration.' });
    }
  });

  app.post('/api/admin/ai-preview', requireAdmin, async (req, res) => {
    try {
      const {
        testPrompt,
        systemPrompt,
        personality,
        tone,
        responsePreferences,
      } = req.body || {};
      if (!testPrompt || !systemPrompt) {
        return res
          .status(400)
          .json({ error: 'Test prompt and system prompt are required.' });
      }
      const result = await generateAiAssistantReply({
        prompt: String(testPrompt),
        customConfigOverride: {
          systemPrompt: String(systemPrompt),
          personality: String(personality || ''),
          tone: String(tone || ''),
          responsePreferences: String(responsePreferences || ''),
        },
      });
      res.json(result);
    } catch (error) {
      console.error('AI preview error:', error);
      res.status(500).json({ error: 'AI preview failed.' });
    }
  });

  // ── VITE / PRODUCTION STATIC SERVING ───────────────────────────────────────
  const server = http.createServer(app);
  initWebSocketServer(server);

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Kova server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
