import assert from "node:assert/strict";
import test from "node:test";
import * as listRequest from "@/lib/list-request";
import { FundingStatus } from "@/types";
import { loadModule } from "./helpers/load-module";

/*
  The funding write routes must not reach a service that writes unless the
  input is valid and the caller may act on that funding request.
*/

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type Handler = (
  request: Request,
  context?: { params: Promise<{ id: string }> },
) => Promise<{ status: number; body: unknown }>;

const nextServer = {
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      body,
    }),
  },
};

const apiGuard = (allowed: () => boolean, calls: string[]) => ({
  ApiError,
  handleApiError: (error: unknown) =>
    error instanceof ApiError ? { status: error.status, body: {} } : null,
  verifyFundingRequestAccess: async (id: string) => {
    calls.push(`access:${id}`);
    if (!allowed()) throw new ApiError(403, "Forbidden");
    return { teamId: "team-a" };
  },
  requireGlobalAdmin: async () => undefined,
  verifyOrganizationAccess: async () => undefined,
  verifyTeamAccess: async () => undefined,
});

const REQUEST_ID = "5f0c6f4e-8f0e-4a8e-9a43-3a6a1f1c2b10";

const post = (body: unknown) =>
  new Request("http://localhost/api", {
    method: "POST",
    body: JSON.stringify(body),
  });

test("payouts: invalid amounts and ids never reach the ledger", async () => {
  const calls: string[] = [];
  const route = loadModule<{ POST: Handler }>(
    "src/app/api/transactions/route.ts",
    {
      "next/server": nextServer,
      "@/lib/api-guard": apiGuard(() => true, calls),
      "@/lib/utils": { handlePrismaError: (error: unknown) => String(error) },
      "@/lib/list-request": listRequest,
      "@/services/transactions": {
        createTransaction: async () => calls.push("createTransaction"),
        getTransactions: async () => [],
      },
    },
  );

  for (const body of [
    { amount: 0, fundingRequestId: REQUEST_ID },
    { amount: -5, fundingRequestId: REQUEST_ID },
    { amount: "lots", fundingRequestId: REQUEST_ID },
    { amount: 10, fundingRequestId: "not-a-uuid" },
    { fundingRequestId: REQUEST_ID },
  ]) {
    const response = await route.POST(post(body));
    assert.notEqual(response.status, 200, JSON.stringify(body));
  }
  assert.deepEqual(calls, []);
});

test("payouts: only callers with access to the request reach the ledger", async () => {
  let allowed = false;
  const calls: string[] = [];
  const route = loadModule<{ POST: Handler }>(
    "src/app/api/transactions/route.ts",
    {
      "next/server": nextServer,
      "@/lib/api-guard": apiGuard(() => allowed, calls),
      "@/lib/utils": { handlePrismaError: (error: unknown) => String(error) },
      "@/lib/list-request": listRequest,
      "@/services/transactions": {
        createTransaction: async () => {
          calls.push("createTransaction");
          return { id: "t1" };
        },
        getTransactions: async () => [],
      },
    },
  );

  const body = { amount: 25, fundingRequestId: REQUEST_ID };
  assert.equal((await route.POST(post(body))).status, 403);
  assert.deepEqual(calls, [`access:${REQUEST_ID}`]);

  allowed = true;
  assert.equal((await route.POST(post(body))).status, 200);
  assert.deepEqual(calls, [
    `access:${REQUEST_ID}`,
    `access:${REQUEST_ID}`,
    "createTransaction",
  ]);
});

test("status changes: unknown statuses and denied callers change nothing", async () => {
  let allowed = true;
  const calls: string[] = [];
  const route = loadModule<{ PUT: Handler }>(
    "src/app/api/funding-requests/[id]/status/route.ts",
    {
      "next/server": nextServer,
      "@/constants": { EMAIL_TEMPLATES_TYPES: {} },
      "@/lib/api-guard": apiGuard(() => allowed, calls),
      "@/lib/nodemailer": { sendEmail: async () => undefined },
      "@/lib/utils": { handlePrismaError: (error: unknown) => String(error) },
      "@/services/email-templates": {
        getEmailTemplateByType: async () => null,
      },
      "@/services/funding-request": {
        updateFundingRequestStatus: async () => {
          calls.push("updateStatus");
          return { status: FundingStatus.Accepted, organization: {} };
        },
      },
      "@/types": { FundingStatus },
    },
  );
  const put = (body: unknown) =>
    route.PUT(
      new Request("http://localhost/api", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: REQUEST_ID }) },
    );

  assert.notEqual((await put({ status: "Paid" })).status, 200);
  assert.notEqual(
    (await put({ status: FundingStatus.Accepted, donationId: "x" })).status,
    200,
  );
  assert.deepEqual(calls, []);

  allowed = false;
  assert.equal((await put({ status: FundingStatus.Accepted })).status, 403);
  assert.deepEqual(calls, [`access:${REQUEST_ID}`]);
});
