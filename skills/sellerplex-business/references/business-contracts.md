# Native Business commands · 0.3.0

Use tools to resolve current IDs, revisions, shared definitions and catalog metrics. Every ordinary command is a full replacement; absent existing content can be lost if you omit it. Examples use placeholders, not usable IDs.

## Rich SOP or Business Information
```json
{"entity":"business_sop","action":"create","parameters":{"operation":"create","scopeId":null,"title":"Budget review","document":{"format":"business-v1","properties":[{"definitionId":"<property UUID>","label":"Owner","value":"Account team"}],"blocks":[{"type":"heading_1","content":[{"text":"Weekly review"}]},{"type":"paragraph","content":[{"text":"Follow the approved limits.","bold":true,"underline":true}]},{"type":"table","content":[],"headerRow":true,"rows":[[[{"text":"Case"}],[{"text":"Action"}]],[[{"text":"Missing evidence"}],[{"text":"Report inconclusive"}]]]}]},"tagIds":["<tag UUID>"],"tags":["budget-management"],"references":[{"title":"Source","url":"https://example.com/source"}],"effectiveFrom":"2026-11-19T00:00:00Z","effectiveTo":null,"completeness":"complete","decision":{"what":"Create the procedure","evidence":"User supplied operating rule","rationale":"Keep changes aligned to approved policy","expectedEffect":"Consistent account reviews"},"requestId":"<stable UUID>"}}
```
`scopeId:null` is allowed for organization-wide SOPs; scoped information must choose an actual scope. Revising uses `action/operation:'revise'`, `targetId` and `baseRevision`. Preserve existing property values, nested children, references and tags. Inline styles: `bold`, `italic`, `underline`, `strike`, `code`, `href` (HTTP/S). Block types: `paragraph`, `heading_1/2/3`, `bullet`, `numbered`, `quote`, `callout`, `code`, `divider`, `table`, `todo`, `toggle`, `attachment`; `children` nests blocks, `checked` records tasks, table `rows` contains row→cell→inline-span arrays with optional `headerRow`/`headerColumn`.

## Recurring definition and settings

An analysis `upsert` takes `{scopeId:<canonical account ID>,title,body,document?,sopIds,kpiTargetIds,informationIds,cadence?,timezone?,requestId}`. Revising supplies `analysisId` + definition `baseRevision`. Structured `document` and `body` must describe the same plain text when both are present. Its links are explicit; the server pins approved revisions. New definitions remain disabled/unassigned.

`analysis_settings/set` takes an ordinary command with `operation:'set'`, `targetId:<analysis ID>`, `baseRevision:<current settings revision>`, `settings:{enabled,ownerUserId}`, decision and request ID. Definition revision and settings revision are different counters.

## Other entities

- Scope: `scope:{kind:'client'|'brand'|'account'|'exception',displayName,parentId?,id?,applicability?}`. Only brand/account creation supplies `id`, using an existing canonical source identity. Exception needs an account parent and explicit conditions. Parent/canonical identity is fixed.
- KPI: ordinary rich document plus `kpi:{sourceEntity,metricKey,valueType:'numeric',operator:'lt'|'lte'|'gt'|'gte'|'eq'|'between',numericValue,unit,currency?,upperValue?,lowerInclusive?,upperInclusive?,evaluation:{...}}`. Choose entity, metric and units from `ppc_kpi_catalog`; `between` needs both bounds/inclusivity. Evaluation and validity are separate from source dates.
- Evidence check: ordinary rich document plus `check:{sourceKey,checkKey,checkRevision,enabled,workflowId?,cadence?,timezone?}`. Approval updates the check definition; it does not deploy or invoke n8n.
- Archive: `operation:'archive'`, `targetId`, `baseRevision`, decision and request ID. Preview dependencies; preserve history. Analysis archive uses the governed ordinary archive command, not an upsert with empty content.

`ppc_native_business_proposal` returns current `proposalVersion`/`payloadHash`, versions, items and review content. To edit/cancel pending work supply `expectedVersion` and `payloadHash` from the latest read. `ppc_review_prepare` prepares human review; no tool makes an approval/rejection/keep decision. Approval takes effect only after the exact version is approved by a permitted human and the Action worker commits it.

Catalog CRUD is the only immediate authoring exception. `ppc_metadata_create` deduplicates names; use returned `id`, then optimistic `version` for rename/archive. Values belong to each document. Old name-only snapshots remain readable; explicit IDs must belong to the same organization and correct definition kind.
