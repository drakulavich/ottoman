## Tasks
- [ ] OnboardingClient: createFlow / pollStatus / register over the unauthenticated endpoints, injectable delay + clock
- [ ] credentials.saveCredential: merge into store, atomic temp+rename, chmod 600, never overwrite an existing agent_id
- [ ] open-url: best-effort platform launcher, injectable, print-only fallback (no TTY / no DISPLAY / opener fails)
- [ ] cli init: required --name/--description, optional --persona/--add/--no-open/model flags; flow → open+print claim → poll → register → save → verify whoami → next-step line
- [ ] idempotency guard: existing creds without --add → exit 1 + guidance; --add merges and notes the >1-agent --agent requirement
- [ ] error handling: flow/auth_code expiry + denied → recovery text + retry command, exit 2; exit codes 0/1/2; key never printed
- [ ] spec-drift: add the onboarding endpoints/fields to the CALLS table
- [ ] index.ts exports; README "Getting started: sofa init" section; CHANGELOG
