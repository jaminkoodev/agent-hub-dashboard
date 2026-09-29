/** Restrict browser requests to the local UI or an explicitly configured UI. */
export function isAllowedOrigin(req: Request, host: string, port: number): boolean {
  const origin = req.headers.get('Origin');
  if (!origin) return true; // non-browser clients

  const allowed = new Set([
    `http://${host}:${port}`,
    'http://127.0.0.1:5173',
    'http://localhost:5173',
  ]);
  if (process.env.ALLOWED_ORIGIN) allowed.add(process.env.ALLOWED_ORIGIN);
  return allowed.has(origin);
}
