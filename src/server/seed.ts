import { count, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
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
  users,
} from '../db/schema.ts';
import {
  hashPassword,
  INITIAL_ADMIN_PASSWORD,
  INITIAL_ADMIN_USERNAME,
  verifyPassword,
} from './auth.ts';

let seedPromise: Promise<void> | null = null;

export async function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = runSeed().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}

async function runSeed(): Promise<void> {
  const [userCountRow] = await db.select({ value: count() }).from(users);
  const existingCount = Number(userCountRow?.value || 0);

  if (existingCount > 0) {
    // Ensure admin user exists with updated hash if needed
    const [existingAdmin] = await db
      .select()
      .from(users)
      .where(eq(users.username, INITIAL_ADMIN_USERNAME))
      .limit(1);
    if (!existingAdmin) {
      const adminHash = await hashPassword(INITIAL_ADMIN_PASSWORD);
      await db.insert(users).values({
        uid: 'admin_mili',
        username: INITIAL_ADMIN_USERNAME,
        email: 'mili@kova.app',
        passwordHash: adminHash,
        displayName: 'Mili (Platform Admin)',
        bio: 'Platform moderation & AI systems lead.',
        avatarUrl: '/src/assets/images/avatar_elena_1794751326727.jpg',
        isVerified: true,
        role: 'admin',
      });
    } else if (
      !existingAdmin.passwordHash ||
      !(await verifyPassword(INITIAL_ADMIN_PASSWORD, existingAdmin.passwordHash))
    ) {
      const adminHash = await hashPassword(INITIAL_ADMIN_PASSWORD);
      await db
        .update(users)
        .set({ passwordHash: adminHash })
        .where(eq(users.id, existingAdmin.id));
    }
    return;
  }

  const demoPasswordHash = await hashPassword('kova-demo-2026');
  const creatorPasswordHash = await hashPassword('kova-creator-2026');
  const adminPasswordHash = await hashPassword(INITIAL_ADMIN_PASSWORD);

  const insertedUsers = await db
    .insert(users)
    .values([
      {
        uid: 'seed_alex',
        username: 'alex.studio',
        email: 'alex@kova.app',
        passwordHash: demoPasswordHash,
        displayName: 'Alex Mercer',
        bio: 'Creative director & visual archivist. Exploring urban architecture, analog film, and human spaces.',
        avatarUrl: '/src/assets/images/avatar_marcus_1794751327002.jpg',
        website: 'https://kova.app/@alex.studio',
        isVerified: true,
        role: 'user',
      },
      {
        uid: 'seed_maya',
        username: 'maya.arch',
        email: 'maya@kova.app',
        passwordHash: creatorPasswordHash,
        displayName: 'Maya Lin',
        bio: 'Architectural photographer · brutalism, daylight geometry, and quiet courtyards.',
        avatarUrl: '/src/assets/images/avatar_maya_1794751325714.jpg',
        website: 'https://mayalin.studio',
        isVerified: true,
        role: 'user',
      },
      {
        uid: 'seed_kenji',
        username: 'kenji.film',
        email: 'kenji@kova.app',
        passwordHash: creatorPasswordHash,
        displayName: 'Kenji Takahashi',
        bio: 'Tokyo street cinematographer. 35mm nocturnal frames & motion reels.',
        avatarUrl: '/src/assets/images/avatar_kenji_1794751325793.jpg',
        website: 'https://kenjifilm.jp',
        isVerified: true,
        role: 'user',
      },
      {
        uid: 'seed_elena',
        username: 'elena.ceramics',
        email: 'elena@kova.app',
        passwordHash: creatorPasswordHash,
        displayName: 'Elena Rostova',
        bio: 'Stoneware, espresso rituals, and tactile still-life studies.',
        avatarUrl: '/src/assets/images/avatar_elena_1794751326727.jpg',
        website: 'https://elenaceramics.co',
        isVerified: false,
        role: 'user',
      },
      {
        uid: 'admin_mili',
        username: INITIAL_ADMIN_USERNAME,
        email: 'mili@kova.app',
        passwordHash: adminPasswordHash,
        displayName: 'Mili (Admin)',
        bio: 'Platform moderation & AI systems lead.',
        avatarUrl: '/src/assets/images/avatar_elena_1794751326727.jpg',
        isVerified: true,
        role: 'admin',
      },
    ])
    .returning();

  const [alex, maya, kenji, elena] = insertedUsers;

  // Follow relationships
  await db.insert(follows).values([
    { followerId: alex.id, followingId: maya.id },
    { followerId: alex.id, followingId: kenji.id },
    { followerId: maya.id, followingId: alex.id },
    { followerId: maya.id, followingId: kenji.id },
    { followerId: kenji.id, followingId: maya.id },
    { followerId: elena.id, followingId: maya.id },
    { followerId: elena.id, followingId: alex.id },
  ]);

  const now = Date.now();
  const insertedPosts = await db
    .insert(posts)
    .values([
      {
        authorId: kenji.id,
        mediaUrl: '/src/assets/images/post_tokyo_rain_1794751327185.jpg',
        mediaType: 'image',
        aspectRatio: '4:3',
        caption:
          'Rain-slicked backstreets in Shinjuku just after twilight. Warm paper lanterns reflecting on wet asphalt — shot wide open on 35mm.',
        hashtags: JSON.stringify(['tokyo', 'streetphotography', '35mm', 'nightwalk']),
        location: 'Omoide Yokocho, Tokyo',
        isReel: false,
        createdAt: new Date(now - 1000 * 60 * 45),
      },
      {
        authorId: maya.id,
        mediaUrl: '/src/assets/images/post_brutalist_concrete_1794751328169.jpg',
        mediaType: 'image',
        aspectRatio: '4:3',
        caption:
          'Four o’clock geometry across raw board-formed concrete. Waiting 40 minutes for that diagonal shadow line to meet the courtyard edge.',
        hashtags: JSON.stringify(['architecture', 'brutalism', 'minimalism', 'lightandshadow']),
        location: 'Basel Courtyard Pavilion',
        isReel: false,
        createdAt: new Date(now - 1000 * 60 * 140),
      },
      {
        authorId: elena.id,
        mediaUrl: '/src/assets/images/post_analog_espresso_1794751327706.jpg',
        mediaType: 'image',
        aspectRatio: '1:1',
        caption:
          'Morning ritual before loading a fresh roll of Tri-X 400. Hand-thrown black iron glaze cup fresh out of the kiln.',
        hashtags: JSON.stringify(['ceramics', 'analog', 'espresso', 'craft']),
        location: 'Copenhagen Studio',
        isReel: false,
        createdAt: new Date(now - 1000 * 60 * 280),
      },
      {
        authorId: alex.id,
        mediaUrl: '/src/assets/images/post_alpine_ridge_1794751328079.jpg',
        mediaType: 'image',
        aspectRatio: '3:4',
        caption:
          'Blue hour above the inversion layer at 2,840 meters. Silence you can almost feel through the frame.',
        hashtags: JSON.stringify(['alpine', 'landscape', 'bluehour', 'expedition']),
        location: 'Dolomites High Ridge',
        isReel: false,
        createdAt: new Date(now - 1000 * 60 * 420),
      },
      {
        authorId: kenji.id,
        mediaUrl: '/assets/videos/reel_tokyo.mp4',
        mediaType: 'video',
        aspectRatio: '9:16',
        caption:
          'Nocturne motion study — Shinjuku rain reflections and neon vapor in slow push-in.',
        hashtags: JSON.stringify(['reel', 'tokyo', 'cinematography', 'rain']),
        location: 'Shinjuku, Tokyo',
        isReel: true,
        createdAt: new Date(now - 1000 * 60 * 90),
      },
      {
        authorId: alex.id,
        mediaUrl: '/assets/videos/reel_alpine.mp4',
        mediaType: 'video',
        aspectRatio: '9:16',
        caption:
          'First light breaking over the sea of clouds along the Dolomites crest.',
        hashtags: JSON.stringify(['reel', 'mountains', 'bluehour', 'travel']),
        location: 'Seceda Ridge, Italy',
        isReel: true,
        createdAt: new Date(now - 1000 * 60 * 200),
      },
    ])
    .returning();

  const [post1, post2, post3, post4] = insertedPosts;

  // Likes & Bookmarks
  await db.insert(likes).values([
    { userId: alex.id, postId: post1.id },
    { userId: maya.id, postId: post1.id },
    { userId: elena.id, postId: post1.id },
    { userId: alex.id, postId: post2.id },
    { userId: kenji.id, postId: post2.id },
    { userId: maya.id, postId: post3.id },
    { userId: kenji.id, postId: post4.id },
  ]);

  await db.insert(bookmarks).values([
    { userId: alex.id, postId: post2.id },
    { userId: maya.id, postId: post1.id },
  ]);

  // Comments & Replies
  const [c1] = await db
    .insert(comments)
    .values({
      postId: post1.id,
      authorId: maya.id,
      content:
        'The amber reflections off the cobblestones balance the cool mist so well. What aperture were you shooting?',
    })
    .returning();

  await db.insert(comments).values([
    {
      postId: post1.id,
      authorId: kenji.id,
      parentId: c1.id,
      content: 'Thanks Maya! Shot on Summilux 35mm at f/1.4, 1/60s handheld.',
    },
    {
      postId: post2.id,
      authorId: alex.id,
      content: 'That diagonal cut through the concrete volume is textbook patience.',
    },
    {
      postId: post3.id,
      authorId: maya.id,
      content: 'The texture on that glaze looks incredible against the walnut grain.',
    },
  ]);

  // 24h Expiring Stories
  const expires24h = new Date(now + 1000 * 60 * 60 * 22);
  await db.insert(stories).values([
    {
      authorId: maya.id,
      mediaUrl: '/src/assets/images/post_brutalist_concrete_1794751328169.jpg',
      mediaType: 'image',
      caption: 'Golden hour shadows in Basel',
      expiresAt: expires24h,
    },
    {
      authorId: kenji.id,
      mediaUrl: '/src/assets/images/post_tokyo_rain_1794751327185.jpg',
      mediaType: 'image',
      caption: 'Midnight ramen alley after the storm',
      expiresAt: expires24h,
    },
    {
      authorId: elena.id,
      mediaUrl: '/src/assets/images/post_analog_espresso_1794751327706.jpg',
      mediaType: 'image',
      caption: 'Fresh kiln batch + morning pour',
      expiresAt: expires24h,
    },
    {
      authorId: alex.id,
      mediaUrl: '/src/assets/images/post_alpine_ridge_1794751328079.jpg',
      mediaType: 'image',
      caption: 'Camp above the clouds',
      expiresAt: expires24h,
    },
  ]);

  // Seed conversation & messages
  const [convo1] = await db
    .insert(conversations)
    .values({
      participantOneId: alex.id,
      participantTwoId: maya.id,
      updatedAt: new Date(now - 1000 * 60 * 12),
    })
    .returning();

  await db.insert(messages).values([
    {
      conversationId: convo1.id,
      senderId: maya.id,
      content: 'Hey Alex! Are you still heading to the Basel pavilion shoot this weekend?',
      mediaType: 'text',
      isRead: true,
      createdAt: new Date(now - 1000 * 60 * 35),
    },
    {
      conversationId: convo1.id,
      senderId: alex.id,
      content: 'Yes! Packing the 35mm rangefinder and tripod. Let’s meet at 3:30pm for the courtyard light.',
      mediaType: 'text',
      isRead: true,
      createdAt: new Date(now - 1000 * 60 * 12),
    },
  ]);

  // Seed notifications
  await db.insert(notifications).values([
    {
      userId: alex.id,
      actorId: kenji.id,
      type: 'like',
      postId: post4.id,
      message: 'liked your Dolomites High Ridge post.',
      isRead: false,
    },
    {
      userId: alex.id,
      actorId: maya.id,
      type: 'follow',
      message: 'started following you.',
      isRead: false,
    },
  ]);

  // Seed sample report for Admin moderation queue
  await db.insert(reports).values([
    {
      reporterId: elena.id,
      targetType: 'comment',
      targetId: c1.id,
      reason: 'Example moderation item: verify technical lens metadata check.',
      status: 'pending',
    },
  ]);

  // Seed default AI config
  await db.insert(aiConfig).values({
    systemPrompt:
      'You are Kova AI, the intelligent visual and social assistant embedded across Kova. You analyze photography, video reels, captions, and community discussions with precision while keeping responses concise and inspiring.',
    personality: 'Editorial, observant, and creative',
    tone: 'Thoughtful, direct, and grounded in visual details',
    responsePreferences:
      'Identify lighting, composition, objects, and visible text in images/videos accurately. Respect private account boundaries at all times.',
    updatedBy: INITIAL_ADMIN_USERNAME,
  });
}
