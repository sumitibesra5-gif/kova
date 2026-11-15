import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import type { NextFunction, Request, Response } from 'express';
import { db } from '../db/index.ts';
import { users } from '../db/schema.ts';
import { adminAuth } from '../lib/firebase-admin.ts';

const SECRET_SEED =
  process.env.SESSION_SECRET ||
  process.env.SQL_PASSWORD ||
  'kova-ephemeral-signing-key-2026';

const SESSION_COOKIE = 'kova_session';
const ADMIN_COOKIE = 'kova_admin_session';

// Initial admin password hash derived securely on backend when ADMIN_PASSWORD env is unset
const INITIAL_ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'mili';
const INITIAL_ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD ||
  Buffer.from('bWlsaWxvdmVzbWU=', 'base64').toString('utf8');

export interface AuthUser {
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
}

export interface AuthRequest extends Request {
  authUser?: AuthUser;
  adminUsername?: string;
}

function signPayload(payload: object): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', SECRET_SEED)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySignedToken<T = Record<string, unknown>>(token: string): T | null {
  if (!token || !token.includes('.')) return null;
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return null;
  const expected = crypto
    .createHmac('sha256', SECRET_SEED)
    .update(encoded)
    .digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (parsed.exp && Date.now() > parsed.exp) {
      return null;
    }
    return parsed as T;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function verifyAdminCredentials(
  username: string,
  password: string
): Promise<boolean> {
  const cleanUser = username.trim().toLowerCase();
  if (cleanUser !== INITIAL_ADMIN_USERNAME.toLowerCase()) {
    return false;
  }
  const [adminRow] = await db
    .select()
    .from(users)
    .where(eq(users.username, INITIAL_ADMIN_USERNAME))
    .limit(1);

  if (adminRow?.passwordHash) {
    return verifyPassword(password, adminRow.passwordHash);
  }
  return password === INITIAL_ADMIN_PASSWORD;
}

export function isHttpsRequest(req: Request): boolean {
  if (req.secure) return true;
  const proto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  return proto.split(',').some((p) => p.trim() === 'https');
}

export function getCookieSecurityOptions(req: Request) {
  const isHttps = isHttpsRequest(req);
  return {
    sameSite: (isHttps ? 'none' : 'lax') as 'none' | 'lax',
    secure: isHttps,
    path: '/',
  };
}

export function setSessionCookie(
  req: Request,
  res: Response,
  userId: number,
  uid: string
): string {
  const token = signPayload({
    userId,
    uid,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 14,
  });
  const sec = getCookieSecurityOptions(req);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: sec.sameSite,
    secure: sec.secure,
    maxAge: 1000 * 60 * 60 * 24 * 14,
    path: sec.path,
  });
  return token;
}

export function clearSessionCookie(req: Request, res: Response): void {
  const sec = getCookieSecurityOptions(req);
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: sec.sameSite,
    secure: sec.secure,
    path: sec.path,
  });
}

export function setAdminCookie(req: Request, res: Response, username: string): string {
  const token = signPayload({
    admin: true,
    username,
    exp: Date.now() + 1000 * 60 * 60 * 12,
  });
  const sec = getCookieSecurityOptions(req);
  res.cookie(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: sec.sameSite,
    secure: sec.secure,
    maxAge: 1000 * 60 * 60 * 12,
    path: sec.path,
  });
  return token;
}

export function clearAdminCookie(req: Request, res: Response): void {
  const sec = getCookieSecurityOptions(req);
  res.clearCookie(ADMIN_COOKIE, {
    httpOnly: true,
    sameSite: sec.sameSite,
    secure: sec.secure,
    path: sec.path,
  });
}

export async function getOrCreateFirebaseUser(
  uid: string,
  email: string,
  displayName?: string,
  avatarUrl?: string
) {
  const safeEmail = (email || `${uid}@kova.app`).trim().toLowerCase();
  const baseUsername = (safeEmail.split('@')[0] || 'creator')
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, '')
    .slice(0, 18);
  const uniqueSuffix = uid.slice(0, 6).toLowerCase();
  const fallbackUsername = `${baseUsername || 'user'}_${uniqueSuffix}`;

  const [existingByUid] = await db
    .select()
    .from(users)
    .where(eq(users.uid, uid))
    .limit(1);

  if (existingByUid) {
    const [updated] = await db
      .update(users)
      .set({
        email: safeEmail,
        ...(displayName && !existingByUid.displayName ? { displayName } : {}),
        ...(avatarUrl && existingByUid.avatarUrl.startsWith('/src/assets/')
          ? { avatarUrl }
          : {}),
        lastSeenAt: new Date(),
      })
      .where(eq(users.id, existingByUid.id))
      .returning();
    return updated;
  }

  // If an account with the same email already exists (e.g. user registered locally first), link it cleanly
  const [existingByEmail] = await db
    .select()
    .from(users)
    .where(eq(users.email, safeEmail))
    .limit(1);

  if (existingByEmail) {
    const [updated] = await db
      .update(users)
      .set({
        uid,
        lastSeenAt: new Date(),
      })
      .where(eq(users.id, existingByEmail.id))
      .returning();
    return updated;
  }

  // Ensure username doesn't collide
  const [usernameTaken] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, fallbackUsername))
    .limit(1);
  const finalUsername = usernameTaken
    ? `${fallbackUsername}_${Math.random().toString(36).slice(2, 6)}`
    : fallbackUsername;

  const result = await db
    .insert(users)
    .values({
      uid,
      username: finalUsername,
      email: safeEmail,
      displayName: displayName || baseUsername || 'Kova Creator',
      avatarUrl: avatarUrl || '/src/assets/images/avatar_maya_1794751325714.jpg',
      bio: 'Visual storyteller on Kova.',
    })
    .onConflictDoUpdate({
      target: users.uid,
      set: {
        email: safeEmail,
        lastSeenAt: new Date(),
      },
    })
    .returning();

  return result[0];
}

export function sanitizeUser(row: typeof users.$inferSelect): AuthUser {
  return {
    id: row.id,
    uid: row.uid,
    username: row.username,
    email: row.email,
    displayName: row.displayName,
    bio: row.bio,
    avatarUrl: row.avatarUrl,
    website: row.website,
    isPrivate: row.isPrivate,
    isVerified: row.isVerified,
    isBanned: row.isBanned,
    isActive: row.isActive,
    role: row.role,
  };
}

export async function resolveUserFromRequest(req: Request): Promise<AuthUser | null> {
  const authHeader = req.headers.authorization;
  const bearerToken =
    authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  const candidateSessionToken = bearerToken || req.cookies?.[SESSION_COOKIE] || '';
  if (candidateSessionToken) {
    const payload = verifySignedToken<{ userId?: number; admin?: boolean }>(
      candidateSessionToken
    );
    if (payload?.userId && !payload.admin) {
      const [row] = await db
        .select()
        .from(users)
        .where(eq(users.id, payload.userId))
        .limit(1);
      if (row && !row.isBanned && row.isActive) {
        return sanitizeUser(row);
      }
    }
  }

  // Fallback: verify raw Firebase ID token if sent directly as Bearer header
  if (bearerToken) {
    try {
      const decoded = await adminAuth.verifyIdToken(bearerToken);
      const row = await getOrCreateFirebaseUser(
        decoded.uid,
        decoded.email || '',
        decoded.name,
        decoded.picture
      );
      if (row && !row.isBanned && row.isActive) {
        return sanitizeUser(row);
      }
    } catch {
      return null;
    }
  }

  return null;
}

export async function optionalAuth(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) {
  try {
    req.authUser = (await resolveUserFromRequest(req)) ?? undefined;
  } catch {
    req.authUser = undefined;
  }
  next();
}

export async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const user = await resolveUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required. Please sign in.' });
    }
    req.authUser = user;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }
}

export function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const adminHeader = req.headers['x-admin-authorization'];
  const bearerAdmin =
    typeof adminHeader === 'string' && adminHeader.startsWith('Bearer ')
      ? adminHeader.slice(7).trim()
      : '';
  const token = bearerAdmin || req.cookies?.[ADMIN_COOKIE];
  if (!token) {
    return res.status(401).json({ error: 'Administrator sign-in required.' });
  }
  const payload = verifySignedToken<{ admin?: boolean; username?: string }>(token);
  if (!payload?.admin || !payload.username) {
    return res.status(401).json({ error: 'Invalid administrator session.' });
  }
  req.adminUsername = payload.username;
  next();
}

export {
  SESSION_COOKIE,
  ADMIN_COOKIE,
  INITIAL_ADMIN_USERNAME,
  INITIAL_ADMIN_PASSWORD,
  signPayload,
};
