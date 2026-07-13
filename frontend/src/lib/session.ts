export interface StoredSession {
  sessionId: string;
  email: string;
  name: string;
  picture: string;
}

const STORAGE_KEY = 'userSession';

export function getStoredSession(): StoredSession | null {
  if (typeof window === 'undefined') return null;

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (parsed.sessionId && parsed.email) {
      return {
        sessionId: parsed.sessionId,
        email: parsed.email,
        name: parsed.name || parsed.email,
        picture: parsed.picture || '',
      };
    }

    // Phiên cũ lưu accessToken trực tiếp — bỏ để đăng nhập lại
    if (parsed.token) {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }

  return null;
}

export function saveStoredSession(session: StoredSession) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredSession() {
  localStorage.removeItem(STORAGE_KEY);
}

export async function validateSessionWithBackend(
  sessionId: string,
): Promise<StoredSession | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
  const res = await fetch(
    `${apiUrl}/auth/session?sessionId=${encodeURIComponent(sessionId)}`,
  );

  if (!res.ok) return null;

  const data = await res.json();
  return {
    sessionId: data.sessionId,
    email: data.email,
    name: data.name,
    picture: data.picture || '',
  };
}

/** Gọi định kỳ để backend tự refresh token Google trước khi hết hạn */
export const SESSION_KEEP_ALIVE_MS = 30 * 60 * 1000;

export async function revokeSessionOnBackend(sessionId: string) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
  await fetch(`${apiUrl}/auth/session?sessionId=${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  });
}
