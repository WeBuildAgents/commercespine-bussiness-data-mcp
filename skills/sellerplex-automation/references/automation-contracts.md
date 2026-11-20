# Native operational contracts · 0.3.0

These tools require the companion Automation run API and migration43. `ppc_capabilities` distinguishes an unavailable API from a legitimately empty assignment list. UUIDs below are placeholders; use returned IDs and fresh persisted request UUIDs.

`ppc_native_run_start`:
```json
{"analysisId":"<analysis UUID>","requestId":"<claim UUID>","scheduledAt":"2026-11-19T12:00:00Z","periodStart":"2026-11-12T00:00:00Z","periodEnd":"2026-11-19T00:00:00Z","timezone":"America/Sao_Paulo","rerunNumber":0,"retry":false}
```
Reporting windows are start-inclusive/end-exclusive instants. A KPI tracking `from`/`to` pair is instead the inclusive date range described by that daily API; do not confuse the two. The scheduler must supply the correct timezone boundaries; this example uses UTC instants illustratively, not São Paulo midnight.

The response contains `data` with `runId`, `occurrenceId`, status, attempt, settings and analysis revisions and `inputSnapshot`. Its snapshot carries `analysis`, `settings`, complete `linkedContext:{sops,information,kpiTargets}`, exact `kpiTargets:[{targetId,revisionId}]`, reporting dates, timezone and claim `requestId`. The run is durable before AI analysis begins.

`ppc_native_proposal_prepare`:
```json
{"runId":"<run UUID>","requestId":"<same claim UUID>","key":"campaign-123-budget","evidence":[{"source":"Commerce Spine","queryId":"<request ID>","periodStart":"...","periodEnd":"...","coverage":"7 of 7 dates","calculationVersion":"budget-protocol-v1"}],"rationale":"Explain the protocol rule and measured gap.","expectedEffect":"Explain the KPI contribution and uncertainty.","proposal":{"entity":"<catalog entity>","actions":["<catalog action>"],"scope":{"amazonAccountId":"<same account>"},"target":{"campaignId":"<returned campaign>"},"items":[{"action":"<catalog action>","actionSchemaVersion":"<catalog version>","parameters":{}}],"kpiTargets":[{"targetId":"<pinned target>","revisionId":"<pinned revision>","contribution":"Why the change should improve this target"}]}}
```
Get the provider entity/action/parameters from the live catalog. The run endpoint checks snapshot targets and current validity before creating a pending proposal and its native link in one transaction. Same occurrence/outcome key + identical request recovers the same proposal; changed payload conflicts. `ppc_ad_hoc_proposal_prepare` uses the same decision fields and provider envelope but omits `runId`/`key` and requires explicit `periodStart`, `periodEnd` and IANA `timezone`, using a stable UUID request ID for an explicitly requested on-demand action.

`ppc_native_run_complete`:
```json
{"runId":"<run UUID>","requestId":"<same claim UUID>","status":"no_action","summary":"No justified change under the approved protocol.","checks":[{"key":"acos","status":"inconclusive","reason":"Zero attributed sales; ratio undefined"}],"sources":[{"entity":"<catalog entity>","queryId":"<request ID>","coverage":"5/7 days","unit":"ratio"}],"errors":[],"report":{"limitations":["Two reporting dates unavailable"],"proposalIds":[]}}
```
Use `partial` instead when missing evidence prevents completion of the prescribed analysis, with a nonempty `errors` entry. `evidenceIds` refers only to existing same-account evidence matching the represented window; direct Data Layer calculations go in checks/sources/report, not fabricated evidence IDs. Read back the report and linked proposal IDs using `ppc_native_run`.

Completion is immutable: identical payload replays succeed; a changed report requires a new explicit attempt/occurrence, not an overwrite. There is no automatic stale lease takeover. Scheduled work may not proceed against an updated context without a new reviewed decision. No run ingestion operation approves business or Amazon changes.
