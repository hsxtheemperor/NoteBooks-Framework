import jwt from 'jsonwebtoken';
import { query } from './db-client';
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

const AUTH_SECRET = process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET || 'dev-secret-change-me';

interface User {
  id: string;
  email: string;
  name?: string;
  role: 'admin' | 'moderator' | 'user';
}

/**
 * Extract session ID from cookie or generate guest session (Next.js compatible)
 */
export function getOrCreateSessionId(request: NextRequest): string {
  const cookieHeader = request.headers.get('cookie') || '';
  const cookieList = cookieHeader.split('; ').reduce((acc: Record<string, string>, cookie) => {
    const [key, value] = cookie.split('=');
    if (key && value) {
      acc[key] = decodeURIComponent(value);
    }
    return acc;
  }, {});

  let sessionId = cookieList.sessionId;

  if (!sessionId) {
    sessionId = crypto.randomUUID();
  }

  return sessionId;
}

/**
 * Get guest display name from session ID
 */
export function getGuestName(sessionId: string): string {
  return `Guest-${sessionId.substring(0, 6).toUpperCase()}`;
}

/**
 * Verify JWT token and get user ID
 */
export async function getUserIdFromToken(token: string): Promise<string | null> {
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, AUTH_SECRET) as { userId?: string; sub?: string };
    return decoded.userId || decoded.sub || null;
  } catch (error) {
    console.error('[v0] JWT verification failed:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Get authenticated user from Next.js request (JWT header or session cookie)
 */
export async function getAuthenticatedUser(request: NextRequest): Promise<User | null> {
  // Check Authorization header
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const userId = await getUserIdFromToken(token);
    if (userId) {
      try {
        const result = await query(
          'SELECT id, email, name, role FROM "user" WHERE id = $1',
          [userId]
        );
        return result.rows[0] as User || null;
      } catch (error) {
        console.error('[v0] Failed to fetch user:', error);
        return null;
      }
    }
  }

  // Check session cookie
  const cookieHeader = request.headers.get('cookie') || '';
  const cookieList = cookieHeader.split('; ').reduce((acc: Record<string, string>, cookie) => {
    const [key, value] = cookie.split('=');
    if (key && value) {
      acc[key] = decodeURIComponent(value);
    }
    return acc;
  }, {});

  const sessionToken = cookieList.auth_session;
  if (sessionToken) {
    try {
      const decoded = jwt.verify(sessionToken, AUTH_SECRET) as { userId?: string };
      if (decoded.userId) {
        const result = await query(
          'SELECT id, email, name, role FROM "user" WHERE id = $1',
          [decoded.userId]
        );
        return result.rows[0] as User || null;
      }
    } catch (error) {
      console.error('[v0] Session verification failed:', error);
    }
  }

  return null;
}

/**
 * Set session cookie in Next.js response
 */
export function setSessionCookie(response: NextResponse, sessionId: string): void {
  const maxAge = 365 * 24 * 60 * 60; // 1 year
  response.cookies.set('sessionId', sessionId, {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'development' ? 'none' : 'lax',
    secure: process.env.NODE_ENV !== 'development',
    path: '/',
    maxAge,
  });
}

/**
 * Middleware factory to require authentication
 */
export async function requireAuth(request: NextRequest): Promise<User> {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    throw new Error('Unauthorized');
  }
  return user;
}

/**
 * Middleware factory to require specific role
 */
export async function requireRole(request: NextRequest, requiredRole: 'admin' | 'moderator' | 'user'): Promise<User> {
  const user = await requireAuth(request);
  const roleHierarchy = { admin: 100, moderator: 50, user: 10 };

  if ((roleHierarchy[user.role] || 0) < (roleHierarchy[requiredRole] || 0)) {
    throw new Error('Insufficient permissions');
  }

  return user;
}

export default {
  getOrCreateSessionId,
  getGuestName,
  getUserIdFromToken,
  getAuthenticatedUser,
  setSessionCookie,
  requireAuth,
  requireRole,
};
