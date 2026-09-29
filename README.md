# Agent Hub Dashboard

A local dashboard for inspecting coding-agent sessions, project activity, and orchestration state. It reads session files on the machine where it runs and presents them through a Bun API, WebSocket updates, and a React interface.

This public edition contains portable application code and neutral configuration examples. It has a fresh Git history and no production deployment configuration.

## Problem and approach

Coding-agent work is often spread across terminal sessions and project directories. Agent Hub makes those sessions easier to find and inspect without copying their contents into a separate hosted service.

```text
Local session files ──→ project discovery ──→ Bun API ──→ React dashboard
                           │                  │
Orchestration state ──→ filesystem watcher ──→ event bus ──→ WebSocket updates

Optional: upstream agent APIs ──→ aggregator ──→ merged machine view
```

The dashboard shows projects, session timelines, active status, and message details. Optional CLI controls can start local coding-agent commands; they are separate from the read-only inspection path.

## Run locally

Requirements: Bun and a local Claude CLI session directory for non-empty data.

```bash
bun install --frozen-lockfile
bun run server
```

In another terminal:

```bash
bun run dev
```

Open `http://127.0.0.1:5173`. The API uses `127.0.0.1:3002` by default. If there are no local sessions, the dashboard starts with empty views. `CLAUDE_HOME` can point to a separate session directory for testing.

For a production build, run `bun run build` and then `bun run server --production`. The server serves `dist/` when it exists.

## Configuration and safety

- The public server and development frontend bind to loopback by default. Browser requests from unrelated origins are rejected. Changing `HOST` to a network address exposes session data and CLI controls; secure access and authentication are the operator's responsibility.
- API token authentication is optional for local use. Setting `AGENT_HUB_TOKEN` protects API and WebSocket requests, but the browser UI does not supply that token automatically. Use a suitable authenticated proxy if exposing the UI beyond localhost.
- CLI controls execute with the permissions of the process owner and may invoke a paid model. The application never needs a model call merely to start or list sessions.
- Runtime session files, prompts, machine registries, tokens, and environment files are excluded from this repository. Do not commit them when adapting the project.
- Optional aggregator mode loads upstream agents from `machines.json`; see `machines.json.example`. The example uses only a loopback address and an environment-variable name for a token.

## Code map

| Path | Responsibility |
| --- | --- |
| `server/services/projectDiscovery.ts` | Discover local projects and sessions |
| `server/services/sessionParser.ts` | Parse session events for display |
| `server/watchers/omcWatcher.ts` | Observe orchestration state changes |
| `server/bus/`, `server/ws.ts` | Fan out updates to connected clients |
| `server/agentClient.ts`, `server/wsAggregator.ts` | Optional multi-machine aggregation |
| `src/pages/`, `src/stores/` | Dashboard views and client state |

## Verification

```bash
bun run test
bun run typecheck
bun run build
```

GitHub Actions runs these checks on a hosted runner. The repository does not include a deployment workflow.

## Limits

This is a local operations tool, not a hosted multi-tenant service. Session parsing follows the currently supported CLI file shapes and may need updates as those formats change. Aggregator mode and real CLI execution are not exercised by the portable CI checks. The dashboard does not provide a security boundary when bound to an untrusted network.

## License

MIT.
