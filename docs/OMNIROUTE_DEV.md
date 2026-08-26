# OmniRoute development pilot

This pilot reduces AI development cost without changing HotelAccelerator production traffic.

## Scope

- Development/coding agents only.
- No application runtime dependency.
- No production model routing change.
- No customer prompts or tenant data are intentionally routed through OmniRoute by this repository change.

## Install locally

OmniRoute documents this global install:

```bash
npm install -g omniroute
omniroute
```

Codex must also be available in PATH:

```bash
npm install -g @openai/codex
```

Provider credentials and OmniRoute local state must remain outside this repository.

## Start Codex through OmniRoute

OmniRoute includes a native Codex launcher. With OmniRoute running locally on its default port, start Codex with:

```bash
omniroute launch-codex
```

The launcher performs a health check against the local OmniRoute service, injects OmniRoute as Codex's model provider and strips stale OpenAI/Codex environment variables that could bypass the gateway.

For a remote OmniRoute instance the launcher supports `--remote <url>` and `--api-key <key>`. Do not place those secrets in this repository.

## Recommended routing policy

1. Routine work: cheapest suitable route/provider available in OmniRoute.
2. Hard coding/debugging: escalate to a coding-optimized route/model.
3. Premium/specific model: use only after a cheaper route fails or when the task clearly requires it.

Do not use undocumented subscription/OAuth workarounds that violate a provider's terms. Prefer official APIs, documented free tiers, or explicitly permitted subscriptions.

## HotelAccelerator workflow

1. Pull the current target branch.
2. Start OmniRoute locally.
3. Run `omniroute launch-codex` from the repository working tree.
4. Give the agent one focused task at a time.
5. The agent must follow the existing `AGENTS.md` rules.
6. Run targeted tests first.
7. Review the diff before creating a PR.
8. Merge/deploy only after explicit authorization.

## Cost-control rules

- Do not send full logs when a relevant error slice is sufficient.
- Do not ask the model to reread the entire repository after every change.
- Reuse short summaries of established facts instead of retransmitting raw context.
- Avoid broad refactors during bug fixes.
- Prefer deterministic tools/tests over asking a model to infer what a command can verify.
- Record when a task needs escalation to a more expensive model; repeated escalations are candidates for better tests, prompts or documentation.

## Success criteria for the pilot

For two weeks, compare against the prior workflow:

- paid AI spend per completed development task;
- percentage of tasks solved on the cheapest suitable route;
- number of escalations to premium models;
- time to a passing targeted test;
- regressions/reopened fixes.

The pilot is successful only if cost falls without a meaningful increase in regressions or developer effort.

## Rollback

Stop launching Codex through OmniRoute and use the coding CLI with its normal provider configuration. No production rollback is needed because this pilot does not alter HotelAccelerator runtime behavior.
