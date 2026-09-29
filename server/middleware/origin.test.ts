import { afterEach, expect, test } from 'bun:test';
import { isAllowedOrigin } from './origin.ts';

const original = process.env.ALLOWED_ORIGIN;
afterEach(() => {
  if (original === undefined) delete process.env.ALLOWED_ORIGIN;
  else process.env.ALLOWED_ORIGIN = original;
});

test('accepts local UI and non-browser tools', () => {
  const url = 'http://127.0.0.1:3002/api/health';
  expect(isAllowedOrigin(new Request(url), '127.0.0.1', 3002)).toBe(true);
  expect(isAllowedOrigin(new Request(url, { headers: { Origin: 'http://127.0.0.1:5173' } }), '127.0.0.1', 3002)).toBe(true);
});

test('rejects unrelated browser origins unless explicitly allowed', () => {
  const url = 'http://127.0.0.1:3002/api/health';
  const request = new Request(url, { headers: { Origin: 'https://example.invalid' } });
  expect(isAllowedOrigin(request, '127.0.0.1', 3002)).toBe(false);
  process.env.ALLOWED_ORIGIN = 'https://example.invalid';
  expect(isAllowedOrigin(request, '127.0.0.1', 3002)).toBe(true);
});
