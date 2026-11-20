# Commerce Spine MCP 0.3.3 preview

Self-contained local MCP runtime with 39 native tools, browser login and two complete operating skills for recurring automation and Business/ad hoc workflows.

- Codex and Claude Code: extract the ZIP and run `node install.mjs codex` or `node install.mjs claude-code`.
- Claude Desktop: open the MCPB bundle and review the installation prompt.
- Verify the matching archive checksum in SHA256SUMS.txt first. ZIP and MCPB have identical contents.
- After restarting the client, use `ppc_connect`, complete browser sign-in, then check `ppc_identity` and `ppc_capabilities`.

**Backend prerequisite:** native recurring-run and proposal operations require the matching `/action/v1/automation` rollout and migrations `1720000000045_automation-native-run-ingestion` and `1720000000046_automation-binding-read-access`. The second migration supplies the application login's read permission when assigning analyses while preserving their KPI bindings. Organization Business enablement, roles and account grants apply. Decisions remain in the authenticated Console.

Validation: 24 source unit/integration tests plus packaged stdio discovery in an isolated directory with production dependencies only. Real Chrome sign-in and authenticated production reads of Business documents and KPI results were verified on 20 November 2026. Windows and Linux automated checks do not certify every client UI or macOS installation. See README and docs/setup.md before using scheduled work.

Production manual-run acceptance also passed using the downloaded 0.3.3 bundle: approved linked context and assignment, occurrence claim, heartbeat, daily KPI retrieval, durable `no_action` report, read-back and identical claim/completion replays. Missing dates remained explicit; no Amazon proposals or provider changes were made by the acceptance run. This establishes the manual native run path, not a hosted scheduler or every provider operation.
