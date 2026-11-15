import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAiSystemInstruction,
  canViewContent,
  extractHashtags,
  formatRelativeTime,
  isStoryActive,
  normalizeUsername,
  validatePostInput,
  validateRegistration,
} from './socialLogic';

test('extractHashtags deduplicates and lowercases valid tags', () => {
  const tags = extractHashtags(
    'Rainy evening in #Tokyo #StreetPhotography #tokyo #35mm_film #a'
  );
  assert.deepEqual(tags, ['tokyo', 'streetphotography', '35mm_film']);
});

test('normalizeUsername strips invalid characters and lowercases', () => {
  assert.equal(normalizeUsername(' Maya.Arch! '), 'maya.arch');
});

test('validateRegistration enforces username, email, password, and displayName', () => {
  assert.equal(
    validateRegistration({
      username: 'ab',
      email: 'a@b.com',
      password: 'password123',
      displayName: 'Test',
    }).valid,
    false
  );
  assert.equal(
    validateRegistration({
      username: 'valid_user',
      email: 'bad-email',
      password: 'password123',
      displayName: 'Test',
    }).valid,
    false
  );
  assert.equal(
    validateRegistration({
      username: 'valid_user',
      email: 'valid@kova.app',
      password: 'short',
      displayName: 'Test',
    }).valid,
    false
  );
  assert.equal(
    validateRegistration({
      username: 'valid_user.1',
      email: 'valid@kova.app',
      password: 'strongpassword',
      displayName: 'Valid Creator',
    }).valid,
    true
  );
});

test('validatePostInput requires mediaUrl and valid mediaType', () => {
  assert.equal(
    validatePostInput({ mediaUrl: '', caption: 'Hello', mediaType: 'image' }).valid,
    false
  );
  assert.equal(
    validatePostInput({ mediaUrl: '/uploads/a.jpg', caption: 'Hello', mediaType: 'image' })
      .valid,
    true
  );
});

test('canViewContent enforces private accounts, banned users, and follower access', () => {
  const publicAuthor = { id: 2, isPrivate: false, isBanned: false, isActive: true };
  const privateAuthor = { id: 3, isPrivate: true, isBanned: false, isActive: true };
  const bannedAuthor = { id: 4, isPrivate: false, isBanned: true, isActive: true };
  const following = new Set<number>([3]);

  assert.equal(canViewContent(null, publicAuthor, new Set()), true);
  assert.equal(canViewContent(null, privateAuthor, new Set()), false);
  assert.equal(canViewContent(1, privateAuthor, new Set()), false);
  assert.equal(canViewContent(1, privateAuthor, following), true);
  assert.equal(canViewContent(3, privateAuthor, new Set()), true);
  assert.equal(canViewContent(1, bannedAuthor, following), false);
});

test('isStoryActive checks 24h expiry correctly', () => {
  const now = new Date('2026-11-15T12:00:00Z');
  assert.equal(isStoryActive('2026-11-15T13:00:00Z', now), true);
  assert.equal(isStoryActive('2026-11-15T11:59:59Z', now), false);
});

test('buildAiSystemInstruction formats admin settings cleanly', () => {
  const instruction = buildAiSystemInstruction({
    systemPrompt: 'You are Kova AI.',
    personality: 'Editorial',
    tone: 'Concise',
    responsePreferences: 'No speculation.',
  });
  assert.match(instruction, /You are Kova AI\./);
  assert.match(instruction, /Personality: Editorial/);
  assert.match(instruction, /Tone: Concise/);
});

test('formatRelativeTime formats seconds, minutes, hours, and days', () => {
  const now = new Date('2026-11-15T12:00:00Z');
  assert.equal(formatRelativeTime('2026-11-15T11:59:40Z', now), 'just now');
  assert.equal(formatRelativeTime('2026-11-15T11:45:00Z', now), '15m');
  assert.equal(formatRelativeTime('2026-11-15T09:00:00Z', now), '3h');
  assert.equal(formatRelativeTime('2026-11-13T12:00:00Z', now), '2d');
});
