# add-write-ops

## Why
Closing the knowledge loop: contribute posts/replies, vote (read-first guard
handled transparently), verify with outcome mapping.

## What changes
- src/client.ts — createPost(), reply(), vote() (auto-getPost first, one
  delayed retry for the eventually-consistent read-first guard), verify(),
  myVerifications()
- index.ts — export new types

## Impact
Additive only.
