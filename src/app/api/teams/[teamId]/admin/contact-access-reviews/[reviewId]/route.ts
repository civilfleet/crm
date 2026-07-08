import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, verifyTeamAccess } from "@/lib/api-guard";
import { handlePrismaError } from "@/lib/utils";
import {
  approveContactAccessReviewForInboundEmail,
  rejectContactAccessReviewForInboundEmail,
  revokeContactAccessReviewForInboundEmail,
} from "@/services/inbound-email";

const reviewSchema = z.object({
  action: z.enum(["approve", "reject", "revoke"]),
  reviewNote: z.string().trim().max(1000).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamId: string; reviewId: string }> },
) {
  try {
    const { teamId, reviewId } = await params;
    const session = await verifyTeamAccess(teamId, { requireAdmin: true });
    const payload = await request.json();
    const validated = reviewSchema.parse(payload);

    const reviewer = {
      teamId,
      reviewId,
      userId: session.user.userId,
      userName: session.user.name ?? undefined,
      reviewNote: validated.reviewNote,
    };
    const result =
      validated.action === "approve"
        ? await approveContactAccessReviewForInboundEmail(reviewer)
        : validated.action === "reject"
          ? await rejectContactAccessReviewForInboundEmail(reviewer)
          : await revokeContactAccessReviewForInboundEmail(reviewer);

    return NextResponse.json({ data: result }, { status: 200 });
  } catch (error) {
    const apiError = handleApiError(error);
    if (apiError) return apiError;

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 },
      );
    }

    const { message } = handlePrismaError(error);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}
