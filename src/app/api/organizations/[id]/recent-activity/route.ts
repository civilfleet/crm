import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import logger from "@/lib/logger";
import prisma from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    const { id: organizationId } = await params;

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user has access to this organization or is an admin
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        organizations: true,
        teams: {
          include: {
            organizations: true,
          },
        },
      },
    });

    const isAdmin = user?.roles.includes("Admin");
    const hasOrgAccess = user?.organizations.some(
      (org) => org.id === organizationId,
    );
    const hasTeamAccess = user?.teams.some((team) =>
      team.organizations.some((org) => org.id === organizationId),
    );

    if (!user || (!isAdmin && !hasOrgAccess && !hasTeamAccess)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get recent activities scoped to this organization
    const [users, fundingRequests, transactions, files] = await Promise.all([
      // Users belonging to this organization
      prisma.user.findMany({
        where: {
          organizations: {
            some: {
              id: organizationId,
            },
          },
        },
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

      // Funding Requests from this organization
      prisma.fundingRequest.findMany({
        where: { organizationId },
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

      // Transactions for this organization
      prisma.transaction.findMany({
        where: { organizationId },
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

      // Files from this organization
      prisma.file.findMany({
        where: { organizationId },
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
      ...users.map((user) => ({
        id: `user-${user.id}`,
        type: "user" as const,
        action:
          user.createdAt.getTime() === user.updatedAt.getTime()
            ? ("created" as const)
            : ("updated" as const),
        title: user.name || "Unknown User",
        description: user.email,
        timestamp: user.updatedAt.toISOString(),
        entityId: user.id,
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
    logger.error({ error }, "Error fetching organization recent activity");
    return NextResponse.json(
      { error: "Failed to fetch recent activity" },
      { status: 500 },
    );
  }
}