import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { FundingStatus } from "@/types";
import {
  createFundingRequest,
  createUser,
  db,
  disconnect,
  loadService,
  resetDatabase,
} from "./helpers";

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type DonationAgreementService = {
  createDonationAgreement: (
    donation: {
      agreement: string;
      file: string;
      fundingRequestId: string;
      users: string[];
    },
    createdByUserId: string,
    teamId: string,
  ) => Promise<{ agreement: { id: string }; users: Array<{ id: string }> }>;
  updateDonationAgreement: (
    id: string,
    upload: { file: string; pendingUploadId: string },
    signingUserId: string,
  ) => Promise<unknown>;
};

type StatusService = {
  updateFundingRequestStatus: (
    id: string,
    status: FundingStatus,
    donationId?: string | null,
  ) => Promise<{ status: string }>;
};

// Uploads and S3 are outside the database; the signing rules are not.
const service = loadService<DonationAgreementService>(
  "src/services/donation-agreement/index.ts",
  {
    "@/lib/api-guard": { ApiError },
    "@/services/file/pending-uploads": {
      assertPendingUploadsAvailable: async () => undefined,
      consumePendingUploads: async () => undefined,
    },
    "@/services/file/s3-service": {
      assertStoredFileExists: async () => undefined,
    },
  },
);

const statusService = loadService<StatusService>(
  "src/services/funding-request/index.ts",
  {
    "@/auth": { auth: async () => null },
    "@/lib/utils": { handlePrismaError: (error: unknown) => error },
  },
);

beforeEach(resetDatabase);
after(disconnect);

let uploads = 0;
const upload = () => ({
  file: `signed/agreement-${++uploads}.pdf`,
  pendingUploadId: `pending-${uploads}`,
});

/** An accepted request with an agreement for two signers. */
const createAgreement = async () => {
  const setup = await createFundingRequest({ amountAgreed: 1000 });
  const [first, second] = [
    await createUser("First"),
    await createUser("Second"),
  ];
  const { agreement } = await service.createDonationAgreement(
    {
      agreement: "Terms",
      file: `agreements/${setup.fundingRequest.id}.pdf`,
      fundingRequestId: setup.fundingRequest.id,
      users: [first.email, second.email, "nobody@example.org"],
    },
    setup.submitter.id,
    setup.team.id,
  );
  return { ...setup, agreement, first, second };
};

const statusOf = async (fundingRequestId: string) =>
  (
    await db.fundingRequest.findUniqueOrThrow({
      where: { id: fundingRequestId },
      select: { status: true },
    })
  ).status;

const rejectsWith = (status: number) => (error: unknown) =>
  error instanceof ApiError && error.status === status;

test("creating an agreement records it, its signers and the new status together", async () => {
  const { agreement, fundingRequest, first, second, organization, team } =
    await createAgreement();

  const stored = await db.donationAgreement.findUniqueOrThrow({
    where: { id: agreement.id },
    include: { file: true, userSignatures: true },
  });
  assert.equal(stored.fundingRequestId, fundingRequest.id);
  assert.equal(stored.teamId, team.id);
  assert.equal(stored.organizationId, organization.id);
  assert.equal(stored.file.type, "DONATION_AGREEMENT");
  assert.equal(stored.file.fundingRequestId, fundingRequest.id);
  // Unknown e-mail addresses get no signature row.
  assert.deepEqual(
    stored.userSignatures.map((signature) => signature.userId).sort(),
    [first.id, second.id].sort(),
  );
  assert.ok(stored.userSignatures.every((s) => s.signedAt === null));
  assert.equal(
    await statusOf(fundingRequest.id),
    FundingStatus.WaitingForSignature,
  );
});

test("the request moves on to disbursement only with the last signature", async () => {
  const { agreement, fundingRequest, first, second } = await createAgreement();

  await service.updateDonationAgreement(agreement.id, upload(), first.id);
  assert.equal(
    await statusOf(fundingRequest.id),
    FundingStatus.WaitingForSignature,
  );

  await service.updateDonationAgreement(agreement.id, upload(), second.id);
  assert.equal(
    await statusOf(fundingRequest.id),
    FundingStatus.FundsDisbursing,
  );

  const signatures = await db.donationAgreementSignature.findMany({
    where: { donationAgreementId: agreement.id },
  });
  assert.ok(signatures.every((signature) => signature.signedAt !== null));
});

test("nobody signs twice, and only listed signers sign", async () => {
  const { agreement, fundingRequest, first } = await createAgreement();
  const outsider = await createUser("Outsider");

  await service.updateDonationAgreement(agreement.id, upload(), first.id);
  await assert.rejects(
    service.updateDonationAgreement(agreement.id, upload(), first.id),
    rejectsWith(409),
  );
  await assert.rejects(
    service.updateDonationAgreement(agreement.id, upload(), outsider.id),
    rejectsWith(409),
  );

  assert.equal(
    await db.donationAgreementSignature.count({
      where: { donationAgreementId: agreement.id, signedAt: { not: null } },
    }),
    1,
  );
  assert.equal(
    await statusOf(fundingRequest.id),
    FundingStatus.WaitingForSignature,
  );
});

test("an agreement no longer awaiting signatures cannot be signed", async () => {
  const { agreement, fundingRequest, first } = await createAgreement();
  await db.fundingRequest.update({
    where: { id: fundingRequest.id },
    data: { status: FundingStatus.Rejected },
  });

  await assert.rejects(
    service.updateDonationAgreement(agreement.id, upload(), first.id),
    rejectsWith(409),
  );
  assert.equal(
    await db.donationAgreementSignature.count({
      where: { donationAgreementId: agreement.id, signedAt: { not: null } },
    }),
    0,
  );
});

test("a status change through an agreement waits for every signature", async () => {
  const { agreement, fundingRequest, first, second } = await createAgreement();

  await assert.rejects(
    statusService.updateFundingRequestStatus(
      fundingRequest.id,
      FundingStatus.Approved,
      agreement.id,
    ),
    /unsigned signatures/,
  );
  assert.equal(
    await statusOf(fundingRequest.id),
    FundingStatus.WaitingForSignature,
  );

  await service.updateDonationAgreement(agreement.id, upload(), first.id);
  await service.updateDonationAgreement(agreement.id, upload(), second.id);
  const updated = await statusService.updateFundingRequestStatus(
    fundingRequest.id,
    FundingStatus.Approved,
    agreement.id,
  );
  assert.equal(updated.status, FundingStatus.Approved);
});

test("a status change cannot borrow another request's agreement", async () => {
  const { agreement, first, second } = await createAgreement();
  await service.updateDonationAgreement(agreement.id, upload(), first.id);
  await service.updateDonationAgreement(agreement.id, upload(), second.id);
  const { fundingRequest: other } = await createFundingRequest({
    amountAgreed: 50,
  });

  await assert.rejects(
    statusService.updateFundingRequestStatus(
      other.id,
      FundingStatus.Approved,
      agreement.id,
    ),
    /does not belong to this request/,
  );
  assert.equal(await statusOf(other.id), FundingStatus.Accepted);
});
