import { NextResponse } from "next/server";
import logger from "@/lib/logger";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    // Get recent activities from different entities
    const [users, organizations, fundingRequests, transactions, files] =
      await Promise.all([
        // Users
        prisma.user.findMany({
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

        // Organizations
        prisma.organization.findMany({
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

        // Funding Requests
        prisma.fundingRequest.findMany({
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

        // Transactions
        prisma.transaction.findMany({
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

        // Files
        prisma.file.findMany({
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
    logger.error({ error }, "Error fetching recent activity");
    return NextResponse.json(
      { error: "Failed to fetch recent activity" },
      { status: 500 },
    );
  }
}