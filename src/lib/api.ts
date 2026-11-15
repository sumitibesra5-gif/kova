const SESSION_TOKEN_KEY = 'kova_session_token';
const ADMIN_TOKEN_KEY = 'kova_admin_token';

let memorySessionToken = '';
let memoryAdminToken = '';

function readStorage(key: string): string {
  try {
    return window.localStorage.getItem(key) || window.sessionStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function writeStorage(key: string, value: string): void {
  try {
    if (value) {
      window.localStorage.setItem(key, value);
      window.sessionStorage.setItem(key, value);
    } else {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // Fallback to in-memory token when storage is restricted
  }
}

export function getStoredSessionToken(): string {
  return memorySessionToken || readStorage(SESSION_TOKEN_KEY);
}

export function setStoredSessionToken(token?: string | null): void {
  const clean = (token || '').trim();
  memorySessionToken = clean;
  writeStorage(SESSION_TOKEN_KEY, clean);
}

export function clearStoredSessionToken(): void {
  memorySessionToken = '';
  writeStorage(SESSION_TOKEN_KEY, '');
}

export function getStoredAdminToken(): string {
  return memoryAdminToken || readStorage(ADMIN_TOKEN_KEY);
}

export function setStoredAdminToken(token?: string | null): void {
  const clean = (token || '').trim();
  memoryAdminToken = clean;
  writeStorage(ADMIN_TOKEN_KEY, clean);
}

export function clearStoredAdminToken(): void {
  memoryAdminToken = '';
  writeStorage(ADMIN_TOKEN_KEY, '');
}

export async function apiRequest<T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (url.startsWith('/api/admin/')) {
    const adminToken = getStoredAdminToken();
    if (adminToken && !headers['X-Admin-Authorization']) {
      headers['X-Admin-Authorization'] = `Bearer ${adminToken}`;
    }
  } else {
    const sessionToken = getStoredSessionToken();
    if (sessionToken && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${sessionToken}`;
    }
  }

  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && url === '/api/auth/me') {
      clearStoredSessionToken();
    }
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export async function uploadMediaFile(file: File): Promise<{
  url: string;
  mediaType: 'image' | 'video';
  size: number;
}> {
  const formData = new FormData();
  formData.append('file', file);
  return apiRequest('/api/upload', {
    method: 'POST',
    body: formData,
  });
}
