# Native Commerce Spine MCP setup · 0.3.3

The default runtime connects directly to Commerce Spine. It needs Node.js22+ on Codex/Claude Code; the Claude Desktop MCP bundle uses the app's Node runtime. It needs no Notion key, local service, Docker or local PostgreSQL. The historical `login --service URL` transport is compatibility-only and exposes explicitly separate legacy tools.

## Install a reviewed distribution

Verify SHA256SUMS.txt before installing. The ZIP and `.mcpb` contain the same self-contained runtime, dependencies, two skills and typed references. No credentials or client snapshots are bundled.

- Codex: extract the ZIP, then run `node install.mjs codex`. The installer uses `codex mcp add`, installs both skills under `~/.codex/skills`, preserves unrelated configuration and refuses an existing server/skill rather than overwriting customizations.
- Claude Code: extract the ZIP, then run `node install.mjs claude-code`. This uses the official native Claude CLI with stdio/user scope and installs the skills under `~/.claude/skills`.
- Claude Desktop: open the `.mcpb` file and confirm its installation dialog. Skills and contracts are available as MCP resources, prompts and the `ppc_workflow_guide` tool. No filesystem skill copy is required for that mode.

Use `--dry-run` to inspect an install plan without changing configuration. If your CLI is unavailable, register the stdio command manually using the sample below. Installing in Claude Desktop/Code does not create a claude.ai remote connector. Claude web needs a separately hosted authenticated HTTP MCP endpoint; this distribution does not invent or publish one.

Manual stdio configuration (replace absolute paths):
```text
codex mcp add commercespine -- node ABSOLUTE_PATH/server/dist/cli.js serve --state-dir ABSOLUTE_PRIVATE_STATE_DIR
claude mcp add --transport stdio --scope user commercespine -- node ABSOLUTE_PATH/server/dist/cli.js serve --state-dir ABSOLUTE_PRIVATE_STATE_DIR
```

Use a separate state directory per harness. The Claude Desktop manifest selects `~/.commercespine-mcp/claude-desktop`. Paths containing spaces stay separate arguments. The package directory must remain where the registered command points. Uninstall the server with the harness's supported MCP command/settings; do not delete or rewrite unrelated entries.

## Connect without exposing credentials

The MCP negotiates and advertises its skills before login. Ask it to connect with `ppc_connect`. Open the returned local browser link yourself, sign in to Commerce Spine and confirm creating/reusing your own agent token. Passwords and raw tokens never enter the model. Then call `ppc_identity` and `ppc_capabilities`.

Alternative terminal setup:
```text
node server/dist/cli.js login --api https://eb-api.sellerplex.com --console https://ecombrain.sellerplex.com --state-dir ABSOLUTE_PRIVATE_STATE_DIR
node server/dist/cli.js status --state-dir ABSOLUTE_PRIVATE_STATE_DIR
```
Windows protects the saved connection with CurrentUser DPAPI. Unix uses a private0700 directory/0600 file, which does not isolate it from other programs running as that user. Refresh rotation is serialized across processes. Credentials are never placed in the MCP config, browser URL or release archive. A revoked connection uses `ppc_connect` with `reconnect:true`; rejected writes are not automatically retried. Terminal logout revokes the Console refresh session and removes the local connection; the self-owned agent token remains manageable/revocable in the Console.

## Choose the workflow

Read `sellerplex://skills/automation` for assigned recurring work and `sellerplex://skills/business` for ad hoc questions or Business authoring. Clients without resource access use `ppc_workflow_guide`. Prompts `run-assigned-analyses` and `analyze-or-edit-business` provide entry points. The typed references explain rich documents, shared metadata, claims, exact revisions and reporting.

Native run API requires companion backend migration `1720000000046_automation-binding-read-access` and the matching `/action/v1/automation` implementation. `ppc_capabilities` reports unavailable/unauthorized operations explicitly. Native Business access remains controlled by organization Business enablement, live roles and account grants; installing the MCP does not enroll a user or grant an administrator role.

For scheduled work: discover enabled assignments owned by the current user; claim the exact occurrence; follow pinned SOP/Business/KPI protocols; calculate/reuse compatible evidence; prepare only KPI-linked pending proposals; close every run with complete/partial/no-action/failed outcomes. Read back native history before presenting the review links. `ppc_start_recurring_analysis` remains a read-only brief, not a claim.

For ad hoc work: discover approved context and the live data catalog; answer with period/units/coverage. Requested Business changes use full replacement proposals. Shared tag/property-name CRUD saves immediately; document-specific values remain in the document. The human approves/rejects exact proposal versions in the authenticated Console; the worker commits them later. The MCP never approves or executes Amazon changes.

## Scheduling and updates

Save preferences only after the user chooses accounts/timezone/times. Set up a supported harness-native scheduler separately and verify its task record; no central hosted AI runner or cron task is installed by this package. A task must supply the intended scheduled instant and represented reporting window, not infer success from wall-clock ordering. Durable execution requires the chosen runner, machine and MCP connection to be available.

For updates, stop the old server, preserve the existing private state directory, compare customized skills, install the new reviewed version and update its stdio path through the harness's supported MCP UI/CLI. Back up configuration first. Never copy credentials into the package. Restart and check identity, capabilities, both workflow guides and a read-only account query before resuming scheduled work.

Official installation contracts checked for this release:
- Claude Code stdio: https://code.claude.com/docs/en/mcp
- Claude skills: https://code.claude.com/docs/en/skills
- Desktop bundle manifest: https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md
- Codex command shape verified with the installed `codex mcp add --help`.
