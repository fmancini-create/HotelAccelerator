# Shared PBX tenant isolation fix

- routes inbound `ReportCall` to a shared tenant only when a single declared internal destination matches;
- maps 4BID queue 820 through tenant-scoped extension configuration;
- preserves fail-closed behavior when the target is ambiguous;
- documents current production evidence for missing transcript/recording payloads.
