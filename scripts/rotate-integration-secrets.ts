import "dotenv/config";
import { encryptIntegrationSecret } from "@/lib/integration-secrets";
import prisma from "@/lib/prisma";

const main = async () => {
  const integrations = await prisma.integrationConnection.findMany({
    select: {
      id: true,
      apiKey: true,
      webhookSecret: true,
    },
  });

  // Resolve and validate every secret before opening the write transaction. A
  // missing old key or corrupt ciphertext therefore leaves the database intact.
  const rotations = integrations.map((integration) => ({
    ...integration,
    encryptedApiKey: encryptIntegrationSecret(integration.apiKey),
    encryptedWebhookSecret: integration.webhookSecret
      ? encryptIntegrationSecret(integration.webhookSecret)
      : null,
  }));

  await prisma.$transaction(async (transaction) => {
    for (const rotation of rotations) {
      const result = await transaction.integrationConnection.updateMany({
        where: {
          id: rotation.id,
          apiKey: rotation.apiKey,
          webhookSecret: rotation.webhookSecret,
        },
        data: {
          apiKey: rotation.encryptedApiKey,
          webhookSecret: rotation.encryptedWebhookSecret,
        },
      });

      if (result.count !== 1) {
        throw new Error(
          `Integration ${rotation.id} changed during secret rotation; no secrets were rotated.`,
        );
      }
    }
  });

  console.log(`Rotated secrets for ${rotations.length} integration(s).`);
};

main()
  .catch((error) => {
    console.error("Integration secret rotation failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
