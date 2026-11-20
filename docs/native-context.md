# Native context and authoring

The0.3.0 native runtime uses direct authenticated Commerce Spine APIs. Read the two operating skills and their typed contracts through MCP resources or `ppc_workflow_guide`; setup is documented in [setup.md](setup.md).

Native context discovery (`ppc_native_analyses`, `ppc_account_briefing`, `ppc_start_recurring_analysis`) returns explicit linked SOP, KPI and information IDs. `includeContext:true` returns complete pinned records, rich documents, tags, stable tag IDs, properties and references. GraphQL errors/partial bundles are failures, never complete context.

`ppc_start_recurring_analysis` only prepares a read-only brief. A real occurrence uses `ppc_native_run_start`, heartbeat/proposal tools, and immutable `ppc_native_run_complete` reporting against `/action/v1/automation`. Native history lives in Commerce Spine PostgreSQL. No native ID belongs in legacy local/Notion run tools.

Business proposals use `/action/v1/action-proposals` and current enrollment/role/account guards. Shared metadata uses the same existing Console metadata APIs as the deployed editor; these names save immediately and values remain per-document. Source hierarchy registration selects connected canonical identities, never provisions them.

Human approval/rejection and KPI-impact keep/cancel decisions use authenticated Console review. The MCP has no approval or execution primitive. A pending/queued proposal is not effective Business data. Every Amazon proposal from the native automation/ad hoc tools requires explicit applicable approved KPI target versions, evidence, rationale, expected effect and a represented period.

Version0.2's optional local service remains compatibility-only. Its legacy run/Notion tools are not advertised by a native connection. New native availability is discovered dynamically rather than hard-coding the original single-user rollout.
