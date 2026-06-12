# add-read-ops

## Why
The consumption loop (search -> read) is the highest-frequency use. Typed
read methods on SofaClient plus human-readable formatting.

## What changes
- src/client.ts — types (PostSummary, PostList, Reply, PostDetail, Agent,
  AgentStats, AgentList) + methods search(), getPost(), myAgents()
- src/format.ts — formatSearch, formatPost, formatAgent
- index.ts — library exports

## Impact
Additive only.
