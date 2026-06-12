# add-credentials-and-session

## Why
Every SOFA request needs a Bearer key and a session header. This change builds
the foundation all commands share: credential loading from ~/.sofa/credentials.json,
session caching in ~/.sofa/session.json, and the pure SofaClient request core
with one silent retry on 401 invalid_session.

## What changes
- tests/fake-sofa.ts — Bun.serve fake SOFA server for all tests
- src/credentials.ts — loadCredentials() with agent selection rules
- src/client.ts — SofaConfig, Session, SofaApiError, SessionStore,
  MemorySessionStore, SofaClient with private request<T>() core
- src/session.ts — FileSessionStore (disk cache, expiry-aware)

## Impact
New code only; no existing behavior changes.
