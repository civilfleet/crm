import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ApiError,
  handleApiError,
  verifyOrganizationAccess,
  verifyTeamAccess,
} from "@/lib/api-guard";
import { normalizeCountryCode } from "@/lib/countries";
import prisma from "@/lib/prisma";
import { enforcePublicRateLimit } from "@/lib/public-rate-limit";
import {
  AddressSuggestionProviderError,
  searchAddressSuggestions,
} from "@/services/address-suggestions";

const querySchema = z
  .object({
    query: z.string().trim().min(3).max(256),
    teamId: z.uuid().optional(),
    organizationId: z.uuid().optional(),
    country: z.string().trim().max(255).optional(),
  })
  .refine((value) => value.teamId || value.organizationId, {
    message: "Team or organization context is required",
  });

const getLanguage = (request: Request) => {
  const language = request.headers
    .get("accept-language")
    ?.split(",")[0]
    ?.trim()
    .slice(0, 2)
    .toLowerCase();
  return language && /^[a-z]{2}$/.test(language) ? language : undefined;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const input = querySchema.parse({
      query: searchParams.get("query") ?? "",
      teamId: searchParams.get("teamId") || undefined,
      organizationId: searchParams.get("organizationId") || undefined,
      country: searchParams.get("country") || undefined,
    });

    let teamId = input.teamId;
    let session: Awaited<ReturnType<typeof verifyTeamAccess>>;
    if (input.organizationId) {
      const access = await verifyOrganizationAccess(input.organizationId);
      if (input.teamId && access.teamId !== input.teamId) {
        throw new ApiError(403, "Organization does not belong to this team");
      }
      teamId = access.teamId ?? undefined;
      session = access.session;
    } else if (teamId) {
      session = await verifyTeamAccess(teamId);
    } else {
      throw new ApiError(400, "Team or organization context is required");
    }

    enforcePublicRateLimit(
      request,
      `address-suggestions:${session.user.userId}`,
      { limit: 30, windowMs: 60_000 },
    );

    const selectedCountryCode = normalizeCountryCode(input.country);
    let latitude: number | undefined;
    let longitude: number | undefined;

    if (!selectedCountryCode && teamId) {
      const team = await prisma.teams.findUnique({
        where: { id: teamId },
        select: { country: true, postalCode: true },
      });
      const teamCountryCode = normalizeCountryCode(team?.country ?? undefined);
      if (teamCountryCode && team?.postalCode) {
        const centroid = await prisma.postalCodeCentroid.findUnique({
          where: {
            countryCode_postalCode: {
              countryCode: teamCountryCode,
              postalCode: team.postalCode.trim(),
            },
          },
          select: { latitude: true, longitude: true },
        });
        latitude = centroid?.latitude ? Number(centroid.latitude) : undefined;
        longitude = centroid?.longitude
          ? Number(centroid.longitude)
          : undefined;
      }
    }

    const suggestions = await searchAddressSuggestions({
      query: input.query,
      countryCode: selectedCountryCode,
      latitude,
      longitude,
      language: getLanguage(request),
    });

    return NextResponse.json({ data: suggestions });
  } catch (error) {
    const apiError = handleApiError(error);
    if (apiError) return apiError;
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid address query" },
        { status: 400 },
      );
    }
    if (error instanceof AddressSuggestionProviderError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "Address suggestions are temporarily unavailable" },
      { status: 503 },
    );
  }
}
