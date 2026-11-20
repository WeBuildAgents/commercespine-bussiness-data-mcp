# Commerce Spine MCP · 0.3.1

This distribution includes a self-contained stdio MCP runtime and two operating skills:

- **sellerplex-automation**: assigned recurring analyses, approved linked SOP/Business/KPI context, evidence, KPI-linked pending proposals and native run reporting.
- **sellerplex-business**: ad hoc questions, native Business changes, rich documents, shared organization tags/properties and exact human review.

For Codex, extract this archive and run `node install.mjs codex`. For Claude Code, run `node install.mjs claude-code`. Both support `--dry-run`, preserve unrelated configuration, and refuse existing server/skill collisions. Claude Desktop users open the `.mcpb` file instead. All modes use the same MCP tools, skills and contracts. See [setup](server/docs/setup.md) for manual configuration and updates.

After installation, restart the harness, call `ppc_connect`, complete the local browser sign-in yourself, then check `ppc_identity` and `ppc_capabilities`. Do not paste passwords or API keys into the assistant. Native mode needs no Notion, Docker, local service or local database. No schedules, approvals, provider changes or new user roles are activated by installation.

Before distributing to operational users, deploy the matching native run API and migration45 identified in `server/release.json`. Missing/unauthorized backend features are reported by capability discovery, not silently replaced with legacy tools. Existing pilot enrollment and live account rights still apply. Exact approvals and keep/cancel decisions remain in the authenticated Action Console; MCP tools prepare and record, the Action worker executes approved changes.

Verify the published SHA256SUMS.txt. This archive contains runtime code/dependencies and generic skills only; no saved sessions, credentials or real-client data. `server/docs/setup.md` distinguishes tested stdio/package behavior from installation or schedules that still need verification on the recipient's actual harness. Claude.ai web requires a separate authenticated remote connector; the local bundle is for desktop/CLI clients.
