import assert from "node:assert/strict";
import test from "node:test";
import * as listRequest from "@/lib/list-request";
import { updateTeamUserSchema } from "../src/validations/users";
import { loadModule } from "./helpers/load-module";

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
const session = { user: { userId: "actor", roles: [] } };
const next = { NextResponse: { json: Response.json } };
const guards = {
  ApiError,
  getAuthenticatedSession: async () => session,
  handleApiError: (error: unknown) =>
    error instanceof ApiError
      ? Response.json({ error: error.message }, { status: error.status })
      : null,
};
const base = {
  "next/server": next,
  "@/lib/api-guard": guards,
  "@/lib/logger": { error() {}, debug() {} },
  "@/lib/utils": {
    handlePrismaError: (error: Error) => ({ message: error.message }),
  },
  "@/types": {
    Roles: { Admin: "Admin" },
    ChangeAction: { UPDATED: "UPDATED" },
  },
};
type IdRoute = {
  DELETE: (
    req: Request,
    ctx: { params: Promise<{ userId: string }> },
  ) => Promise<Response>;
};
type UserRoute = IdRoute & {
  GET: (
    req: Request,
    ctx: { params: Promise<{ userId: string }> },
  ) => Promise<Response>;
  PATCH: (
    req: Request,
    ctx: { params: Promise<{ userId: string }> },
  ) => Promise<Response>;
};
type GetRoute = { GET: (req: Request) => Promise<Response> };

test("user removal rejects mixed scopes; authorized single scope still works", async () => {
  const calls: string[] = [];
  let ownerId = "owner";
  const route = loadModule<IdRoute>("src/app/api/users/[userId]/route.ts", {
    ...base,
    "@/lib/prisma": {
      teams: { findFirst: async () => ({ ownerId }) },
      user: { findFirst: async () => ({ id: "victim" }) },
    },
    "@/lib/api-guard": {
      ...guards,
      verifyTeamAccess: async () => calls.push("team"),
      verifyOrganizationAccess: async (
        _organizationId: string,
        options: { requireTeamAdmin?: boolean },
      ) => calls.push(`org:${String(options.requireTeamAdmin)}`),
    },
    "@/services/users": { deleteUser: async () => calls.push("delete") },
    "@/validations/users": {
      updateTeamUserSchema: { parse: (body: object) => body },
    },
  });
  const remove = (body: object) =>
    route.DELETE(
      new Request("https://test.invalid", {
        method: "DELETE",
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ userId: "victim" }) },
    );
  assert.equal(
    (await remove({ teamId: "team-a", organizationId: "org-b" })).status,
    400,
  );
  assert.deepEqual(calls, []);
  assert.equal((await remove({ teamId: "team-a" })).status, 200);
  assert.deepEqual(calls, ["team", "delete"]);
  ownerId = "victim";
  assert.equal((await remove({ teamId: "team-a" })).status, 409);
  assert.deepEqual(calls, ["team", "delete", "team"]);
  assert.equal((await remove({ organizationId: "org-a" })).status, 200);
  assert.deepEqual(calls, ["team", "delete", "team", "org:true", "delete"]);
});

test("team user profiles require an explicit admin scope for reads and writes", async () => {
  const calls: string[] = [];
  const route = loadModule<UserRoute>("src/app/api/users/[userId]/route.ts", {
    ...base,
    "@/lib/prisma": {},
    "@/lib/api-guard": {
      ...guards,
      verifyTeamAccess: async (
        teamId: string,
        options: { requireAdmin?: boolean },
      ) => {
        calls.push(`guard:${teamId}:${String(options.requireAdmin)}`);
        return session;
      },
      verifyOrganizationAccess: async () => undefined,
    },
    "@/services/users": {
      getTeamUserById: async (userId: string, teamId: string) => {
        calls.push(`read:${userId}:${teamId}`);
        return teamId === "team-a" ? { id: userId } : null;
      },
      updateTeamUser: async (
        userId: string,
        body: { teamId: string },
        actor: { userId?: string },
      ) => {
        calls.push(`write:${userId}:${body.teamId}`);
        calls.push(`actor:${actor.userId}`);
      },
    },
    "@/validations/users": {
      updateTeamUserSchema: { parse: (body: object) => body },
    },
  });
  const context = { params: Promise.resolve({ userId: "target" }) };

  assert.equal(
    (
      await route.GET(
        new Request("https://test.invalid/api/users/target"),
        context,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await route.GET(
        new Request("https://test.invalid/api/users/target?teamId=team-a"),
        context,
      )
    ).status,
    200,
  );
  assert.deepEqual(calls, ["guard:team-a:true", "read:target:team-a"]);

  calls.length = 0;
  const patchResponse = await route.PATCH(
    new Request("https://test.invalid/api/users/target", {
      method: "PATCH",
      body: JSON.stringify({ teamId: "team-a" }),
    }),
    context,
  );
  assert.equal(patchResponse.status, 200);
  assert.deepEqual(calls, [
    "guard:team-a:true",
    "write:target:team-a",
    "actor:actor",
  ]);
});

test("team user updates reject sign-in email changes", () => {
  const result = updateTeamUserSchema.safeParse({
    teamId: "11111111-1111-4111-8111-111111111111",
    groupIds: [],
    email: "attacker@example.org",
  });
  assert.equal(result.success, false);
});

test("group assignment rejects users outside the selected team", async () => {
  let membershipWrites = 0;
  const service = loadModule<{
    addUsersToGroup: (input: {
      groupId: string;
      teamId: string;
      userIds: string[];
    }) => Promise<void>;
  }>("src/services/groups/index.ts", {
    "@/constants/contact-submodules": { CONTACT_SUBMODULE_FIELDS: {} },
    "@/types": {
      APP_MODULES: ["CRM", "FUNDING", "ADMIN"],
      DEFAULT_TEAM_MODULES: ["CRM", "FUNDING"],
    },
    "@/lib/prisma": {
      group: {
        findFirst: async () => ({ id: "group-a", isDefaultGroup: false }),
      },
      user: {
        findMany: async () => [{ id: "member" }],
      },
      userGroup: {
        findMany: async () => [],
        createMany: async () => {
          membershipWrites++;
        },
      },
    },
  });

  await assert.rejects(
    service.addUsersToGroup({
      groupId: "group-a",
      teamId: "team-a",
      userIds: ["member", "outsider"],
    }),
    /do not belong to this team/,
  );
  assert.equal(membershipWrites, 0);
});

test("group creation rejects initial users outside the selected team", async () => {
  let groupWrites = 0;
  const transactionClient = {
    user: {
      findMany: async () => [{ id: "member" }],
    },
    group: {
      create: async () => {
        groupWrites++;
        return {};
      },
    },
  };
  const service = loadModule<{
    createGroup: (input: {
      teamId: string;
      name: string;
      userIds: string[];
    }) => Promise<void>;
  }>("src/services/groups/index.ts", {
    "@/constants/contact-submodules": { CONTACT_SUBMODULE_FIELDS: {} },
    "@/types": {
      APP_MODULES: ["CRM", "FUNDING", "ADMIN"],
      DEFAULT_TEAM_MODULES: ["CRM", "FUNDING"],
    },
    "@/lib/prisma": {
      teams: {
        findUnique: async () => ({ modules: ["CRM", "FUNDING"] }),
      },
      $transaction: async (
        callback: (client: typeof transactionClient) => Promise<unknown>,
      ) => callback(transactionClient),
    },
  });

  await assert.rejects(
    service.createGroup({
      teamId: "team-a",
      name: "New group",
      userIds: ["member", "outsider"],
    }),
    /do not belong to this team/,
  );
  assert.equal(groupWrites, 0);
});

test("team user updates reject group IDs from another team before writing", async () => {
  let profileWrites = 0;
  const transactionClient = {
    teams: {
      findUnique: async () => ({ ownerId: "owner" }),
    },
    user: {
      findFirst: async () => ({ id: "target" }),
      update: async () => {
        profileWrites++;
      },
    },
    group: {
      findMany: async () => [
        { id: "group-a", name: "Members", isDefaultGroup: false },
      ],
    },
  };
  const service = loadModule<{
    updateTeamUser: (
      userId: string,
      input: {
        teamId: string;
        groupIds: string[];
      },
      actor: { userId?: string; roles?: string[] },
    ) => Promise<void>;
  }>("src/services/users/index.ts", {
    "@/lib/prisma": {
      $transaction: async (
        callback: (client: typeof transactionClient) => Promise<unknown>,
      ) => callback(transactionClient),
    },
    "@/services/groups": { ensureDefaultGroup: async () => undefined },
    "@/types": {
      DEFAULT_TEAM_MODULES: ["CRM", "FUNDING"],
      Roles: { Admin: "Admin" },
    },
    "@/validations/users": {},
  });

  await assert.rejects(
    service.updateTeamUser(
      "target",
      {
        teamId: "team-a",
        groupIds: ["group-a", "foreign-group"],
      },
      { userId: "actor", roles: [] },
    ),
    /do not belong to this team/,
  );
  assert.equal(profileWrites, 0);
});

test("team admins cannot edit another user's global profile", async () => {
  let transactions = 0;
  const service = loadModule<{
    updateTeamUser: (
      userId: string,
      input: { teamId: string; name?: string; groupIds: string[] },
      actor: { userId?: string; roles?: string[] },
    ) => Promise<void>;
  }>("src/services/users/index.ts", {
    "@/lib/prisma": {
      $transaction: async () => {
        transactions++;
      },
    },
    "@/services/groups": { ensureDefaultGroup: async () => undefined },
    "@/types": {
      DEFAULT_TEAM_MODULES: ["CRM", "FUNDING"],
      Roles: { Admin: "Admin" },
    },
    "@/validations/users": {},
  });

  await assert.rejects(
    service.updateTeamUser(
      "target",
      { teamId: "team-a", name: "Changed Name", groupIds: [] },
      { userId: "team-admin", roles: [] },
    ),
    /Only this user or a global administrator/,
  );
  assert.equal(transactions, 0);
});

test("group details require team admin access before loading users", async () => {
  const calls: string[] = [];
  const route = loadModule<{
    GET: (
      req: Request,
      ctx: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
  }>("src/app/api/groups/[id]/route.ts", {
    ...base,
    "@/lib/api-guard": {
      ...guards,
      verifyTeamAccess: async (
        teamId: string,
        options: { requireAdmin?: boolean },
      ) => calls.push(`guard:${teamId}:${String(options.requireAdmin)}`),
    },
    "@/services/groups": {
      getGroupWithUsers: async () => {
        calls.push("read");
        return { id: "group-a" };
      },
    },
    "@/validations/groups": {},
  });

  const response = await route.GET(
    new Request(
      "https://test.invalid/api/groups/group-a?teamId=team-a&includeUsers=true",
    ),
    { params: Promise.resolve({ id: "group-a" }) },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["guard:team-a:true", "read"]);
});

test("donation user lookup rejects a funding request from another team", async () => {
  let queried = false;
  let requestTeam = "team-b";
  const route = loadModule<GetRoute>("src/app/api/users/route.ts", {
    ...base,
    "@/lib/list-request": listRequest,
    "@/constants/app": {},
    "@/lib/nodemailer": {},
    "@/validations/organizations": {},
    "@/services/teams": { ensureTeamOwner: async () => "owner" },
    "@/services/users": {
      getUsersForDonation: async () => {
        queried = true;
        return [];
      },
    },
    "@/lib/api-guard": {
      ...guards,
      verifyTeamAccess: async () => session,
      verifyFundingRequestAccess: async () => ({
        fundingRequest: { teamId: requestTeam },
        organizationId: "org-b",
      }),
    },
  });
  const req = new Request(
    "https://test.invalid/api/users?teamId=team-a&fundingRequestId=request-b",
  );
  assert.equal((await route.GET(req)).status, 404);
  assert.equal(queried, false);
  requestTeam = "team-a";
  assert.equal((await route.GET(req)).status, 200);
  assert.equal(queried, true);
});

test("agreement pages authorize the agreement and reject mismatched parent scopes", async () => {
  for (const kind of ["teams", "organizations"]) {
    const relative =
      kind === "teams"
        ? "src/app/teams/[teamId]/funding/donation-agreements/[id]/page.tsx"
        : "src/app/organizations/[organizationId]/donation-agreements/[id]/page.tsx";
    let reads = 0;
    let allowed = false;
    const page = loadModule<{
      default: (props: { params: Promise<object> }) => Promise<unknown>;
    }>(relative, {
      "next/navigation": {
        notFound: () => {
          throw new Error("not found");
        },
        redirect: () => {
          throw new Error("redirect");
        },
      },
      "@/lib/api-guard": {
        verifyDonationAgreementAccess: async () => ({
          session,
          teamId: allowed ? "team-a" : "team-b",
          organizationId: allowed ? "org-a" : "org-b",
        }),
      },
      "@/components/forms/sign-donation-agreement": {
        __esModule: true,
        default: () => null,
      },
      "@/components/records/record-page": { RecordTopBar: () => null },
      "@/services/donation-agreement": {
        getDonationAgreementById: async () => {
          reads++;
          return { id: "agreement" };
        },
      },
    });
    const props = {
      params: Promise.resolve({
        id: "agreement",
        teamId: "team-a",
        organizationId: "org-a",
      }),
    };
    await assert.rejects(page.default(props), /not found/);
    assert.equal(reads, 0);
    allowed = true;
    await page.default(props);
    assert.equal(reads, 1);
  }
});

test("history denies hidden contacts and removes restricted values and metadata", async () => {
  let visible = false;
  let logReads = 0;
  const fields = loadModule<{
    isFieldVisible: (
      key: string,
      map: Map<string, Set<string>>,
      groups: string[],
    ) => boolean;
  }>("src/services/contacts/field-access.ts", { "@/lib/prisma": {} });
  const service = loadModule<{
    getContactChangeLogs: (
      id: string,
      team: string,
      user: string,
    ) => Promise<
      Array<{ fieldName?: string; oldValue?: string; metadata?: unknown }>
    >;
  }>("src/services/contact-change-logs/index.ts", {
    ...base,
    "@/services/contacts/access": {
      getContactVisibility: async () => ({
        where: { teamId: "team-a" },
        userGroupIds: [],
      }),
    },
    "@/services/contacts/field-access": {
      ...fields,
      getContactFieldAccessMap: async () =>
        new Map([
          ["gender", new Set(["restricted"])],
          ["private.key", new Set(["restricted"])],
        ]),
    },
    "@/lib/prisma": {
      contact: { findFirst: async () => (visible ? { id: "contact" } : null) },
      contactChangeLog: {
        findMany: async () => {
          logReads++;
          return [
            { fieldName: "gender", oldValue: "private" },
            { fieldName: "profileAttribute.private.key", oldValue: "private" },
            {
              fieldName: "name",
              oldValue: "Alice",
              metadata: { gender: "private" },
            },
            {
              fieldName: "merge",
              oldValue: "private",
              metadata: { gender: "private" },
            },
          ];
        },
      },
    },
  });
  await assert.rejects(
    service.getContactChangeLogs("contact", "team-a", "actor"),
    /Contact not found/,
  );
  assert.equal(logReads, 0);
  visible = true;
  const logs = await service.getContactChangeLogs("contact", "team-a", "actor");
  assert.deepEqual(
    logs.map((log) => log.fieldName),
    ["name", "merge"],
  );
  assert.equal(logs[0].oldValue, "Alice");
  assert.equal(logs[1].oldValue, undefined);
  assert(logs.every((log) => log.metadata === undefined));
});

test("tag attribute updates reject hidden contacts before writing", async () => {
  let contactVisible = false;
  let catalogWrites = 0;
  let contactWrites = 0;
  const transactionClient = {
    tag: {
      createMany: async () => {
        catalogWrites++;
      },
    },
    contact: {
      findFirst: async () => (contactVisible ? { id: "contact-a" } : null),
      update: async () => {
        contactWrites++;
      },
    },
  };
  const service = loadModule<{
    updateEntityTags: (
      context: { teamId: string; userId: string; roles: string[] },
      entityType: "CONTACT",
      entityId: string,
      tags: string[],
    ) => Promise<string[]>;
  }>("src/services/tags/index.ts", {
    "@/lib/api-guard": { ApiError },
    "@/lib/tags": {
      normalizeTagNames: (names: string[]) =>
        [...new Set(names.map((name) => name.toLowerCase()))].sort(),
      normalizeTagSearchQuery: (query: string) => query.toLowerCase(),
    },
    "@/lib/prisma": {
      $transaction: async (
        callback: (client: typeof transactionClient) => Promise<unknown>,
      ) => callback(transactionClient),
    },
    "@/services/contacts/access": {
      getContactVisibility: async () => ({
        where: { teamId: "team-a", deletedAt: null },
        userGroupIds: [],
      }),
    },
    "@/services/contacts/submodule-access": {
      getAllowedContactSubmodules: async () => [],
    },
  });
  const update = () =>
    service.updateEntityTags(
      { teamId: "team-a", userId: "actor", roles: [] },
      "CONTACT",
      "contact-a",
      ["Berlin"],
    );

  await assert.rejects(update(), /Record not found/);
  assert.equal(catalogWrites, 0);
  assert.equal(contactWrites, 0);
  contactVisible = true;
  assert.deepEqual(await update(), ["berlin"]);
  assert.equal(catalogWrites, 1);
  assert.equal(contactWrites, 1);
});

test("public limiter expires old clients, bounds storage, and preserves active quotas", () => {
  let now = 0;
  let entries: Map<string, unknown> | undefined;
  class TrackingMap extends Map<string, unknown> {
    constructor() {
      super();
      entries = this;
    }
  }
  const limiter = loadModule<{
    enforcePublicRateLimit: (
      req: Request,
      scope: string,
      options: { limit: number; windowMs: number },
    ) => void;
  }>(
    "src/lib/public-rate-limit.ts",
    { "@/lib/api-guard": guards },
    { Map: TrackingMap, Date: { now: () => now } },
  );
  const hit = (client: string) =>
    limiter.enforcePublicRateLimit(
      new Request("https://test.invalid", { headers: { "x-real-ip": client } }),
      "test",
      { limit: 1, windowMs: 1000 },
    );
  hit("one");
  assert.throws(() => hit("one"), /Too many requests/);
  now = 2000;
  for (let i = 0; i < 10000; i++) hit(`client-${i}`);
  assert.equal(entries?.size, 10000);
  assert.throws(() => hit("overflow"), /Too many requests/);
  assert.throws(() => hit("client-0"), /Too many requests/);
  now = 4000;
  hit("fresh");
  assert.equal(entries?.size, 1);
});

test("multipart reader stops oversized streaming bodies and accepts a bounded upload", async () => {
  const { readBoundedFormData } = loadModule<{
    readBoundedFormData: (req: Request, max: number) => Promise<FormData>;
  }>("src/lib/bounded-request-body.ts", { "@/lib/api-guard": guards });
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(8));
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request("https://test.invalid", {
    method: "POST",
    body: stream,
    duplex: "half",
  } as RequestInit);
  await assert.rejects(readBoundedFormData(request, 10), /too large/);
  assert.equal(cancelled, true);
  const form = new FormData();
  form.set("teamId", "team-a");
  form.set("file", new Blob(["signed"]), "signed.pdf");
  const parsed = await readBoundedFormData(
    new Request("https://test.invalid", { method: "POST", body: form }),
    2048,
  );
  assert.equal(parsed.get("teamId"), "team-a");
  assert.equal(await (parsed.get("file") as File).text(), "signed");
  const oversized = new Request("https://test.invalid", {
    method: "POST",
    headers: { "content-length": "3000" },
    body: "x",
  });
  await assert.rejects(readBoundedFormData(oversized, 100), /too large/);
});

test("public upload is throttled before reading multipart bytes", async () => {
  let read = false;
  const route = loadModule<{ POST: (req: Request) => Promise<Response> }>(
    "src/app/api/public/upload/route.ts",
    {
      ...base,
      "@/lib/prisma": {},
      "@/services/file/s3-service": {},
      "@/lib/bounded-request-body": {
        readBoundedFormData: async () => {
          read = true;
          return new FormData();
        },
      },
      "@/lib/public-rate-limit": {
        enforcePublicRateLimit: () => {
          throw new ApiError(429, "limited");
        },
      },
    },
  );
  assert.equal(
    (await route.POST(new Request("https://test.invalid"))).status,
    429,
  );
  assert.equal(read, false);
});

test("signing requires a stored, owned upload and an unsigned signer", async () => {
  const schemas = loadModule<{
    updateDonationAgreementSchema: {
      parse: (x: unknown) => { file: string; pendingUploadId: string };
    };
  }>("src/validations/donation-agreement.ts", {});
  assert.throws(() => schemas.updateDonationAgreementSchema.parse({}));
  assert.throws(() =>
    schemas.updateDonationAgreementSchema.parse({
      file: "",
      pendingUploadId: "bad",
    }),
  );
  const upload = {
    file: "signed.pdf",
    pendingUploadId: "11111111-1111-4111-8111-111111111111",
  };
  let stored = true;
  let owned = true;
  let unsigned = true;
  let fileWrites = 0;
  let consumed = 0;
  let advanced = 0;
  const fundingStatus = {
    WaitingForSignature: "WaitingForSignature",
    FundsDisbursing: "FundsDisbursing",
  };
  const donation = {
    teamId: "team-a",
    file: { id: "file-a" },
    organization: { id: "org-a" },
    fundingRequest: { id: "request-a", status: "WaitingForSignature" },
  };
  const tx = {
    donationAgreement: { findUnique: async () => donation },
    donationAgreementSignature: {
      updateMany: async (input: { where: { signedAt: null } }) => {
        assert.equal(input.where.signedAt, null);
        return { count: unsigned ? 1 : 0 };
      },
      count: async () => 0,
    },
    file: {
      update: async () => {
        fileWrites++;
      },
    },
    fundingRequest: {
      update: async () => {
        advanced++;
      },
    },
  };
  const service = loadModule<{
    updateDonationAgreement: (
      id: string,
      input: typeof upload,
      user: string,
    ) => Promise<unknown>;
  }>("src/services/donation-agreement/index.ts", {
    ...base,
    "@/types": { FundingStatus: fundingStatus },
    "@/lib/prisma": {
      ...tx,
      $transaction: async (
        callback: (db: typeof tx) => Promise<unknown>,
        options: { isolationLevel: string },
      ) => {
        assert.equal(options.isolationLevel, "Serializable");
        return callback(tx);
      },
    },
    "@/services/file/pending-uploads": {
      assertPendingUploadsAvailable: async (input: {
        userId: string;
        teamId: string;
      }) => {
        assert.equal(input.userId, "actor");
        assert.equal(input.teamId, "team-a");
        if (!owned) throw new Error("not owned");
      },
      consumePendingUploads: async () => {
        consumed++;
      },
    },
    "@/services/file/s3-service": {
      assertStoredFileExists: async () => {
        if (!stored) throw new Error("missing file");
      },
    },
  });
  owned = false;
  await assert.rejects(
    service.updateDonationAgreement("agreement", upload, "actor"),
    /not owned/,
  );
  owned = true;
  stored = false;
  await assert.rejects(
    service.updateDonationAgreement("agreement", upload, "actor"),
    /missing file/,
  );
  stored = true;
  unsigned = false;
  await assert.rejects(
    service.updateDonationAgreement("agreement", upload, "actor"),
    /unsigned signer/,
  );
  assert.equal(fileWrites, 0);
  assert.equal(consumed, 0);
  assert.equal(advanced, 0);
  unsigned = true;
  await service.updateDonationAgreement(
    "agreement",
    schemas.updateDonationAgreementSchema.parse(upload),
    "actor",
  );
  assert.equal(fileWrites, 1);
  assert.equal(consumed, 1);
  assert.equal(advanced, 1);
});
