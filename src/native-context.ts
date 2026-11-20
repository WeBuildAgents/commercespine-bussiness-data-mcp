import { type ApiClient, ServiceError } from "./client.js";

const recordFields = `
  id scopeId scopeKind accountId revisionId revision reviewState completeness
  title body documentJson tags tagIds referencesJson effectiveFrom effectiveTo
`;
const targetFields = `
  ${recordFields}
  sourceEntity metricKey valueType operator numericValue upperValue
  lowerInclusive upperInclusive booleanValue categoricalValue unit currency evaluationJson
`;
const analysisFields = `
  ${recordFields}
  enabled ownerUserId settingsRevision cadence timezone
  sopIds kpiTargetIds informationIds
  linkedContext @include(if: $includeContext) {
    sops { ${recordFields} }
    kpiTargets { ${targetFields} }
    information { ${recordFields} }
  }
`;

// Fixed read-only documents keep the bridge on the existing delegated transport.
// GraphQL variables carry identifiers; retrieved business content is never code.
export const nativeContextQueries = {
  analyses: {
    operationName: "PpcNativeAnalyses", field: "automationAnalyses",
    query: `query PpcNativeAnalyses($input: AutomationInput!, $includeContext: Boolean!) {
      automationAnalyses(input: $input) {
        rows { ${analysisFields} }
        pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
        queryInfo { requestId sourceAsset returnedRows effectiveAccountIds generatedAt }
      }
    }`
  },
  start: {
    operationName: "PpcStartRecurringAnalysis", field: "startRecurringAnalysis",
    query: `query PpcStartRecurringAnalysis($analysisId: ID!, $includeContext: Boolean!) {
      startRecurringAnalysis(analysisId: $analysisId, includeContext: $includeContext) { ${analysisFields} }
    }`
  },
  briefing: {
    operationName: "PpcAccountBriefing", field: "accountBriefing",
    query: `query PpcAccountBriefing($accountId: ID!, $includeContext: Boolean!) {
      accountBriefing(accountId: $accountId, includeContext: $includeContext) {
        accountId analyses { ${analysisFields} }
      }
    }`
  }
} as const;

export async function nativeContextQuery(client: ApiClient, kind: keyof typeof nativeContextQueries, variables: Record<string, unknown>): Promise<unknown> {
  const { query, operationName, field } = nativeContextQueries[kind];
  const response = await client.request("POST", "/v1/data/query", { query, operationName, variables }) as {
    data?: Record<string, unknown>; errors?: unknown[];
  } | null;
  // HTTP 200 can carry GraphQL errors and partial data. Never present that as a complete bundle.
  if (!response || response.errors?.length || !response.data || response.data[field] == null) {
    throw new ServiceError(502, "NATIVE_CONTEXT_UNAVAILABLE");
  }
  return response.data[field];
}
