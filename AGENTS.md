# HotelAccelerator agent instructions

These rules apply to AI coding agents working in this repository.

## Objective

Ship the smallest safe change while minimizing paid AI usage and avoiding unnecessary context expansion.

## Working rules

1. Locate the exact code path before reading broad areas of the repository.
2. Inspect only the files and ranges needed for the task; do not load large folders without a concrete reason.
3. Prefer the smallest targeted patch. Do not refactor unrelated code while fixing a bug.
4. Do not rename database fields, routes, environment variables, public APIs, or domain concepts unless the task explicitly requires it.
5. Do not introduce mock production data or fake integrations.
6. Preserve tenant isolation and existing authorization boundaries.
7. Never commit API keys, access tokens, passwords, customer data, or local OmniRoute configuration.
8. Run the narrowest relevant tests first, then typecheck/build only when the change warrants it.
9. Report files changed, tests run, failures, and remaining uncertainty.
10. Do not merge or deploy to production unless explicitly authorized.

## Cost-aware AI workflow

For routine fixes, searches, small UI changes, tests, and refactors, use the OmniRoute `auto/cheap` route when available. Escalate to `auto/coding` for tasks that require stronger code reasoning or when the cheaper route fails. Use a premium/specific model only for a concrete reason.

Keep prompts focused. Summarize prior findings instead of repeatedly sending large logs or unchanged files. Prefer targeted command output over entire build logs.
