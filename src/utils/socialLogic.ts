export interface RegistrationInput {
  username: string;
  email: string;
  password: string;
  displayName: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9._]/g, '');
}

export function extractHashtags(text: string): string[] {
  const matches = text.match(/#([a-zA-Z0-9_]{2,32})/g) || [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of matches) {
    const clean = tag.slice(1).toLowerCase();
    if (!seen.has(clean)) {
      seen.add(clean);
      result.push(clean);
    }
  }
  return result;
}

export function validateRegistration(input: RegistrationInput): ValidationResult {
  const username = input.username.trim();
  if (username.length < 3 || username.length > 24) {
    return { valid: false, error: 'Username must be between 3 and 24 characters.' };
  }
  if (!/^[a-zA-Z0-9._]+$/.test(username)) {
    return {
      valid: false,
      error: 'Username may only contain letters, numbers, periods, and underscores.',
    };
  }
  const email = input.email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { valid: false, error: 'Please enter a valid email address.' };
  }
  if (input.password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters.' };
  }
  if (input.displayName.trim().length < 1 || input.displayName.trim().length > 48) {
    return { valid: false, error: 'Display name must be between 1 and 48 characters.' };
  }
  return { valid: true };
}

export function validatePostInput(input: {
  mediaUrl: string;
  caption: string;
  mediaType: string;
}): ValidationResult {
  if (!input.mediaUrl || !input.mediaUrl.trim()) {
    return { valid: false, error: 'Please upload or select a photo or video.' };
  }
  if (input.mediaType !== 'image' && input.mediaType !== 'video') {
    return { valid: false, error: 'Media type must be image or video.' };
  }
  if (input.caption.length > 2200) {
    return { valid: false, error: 'Caption cannot exceed 2,200 characters.' };
  }
  return { valid: true };
}

export function canViewContent(
  viewerId: number | null,
  author: { id: number; isPrivate: boolean; isBanned: boolean; isActive: boolean },
  followingIds: Set<number>
): boolean {
  if (author.isBanned || !author.isActive) {
    return false;
  }
  if (!author.isPrivate) {
    return true;
  }
  if (viewerId === null) {
    return false;
  }
  if (viewerId === author.id) {
    return true;
  }
  return followingIds.has(author.id);
}

export function isStoryActive(expiresAt: Date | string, now = new Date()): boolean {
  const expiry = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  return expiry.getTime() > now.getTime();
}

export function buildAiSystemInstruction(config: {
  systemPrompt: string;
  personality: string;
  tone: string;
  responsePreferences: string;
}): string {
  return [
    config.systemPrompt.trim(),
    `Personality: ${config.personality.trim()}`,
    `Tone: ${config.tone.trim()}`,
    `Response Preferences: ${config.responsePreferences.trim()}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function formatRelativeTime(dateInput: Date | string, now = new Date()): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const diffSeconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  if (diffSeconds < 60) return 'just now';
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  const diffWeeks = Math.floor(diffDays / 7);
  return `${diffWeeks}w`;
}
