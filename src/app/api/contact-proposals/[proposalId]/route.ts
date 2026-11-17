import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, verifyTeamAccess } from "@/lib/api-guard";
import { ProposalError, resolveProposal } from "@/services/contact-proposals";
import type { Roles } from "@/types";

type Context = { params: Promise<{ proposalId: string }> };

const decisionSchema = z
  .object({
    teamId: z.string().min(1),
    decision: z.enum(["apply", "apply-alias", "decline"]),
  })
  .strict();

/** Applies or declines one proposed change (POST {teamId, decision}). */
export async function POST(request: NextRequest, { params }: Context) {
  try {
    const { proposalId } = await params;
    const parsed = decisionSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
    }
    const { teamId, decision } = parsed.data;
    const session = await verifyTeamAccess(teamId, { requireModule: "CRM" });
    const result = await resolveProposal(
      { teamId, proposalId, decision },
      {
        userId: session.user.userId,
        userName: session.user.name ?? session.user.email ?? undefined,
        roles: (session.user.roles ?? []) as Roles[],
      },
    );
    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof ProposalError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    const apiError = handleApiError(error);
    if (apiError) return apiError;
    return NextResponse.json(
      { error: "The change could not be decided" },
      { status: 500 },
    );
  }
}
