import { NextResponse } from 'next/server';

// Server-side active sessions registry (persisted in globalThis across requests in the Node/serverless runtime)
if (!globalThis.__marsPresenceSessions) {
  globalThis.__marsPresenceSessions = new Map();
}

const sessions = globalThis.__marsPresenceSessions;
const TIMEOUT_MS = 22000; // 22 seconds cutoff for active presence

function pruneExpired(now) {
  for (const [id, lastSeen] of sessions.entries()) {
    if (now - lastSeen > TIMEOUT_MS) {
      sessions.delete(id);
    }
  }
}

export async function GET(request) {
  const now = Date.now();
  pruneExpired(now);

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');
  if (sessionId && sessionId.length > 3) {
    sessions.set(sessionId, now);
  }

  const count = Math.max(1, sessions.size);

  return NextResponse.json(
    {
      online: count,
      timestamp: now,
      status: 'nominal',
      network: 'DSN-MARS-RELAY'
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    }
  );
}

export async function POST(request) {
  const now = Date.now();
  pruneExpired(now);

  try {
    let body = {};
    const text = await request.text();
    if (text) {
      body = JSON.parse(text);
    }

    const { sessionId, action } = body;

    if (sessionId && sessionId.length > 3) {
      if (action === 'leave') {
        sessions.delete(sessionId);
      } else {
        sessions.set(sessionId, now);
      }
    }
  } catch (_) {
    // Graceful fallback for non-JSON or beacon bodies
  }

  const count = Math.max(1, sessions.size);

  return NextResponse.json(
    {
      online: count,
      timestamp: now,
      status: 'nominal',
      network: 'DSN-MARS-RELAY'
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    }
  );
}
