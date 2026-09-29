import { afterEach, expect, test } from 'bun:test';
import { authenticateRequest, authenticateWsUpgrade } from './auth.ts';

const originalToken = process.env.AGENT_HUB_TOKEN;
afterEach(() => {
  if (originalToken === undefined) delete process.env.AGENT_HUB_TOKEN;
  else process.env.AGENT_HUB_TOKEN = originalToken;
});

test('local API works without a configured token', () => {
  delete process.env.AGENT_HUB_TOKEN;
  expect(authenticateRequest(new Request('http://127.0.0.1/api/health'))).toBeNull();
});

test('configured token protects API and WebSocket upgrades', () => {
  process.env.AGENT_HUB_TOKEN = 'example-test-token';
  const url = 'http://127.0.0.1/api/health';
  expect(authenticateRequest(new Request(url))?.status).toBe(401);
  expect(authenticateRequest(new Request(url, {
    headers: { Authorization: 'Bearer example-test-token' },
  }))).toBeNull();
  expect(authenticateWsUpgrade(new Request('http://127.0.0.1/ws'))).toBe(false);
  expect(authenticateWsUpgrade(new Request('http://127.0.0.1/ws', {
    headers: { Authorization: 'Bearer example-test-token' },
  }))).toBe(true);
});
