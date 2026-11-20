import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, assertReadOnlyGraphql } from "../dist/server.js";
import { ServiceClient, serviceOrigin, trustedBrowserUrl, publicResult } from "../dist/client.js";
import { pair } from "../dist/pairing.js";
import { SessionStore } from "../dist/store.js";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createHttpServer } from "node:http";
import { createHash } from "node:crypto";

async function connect(t, handler = async () => ({ ok: true })) {
  const calls = [];
  const server = createServer({ request: async (...args) => { calls.push(args); return handler(...args); } });
  const client = new Client({ name: "test-harness", version: "1.0.0" });
  const [left, right] = InMemoryTransport.createLinkedPair();
  await server.connect(left); await client.connect(right);
  t.after(async () => { await client.close(); await server.close(); });
  return { client, calls };
}

test("real MCP negotiation exposes read/preparation tools but no approval, arbitrary HTTP or n8n retrigger", async t => {
  const { client } = await connect(t);
  const tools = (await client.listTools()).tools;
  assert.ok(tools.length >= 15);
  for (const tool of tools) assert.doesNotMatch(tool.name, /approve|publish|http|retrigger|execute/);
  assert.ok(tools.find(tool => tool.name === "ppc_proposal_prepare"));
  assert.equal((await client.callTool({ name: "approve", arguments: { id: "proposal" } })).isError, true);
  const skill = await client.readResource({ uri: "sellerplex://skills/operate-ppc" });
  assert.match(skill.contents[0].text, /Client → Brand → Account/);
  const release = await client.readResource({ uri: "sellerplex://release" });
  assert.equal(JSON.parse(release.contents[0].text).serviceApiVersion, "v1");
});

test("preparation and review preserve run identity and never call a decision endpoint", async t => {
  const { client, calls } = await connect(t);
  const period = { periodStart: "2026-11-01T00:00:00Z", periodEnd: "2026-11-02T00:00:00Z", timezone: "America/Sao_Paulo" };
  await client.callTool({ name: "ppc_run_start", arguments: { accountId: "account_1", occurrence: "2026-11-02:morning", ...period } });
  await client.callTool({ name: "ppc_run_context", arguments: { runId: "run_1" } });
  await client.callTool({ name: "ppc_result_record", arguments: { runId: "run_1", analysisId: "analysis_1", checkId: "acos", ...period, generatedAt: "2026-11-02T06:00:00Z", calculationVersion: "v1", data: { acos: 0.17 }, evidence: [{ source: "Commerce Spine" }] } });
  await client.callTool({ name: "ppc_proposal_prepare", arguments: { runId: "run_1", analysisId: "analysis_1", key: "run_1:campaign_1:budget", proposal: { action: "BUDGET_UPDATE" }, evidence: [{ resultId: "result_1" }], rationale: "Approved rule recommends adjustment", expectedEffect: "Restore budget pacing" } });
  await client.callTool({ name: "ppc_run_complete", arguments: { runId: "run_1", outcomes: [{ analysisId: "analysis_1", status: "complete", summary: "Prepared proposal" }] } });
  await client.callTool({ name: "ppc_review_batch", arguments: { runId: "run_1" } });
  assert.equal(calls[2][2].producer, "harness");
  assert.deepEqual(calls.map(item => item[1]), ["/v1/runs", "/v1/runs/run_1/context", "/v1/runs/run_1/results", "/v1/runs/run_1/proposals", "/v1/runs/run_1/complete", "/v1/runs/run_1/review"]);
});

test("GraphQL mutations cannot be hidden after a query or in whitespace", async t => {
  assertReadOnlyGraphql("query Q { dataCatalog { id } }");
  assertReadOnlyGraphql("{ dataCatalog { id } }");
  assert.throws(() => assertReadOnlyGraphql("query Q { me } mutation M { approve(id: 1) }"));
  assert.throws(() => assertReadOnlyGraphql("subscription S { actions }"));
  const { client, calls } = await connect(t);
  const result = await client.callTool({ name: "ppc_data_query", arguments: { query: "mutation { approve(id: 1) }", variables: {} } });
  assert.equal(result.isError, true); assert.equal(calls.length, 0);
});

test("invalid periods and path traversal are rejected before reaching the service", async t => {
  const { client, calls } = await connect(t);
  const result = await client.callTool({ name: "ppc_run_start", arguments: { accountId: "a", occurrence: "today", periodStart: "2026-11-03T00:00:00Z", periodEnd: "2026-11-02T00:00:00Z", timezone: "UTC" } });
  assert.equal(result.isError, true);
  const traversal = await client.callTool({ name: "ppc_run_context", arguments: { runId: "../approve" } });
  assert.equal(traversal.isError, true); assert.equal(calls.length, 0);
});

test("responses strip nested credentials before exposing tool data", async t => {
  const { client } = await connect(t, async () => ({ user: { id: "member", accessToken: "hidden" }, token: "hidden", rows: [{ api_key: "hidden", value: 4 }] }));
  const result = await client.callTool({ name: "ppc_identity", arguments: {} });
  assert.doesNotMatch(JSON.stringify(result), /hidden/);
  assert.deepEqual(result.structuredContent.result, { user: { id: "member" }, rows: [{ value: 4 }] });
});

test("service prefixes are preserved, credentials cannot be redirected, writes are not retried", async () => {
  assert.equal(serviceOrigin("https://service.example/ppc/"), "https://service.example/ppc");
  assert.throws(() => serviceOrigin("http://service.example"));
  assert.throws(() => serviceOrigin("https://user:pass@service.example"));
  assert.equal(trustedBrowserUrl("https://service.example/ppc", "/ppc/review/run_1"), "https://service.example/ppc/review/run_1");
  assert.throws(() => trustedBrowserUrl("https://service.example/ppc", "https://evil.example/review"));
  assert.throws(() => trustedBrowserUrl("https://service.example/ppc", "/other-app"));
  let count = 0;
  const client = new ServiceClient("https://service.example/ppc", async () => "session", async (url, options) => {
    count++; assert.equal(url, "https://service.example/ppc/v1/runs"); assert.equal(options.redirect, "error");
    return new Response("secret provider body", { status: 502 });
  });
  await assert.rejects(client.request("POST", "/v1/runs", {}), error => !error.message.includes("secret"));
  assert.equal(count, 1);
});

test("pairing binds a random verifier, polls pending state and stores session without exposing token", async () => {
  let challenge, verifier, stored, shown, calls = 0;
  await pair({ origin: "http://localhost:3900/ppc", store: { save: async value => { stored = value; } }, showUrl: async url => { shown = url; }, pause: async () => {}, fetcher: async (url, options) => {
    calls++;
    if (url.endsWith("/v1/pairings")) {
      challenge = JSON.parse(options.body).challenge;
      return Response.json({ id: "pair_1", verificationUrl: "/ppc/pair/pair_1", expiresAt: new Date(Date.now() + 60_000).toISOString() });
    }
    verifier = JSON.parse(options.body).verifier;
    return calls === 2 ? new Response(null, { status: 202 }) : Response.json({ token: "only-local", user: { id: "u" } });
  } });
  assert.equal(challenge, createHash("sha256").update(verifier).digest("base64url"));
  assert.equal(stored.token, "only-local"); assert.equal(stored.origin, "http://localhost:3900/ppc");
  assert.equal(shown, "http://localhost:3900/ppc/pair/pair_1"); assert.equal(calls, 3);
});

test("pairing rejects a provider-supplied foreign browser URL before opening it", async () => {
  let opened = false;
  await assert.rejects(pair({ origin: "https://service.example", store: { save: async () => {} }, showUrl: async () => { opened = true; }, fetcher: async () => Response.json({ id: "pair", verificationUrl: "https://evil.example", expiresAt: new Date(Date.now() + 60_000).toISOString() }) }));
  assert.equal(opened, false);
});

test("session storage round-trips and Windows does not save a plaintext token", async t => {
  const directory = await mkdtemp(join(tmpdir(), "ppc-mcp-test-"));
  t.after(() => { assert.equal(dirname(resolve(directory)), resolve(tmpdir())); return rm(directory, { recursive: true, force: true }); });
  const store = new SessionStore(directory);
  const session = { origin: "https://service.example/ppc", token: "test-only-session-token", savedAt: "2026-11-15T00:00:00Z" };
  assert.equal(await store.load(), undefined);
  await store.save(session); assert.deepEqual(await store.load(), session);
  if (process.platform === "win32") assert.doesNotMatch(await readFile(join(directory, "session.json"), "utf8"), /test-only-session-token/);
  await store.clear(); assert.equal(await store.load(), undefined);
});

test("compiled CLI speaks MCP over stdio and authenticates only to the configured service", async t => {
  const directory = await mkdtemp(join(tmpdir(), "ppc-mcp-stdio-"));
  const service = createHttpServer((req, res) => {
    assert.equal(req.url, "/v1/me"); assert.equal(req.headers.authorization, "Bearer fixture-session");
    res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ id: "member_1", role: "MEMBER", token: "must-not-reach-agent" }));
  });
  await new Promise(resolve => service.listen(0, "127.0.0.1", resolve));
  const port = service.address().port;
  const store = new SessionStore(directory);
  await store.save({ origin: `http://127.0.0.1:${port}`, token: "fixture-session", savedAt: new Date().toISOString() });
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL("../dist/cli.js", import.meta.url)), "serve", "--state-dir", directory], stderr: "pipe" });
  const client = new Client({ name: "stdio-pilot", version: "1" });
  t.after(async () => {
    await client.close(); await new Promise(resolve => service.close(resolve));
    assert.equal(dirname(resolve(directory)), resolve(tmpdir())); await rm(directory, { recursive: true, force: true });
  });
  await client.connect(transport);
  const result = await client.callTool({ name: "ppc_identity", arguments: {} });
  assert.deepEqual(result.structuredContent.result, { id: "member_1", role: "MEMBER" });
});
