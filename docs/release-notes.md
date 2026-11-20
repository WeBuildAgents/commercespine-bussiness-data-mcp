# Commerce Spine MCP 0.3.2 preview

Self-contained local MCP runtime with 39 native tools, browser login and two complete operating skills for recurring automation and Business/ad hoc workflows.

- Codex and Claude Code: extract the ZIP and run `node install.mjs codex` or `node install.mjs claude-code`.
- Claude Desktop: open the MCPB bundle and review the installation prompt.
- Verify the matching archive checksum in SHA256SUMS.txt first. ZIP and MCPB have identical contents.
- After restarting the client, use `ppc_connect`, complete browser sign-in, then check `ppc_identity` and `ppc_capabilities`.

**Backend prerequisite:** native recurring-run and proposal operations require the matching `/action/v1/automation` rollout and migration `1720000000045_automation-native-run-ingestion`. Preview publication does not mean those features are enabled in production. Existing organization enrollment, roles and account grants apply. Human decisions remain in the Console.

Validation: source unit/integration tests plus packaged stdio discovery in an isolated directory with production dependencies only. Browser login is tested with local fixtures, not a recipient's live account. Windows and Linux automated checks do not certify every client UI or macOS installation. See README and docs/setup.md before using scheduled work.
