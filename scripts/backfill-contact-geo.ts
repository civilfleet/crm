import { normalizeCountryCode } from "@/lib/countries";
import { normalizePostalCode } from "@/lib/geo";
import prisma from "@/lib/prisma";
import logger from "@/lib/logger";

const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? 200);
const DRY_RUN = process.env.DRY_RUN === "1";

const run = async () => {
  let lastId: string | undefined;
  let updatedCount = 0;

  for (;;) {
    const contacts = await prisma.contact.findMany({
      where: {
        postalCode: { not: null },
      },
      select: {
        id: true,
        postalCode: true,
        country: true,
        countryCode: true,
        latitude: true,
        longitude: true,
      },
      orderBy: {
        id: "asc",
      },
      ...(lastId ? { cursor: { id: lastId }, skip: 1 } : {}),
      take: BATCH_SIZE,
    });

    if (!contacts.length) {
      break;
    }

    for (const contact of contacts) {
      const postalCode = normalizePostalCode(contact.postalCode ?? undefined);
      const countryCode =
        contact.countryCode ??
        normalizeCountryCode(contact.country ?? undefined);

      if (!postalCode || !countryCode) {
        continue;
      }

      const centroid = await prisma.postalCodeCentroid.findUnique({
        where: {
          countryCode_postalCode: {
            countryCode,
            postalCode,
          },
        },
        select: {
          latitude: true,
          longitude: true,
        },
      });

      if (!centroid?.latitude || !centroid?.longitude) {
        continue;
      }

      if (!DRY_RUN) {
        await prisma.contact.update({
          where: { id: contact.id },
          data: {
            countryCode,
            latitude: centroid.latitude,
            longitude: centroid.longitude,
          },
        });
      }

      updatedCount += 1;
    }

    lastId = contacts[contacts.length - 1]?.id;
  }

  logger.info(
    DRY_RUN
      ? `Dry run complete. ${updatedCount} contacts would be updated.`
      : `Backfill complete. Updated ${updatedCount} contacts.`,
  );
};

run()
  .catch((error) => {
    logger.error({ error }, "Backfill contact geo failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });