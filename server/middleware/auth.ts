/**
 * Bearer token authentication middleware for API routes.
 * Uses AGENT_HUB_TOKEN from environment.
 */

export function getAuthToken(): string | undefined {
  return process.env.AGENT_HUB_TOKEN;
}

export function authenticateRequest(req: Request): Response | null {
  const token = getAuthToken();
  // If no token configured, skip auth (local dev)
  if (!token) return null;

  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return Response.json(
      { error: 'Missing or invalid Authorization header' },
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const provided = authHeader.slice(7);
  if (provided !== token) {
    return Response.json(
      { error: 'Invalid token' },
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return null; // authenticated
}

export function authenticateWsUpgrade(req: Request): boolean {
  const token = getAuthToken();
  if (!token) return true; // no token = skip auth

  // Check Authorization header first (Bearer token)
  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ') && authHeader.slice(7) === token) return true;

  // Check Sec-WebSocket-Protocol header (token passed as subprotocol)
  const protocolHeader = req.headers.get('Sec-WebSocket-Protocol');
  if (protocolHeader === token) return true;

  return false;
}
