import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import logger from "@/lib/logger";
import prisma from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const session = await auth();
    const { teamId } = await params;

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user has access to this team or is an admin
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { teams: true },
    });

    const isAdmin = user?.roles.includes("Admin");
    const hasTeamAccess = user?.teams.some((team) => team.id === teamId);

    if (!user || (!isAdmin && !hasTeamAccess)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get recent activities scoped to this team
    const [organizations, fundingRequests, transactions, files] =
      await Promise.all([
        // Organizations belonging to this team
        prisma.organization.findMany({
          where: { teamId },
          select: {
            id: true,
            name: true,
            email: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: "desc" },
          take: 10,
        }),

        // Funding Requests from organizations in this team
        prisma.fundingRequest.findMany({
          where: {
            organization: {
              teamId: teamId,
            },
          },
          select: {
            id: true,
            name: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            organization: {
              select: {
                name: true,
              },
            },
          },
          orderBy: { updatedAt: "desc" },
          take: 10,
        }),

        // Transactions for this team
        prisma.transaction.findMany({
          where: { teamId },
          select: {
            id: true,
            amount: true,
            createdAt: true,
            updatedAt: true,
            organization: {
              select: {
                name: true,
              },
            },
          },
          orderBy: { updatedAt: "desc" },
          take: 10,
        }),

        // Files from organizations in this team
        prisma.file.findMany({
          where: {
            organization: {
              teamId: teamId,
            },
          },
          select: {
            id: true,
            name: true,
            type: true,
            createdAt: true,
            updatedAt: true,
            organization: {
              select: {
                name: true,
              },
            },
          },
          orderBy: { updatedAt: "desc" },
          take: 10,
        }),
      ]);

    // Combine and transform activities
    const activities = [
      ...organizations.map((org) => ({
        id: `org-${org.id}`,
        type: "organization" as const,
        action:
          org.createdAt.getTime() === org.updatedAt.getTime()
            ? ("created" as const)
            : ("updated" as const),
        title: org.name || "Unknown Organization",
        description: org.email,
        timestamp: org.updatedAt.toISOString(),
        entityId: org.id,
      })),

      ...fundingRequests.map((fr) => ({
        id: `fr-${fr.id}`,
        type: "funding_request" as const,
        action:
          fr.createdAt.getTime() === fr.updatedAt.getTime()
            ? ("created" as const)
            : ("updated" as const),
        title: fr.name,
        description: `${fr.organization?.name || "Unknown Org"} - ${fr.status}`,
        timestamp: fr.updatedAt.toISOString(),
        entityId: fr.id,
      })),

      ...transactions.map((tx) => ({
        id: `tx-${tx.id}`,
        type: "transaction" as const,
        action:
          tx.createdAt.getTime() === tx.updatedAt.getTime()
            ? ("created" as const)
            : ("updated" as const),
        title: `Transaction`,
        description: `${tx.organization?.name || "Unknown Org"} - $${tx.amount}`,
        timestamp: tx.updatedAt.toISOString(),
        entityId: tx.id,
      })),

      ...files.map((file) => ({
        id: `file-${file.id}`,
        type: "file" as const,
        action:
          file.createdAt.getTime() === file.updatedAt.getTime()
            ? ("created" as const)
            : ("updated" as const),
        title: file.name || "Unknown File",
        description: `${file.organization?.name || "System"} - ${file.type}`,
        timestamp: file.updatedAt.toISOString(),
        entityId: file.id,
      })),
    ];

    // Sort by timestamp and limit to 20 most recent
    const sortedActivities = activities
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      )
      .slice(0, 20);

    return NextResponse.json({
      activities: sortedActivities,
    });
  } catch (error) {
    logger.error({ error }, "Error fetching team recent activity");
    return NextResponse.json(
      { error: "Failed to fetch recent activity" },
      { status: 500 },
    );
  }
}