# OmniRoute development pilot

This pilot reduces AI development cost without changing HotelAccelerator production traffic.

## Scope

- Development/coding agents only.
- No application runtime dependency.
- No production model routing change.
- No customer prompts or tenant data are intentionally routed through OmniRoute by this repository change.

## Install locally

OmniRoute's documented global install is:

```bash
npm install -g omniroute
omniroute
```

Run it on the developer workstation and complete provider/CLI setup in the local OmniRoute dashboard. Provider credentials and OmniRoute local state must remain outside this repository.

## Recommended routing policy

1. Routine work: `auto/cheap`.
2. Hard coding/debugging: escalate to `auto/coding`.
3. Premium/specific model: use only after a cheaper route fails or when the task clearly requires it.

Do not use undocumented subscription/OAuth workarounds that violate a provider's terms. Prefer official APIs, documented free tiers, or explicitly permitted subscriptions.

## HotelAccelerator workflow

1. Pull the current target branch.
2. Start OmniRoute locally.
3. Start the supported coding CLI through the local OmniRoute configuration.
4. Give the agent one focused task at a time.
5. The agent must follow `AGENTS.md`.
6. Run targeted tests first.
7. Review the diff before creating a PR.
8. Merge/deploy only after explicit authorization.

## Cost-control rules

- Do not send full logs when a relevant error slice is sufficient.
- Do not ask the model to reread the entire repository after every change.
- Reuse short summaries of established facts instead of retransmitting raw context.
- Avoid broad refactors during bug fixes.
- Prefer deterministic tools/tests over asking a model to infer what a command can verify.
- Track tasks that required escalation from cheap to coding/premium; these are candidates for better prompts, tests, or documentation.

## Success criteria for the pilot

For two weeks, compare against the prior workflow:

- paid AI spend per completed development task;
- percentage of tasks solved on the cheap route;
- number of escalations to premium models;
- time to a passing targeted test;
- regressions/reopened fixes.

The pilot is successful only if cost falls without a meaningful increase in regressions or developer effort.

## Rollback

Stop using OmniRoute locally and run the coding CLI with its normal provider configuration. No production rollback is needed because this pilot does not alter HotelAccelerator runtime behavior.
