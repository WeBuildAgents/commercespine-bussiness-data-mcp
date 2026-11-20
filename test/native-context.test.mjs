import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { parse, Kind, visit } from "graphql";
import { createServer, assertReadOnlyGraphql } from "../dist/server.js";
import { ServiceError } from "../dist/client.js";
import { nativeContextQueries } from "../dist/native-context.js";

async function connect(t, handler) {
  const calls = [];
  const server = createServer({ request: async (...args) => { calls.push(args); return handler(...args); } });
  const client = new Client({ name: "native-context-test", version: "1" });
  const [left, right] = InMemoryTransport.createLinkedPair();
  await server.connect(left); await client.connect(right);
  t.after(async () => { await client.close(); await server.close(); });
  return { client, calls };
}

test("native discovery preserves reference IDs, pagination and compact default in one delegated request", async t => {
  const bundle = { rows: [{ id: "analysis-1", sopIds: ["method-1"], kpiTargetIds: ["target-1"], informationIds: ["information-1"] }], pageInfo: { hasNextPage: true, endCursor: "page-two" } };
  const { client, calls } = await connect(t, async () => ({ data: { automationAnalyses: bundle } }));
  const result = await client.callTool({ name: "ppc_native_analyses", arguments: { accountId: "account-1", id: "analysis-1", after: "page-one", first: 10 } });
  assert.deepEqual(result.structuredContent.result, bundle);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].slice(0, 2), ["POST", "/v1/data/query"]);
  assert.deepEqual(calls[0][2].variables, { input: { accountId: "account-1", id: "analysis-1", includeContext: false, pagination: { first: 10, after: "page-one" } }, includeContext: false });
  assert.equal(calls[0][2].operationName, "PpcNativeAnalyses");
});

test("start and account briefing return opt-in complete linked revisions without creating a run", async t => {
  const analysis = { id: "analysis-1", sopIds: ["method-1"], kpiTargetIds: ["target-1"], informationIds: ["information-1"], linkedContext: {
    sops: [{ id: "method-1", revisionId: "method-v2", revision: 2, body: "Approved method" }],
    kpiTargets: [{ id: "target-1", revisionId: "target-v1", revision: 1, numericValue: "0.2", operator: "lte", unit: "ratio" }],
    information: [{ id: "information-1", revisionId: "info-v3", revision: 3, body: "Client preference", accessToken: "fixture-secret" }]
  } };
  const { client, calls } = await connect(t, async (_method, _path, body) => ({ data: { [body.operationName === "PpcStartRecurringAnalysis" ? "startRecurringAnalysis" : "accountBriefing"]: body.operationName === "PpcStartRecurringAnalysis" ? analysis : { accountId: "account-1", analyses: [analysis] } } }));
  for (const [name, args] of [
    ["ppc_start_recurring_analysis", { analysisId: "analysis-1" }],
    ["ppc_account_briefing", { accountId: "account-1" }]
  ]) {
    const result = await client.callTool({ name, arguments: { ...args, includeContext: true } });
    assert.notEqual(result.isError, true);
    const returned = name === "ppc_start_recurring_analysis" ? result.structuredContent.result : result.structuredContent.result.analyses[0];
    assert.equal(returned.linkedContext.sops[0].revisionId, "method-v2");
    assert.equal(returned.linkedContext.information[0].body, "Client preference");
    assert.doesNotMatch(JSON.stringify(result), /fixture-secret/);
  }
  assert.equal(calls.length, 2);
  for (const [method, path, body] of calls) {
    assert.equal(method, "POST"); assert.equal(path, "/v1/data/query");
    assert.equal(body.variables.includeContext, true); assertReadOnlyGraphql(body.query);
  }
  const tools = (await client.listTools()).tools;
  for (const name of ["ppc_native_analyses", "ppc_start_recurring_analysis", "ppc_account_briefing"]) assert.equal(tools.find(tool => tool.name === name).annotations.readOnlyHint, true);
});

test("fixed native documents always select reference IDs and gate full linked records on includeContext", () => {
  for (const { query, operationName } of Object.values(nativeContextQueries)) {
    assertReadOnlyGraphql(query);
    const ast = parse(query);
    const operations = ast.definitions.filter(node => node.kind === Kind.OPERATION_DEFINITION);
    assert.equal(operations.length, 1); assert.equal(operations[0].name.value, operationName);
    const fields = [];
    visit(ast, { Field(node) { fields.push(node); } });
    for (const name of ["sopIds", "kpiTargetIds", "informationIds"]) assert.ok(fields.some(field => field.name.value === name));
    const linked = fields.find(field => field.name.value === "linkedContext");
    assert.equal(linked.directives[0].name.value, "include");
    assert.equal(linked.directives[0].arguments[0].value.name.value, "includeContext");
    for (const record of linked.selectionSet.selections) {
      for (const name of ["id", "revisionId", "revision", "body", "documentJson"]) assert.ok(record.selectionSet.selections.some(field => field.name.value === name));
    }
  }
});

test("native calls reject partial GraphQL errors and absent bundles without leaking provider diagnostics", async t => {
  let response = { data: { startRecurringAnalysis: { id: "partial" } }, errors: [{ message: "private-provider-detail", extensions: { apiKey: "private-key" } }] };
  const { client, calls } = await connect(t, async () => response);
  for (const value of [response, { data: { startRecurringAnalysis: null } }, {}]) {
    response = value;
    const result = await client.callTool({ name: "ppc_start_recurring_analysis", arguments: { analysisId: "analysis-1" } });
    assert.equal(result.isError, true); assert.match(result.content[0].text, /NATIVE_CONTEXT_UNAVAILABLE/);
    assert.doesNotMatch(JSON.stringify(result), /private-provider-detail|private-key|partial/);
  }
  assert.equal(calls.length, 3);
});

test("account/identity overrides and injected GraphQL arguments are rejected; revoked access is not retried", async t => {
  const { client, calls } = await connect(t, async () => { throw new ServiceError(403, "FORBIDDEN"); });
  for (const args of [
    { accountId: "account-1", userId: "other-user" },
    { accountId: "account-1", apiKey: "should-never-be-accepted" },
    { accountId: "account-1", query: "mutation { approve }" },
    { accountId: "account-1", includeContext: "true" },
    { accountId: "account-1\") { otherAccount }" }
  ]) assert.equal((await client.callTool({ name: "ppc_account_briefing", arguments: args })).isError, true);
  assert.equal(calls.length, 0);
  const result = await client.callTool({ name: "ppc_account_briefing", arguments: { accountId: "account-1" } });
  assert.equal(result.isError, true); assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][2].variables, { accountId: "account-1", includeContext: false });
});
