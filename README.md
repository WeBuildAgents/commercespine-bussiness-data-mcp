# Commerce Spine Business Data MCP

Connect Codex, Claude Code or Claude Desktop to Commerce Spine through a local MCP server and two operating skills. Sign in in your browser; credentials stay outside the conversation.

**Preview release:** the package is independently tested. Native recurring-run reporting and proposal workflows require the matching server rollout and migration 45. Use `ppc_capabilities` after login to discover what your organization can use. Installing this package does not grant accounts, roles or organization features.

## Ask your agent to set it up

Give a local Codex or Claude Code agent this repository URL and this instruction:

> Set up the Commerce Spine MCP from https://github.com/WeBuildAgents/commercespine-bussiness-data-mcp. Read README.md and docs/setup.md, use the reviewed release, verify its checksums, install for my client, and guide me through browser login. Then show my identity, available accounts and capabilities. Do not request passwords or tokens in chat.

The agent can prepare the local configuration. You complete sign-in and any client installation confirmations yourself. Claude Desktop users install the bundle through the app as described below. A GitHub URL alone is not a running MCP endpoint.

## Install

Download assets from [Releases](https://github.com/WeBuildAgents/commercespine-bussiness-data-mcp/releases), including preview releases. Use `SHA256SUMS.txt` to verify the downloaded archive before opening it. On macOS/Linux use `shasum -a 256 FILE`; on PowerShell use `Get-FileHash FILE -Algorithm SHA256` and compare the result with the matching checksum entry.

| Client | Installation |
| --- | --- |
| Codex | Install Node.js 22+ and the official Codex CLI. Extract the ZIP to a permanent directory, open a terminal there, and run `node install.mjs codex`. |
| Claude Code | Install Node.js 22+ and the official native Claude Code CLI. Extract the ZIP to a permanent directory and run `node install.mjs claude-code`. |
| Claude Desktop | Download and open the `.mcpb` bundle, review its details and confirm installation. Requires a Desktop version supporting local MCP bundles and Node 22+. |

The ZIP includes production dependencies; no npm install is needed for a release. CLI installation registers the MCP and copies both skills. Add `--dry-run` to inspect the plan. Existing server entries or skills are preserved; follow [updates and manual configuration](docs/setup.md) for an existing installation. Keep the extracted directory at its registered path.

Restart your client. Ask it to call `ppc_connect`, open the returned local browser link, sign in to Commerce Spine and confirm your connection. Then ask for `ppc_identity` and `ppc_capabilities`. If login is pending, finish the browser flow before asking again. Do not paste credentials into the agent.

## What the agent learns

- **Automation:** discover assigned recurring analyses; read the linked approved SOPs, Business Data and KPI targets; claim the intended occurrence; collect evidence; prepare KPI-linked proposals following its protocol; save the run outcome and read back its history.
- **Business and ad hoc analysis:** discover accessible accounts and the data catalog; analyze a defined reporting period; read and propose revisions to Business items and rich documents; reuse organization-wide tags and property names; provide exact review links.

Skills are available as `sellerplex-automation` and `sellerplex-business` in CLI clients. All clients can use MCP resources, prompts and `ppc_workflow_guide`. Human approval/rejection and revocation remain in the authenticated Commerce Spine Console. The MCP prepares changes and links to review; it does not approve or execute Amazon changes.

Installation creates no schedule. Choose accounts, timezone and cadence before setting up a runner. The machine, client and connection must remain available for scheduled work. Local stdio bundles do not create a Claude web connector.

## Develop and verify

```sh
npm ci --ignore-scripts
npm test
node scripts/build-release.mjs
```

Then, in `artifacts/commercespine-mcp-0.3.2`, run `npm ci --omit=dev --ignore-scripts`. Return to the repository root and run `node test/distribution-smoke.mjs artifacts/commercespine-mcp-0.3.2`. The release workflow validates the manifest with the official MCPB packager, packages the runtime and publishes checksummed assets only after tests pass.

Tests cover stdio discovery, workflow resources, local browser authentication, credential redaction/storage, refresh locking and restricted API routing using fixtures. Distribution checks run the packaged server from an isolated directory. These checks do not constitute a recipient's real-account login, production backend rollout or cross-platform client UI certification.

See [setup and operations](docs/setup.md), [native context](docs/native-context.md) and [release compatibility](release.json). This repository contains generic runtime code and instructions, without customer records or saved sessions. The source is public; no open-source license is granted by this repository. Contact SellerPlex for redistribution terms.
