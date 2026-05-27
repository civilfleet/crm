import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  AppModule,
  ContactListType,
  FundingStatus,
  PrismaClient,
  Roles,
} from "@prisma/client";
import { Pool } from "pg";
import { populateDefaultFormConfiguration } from "../scripts/populate-default-form-config";
import logger from "../src/lib/logger";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PG_SSL_ROOT_CERT
    ? {
        rejectUnauthorized: true,
        ca: process.env.PG_SSL_ROOT_CERT.replace(/\\n/g, "\n"),
      }
    : undefined,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  logger.info("Starting database seeding...");

  try {
    // 1. Seed Team
    const teamName = "Acme Seed Team";
    const teamEmail = "seed-team@acme.com";
    logger.info(`Upserting team: ${teamName}`);
    const team = await prisma.teams.upsert({
      where: { name: teamName },
      update: {},
      create: {
        name: teamName,
        email: teamEmail,
        website: "https://acme-seed.example.com",
        city: "Berlin",
        country: "Germany",
        modules: [AppModule.CRM, AppModule.FUNDING],
      },
    });

    // 2. Seed Users
    const usersData = [
      {
        email: "seed-admin@acme.com",
        name: "Admin User",
        roles: [Roles.Admin],
      },
      {
        email: "seed-member@acme.com",
        name: "Team Member",
        roles: [Roles.Team],
      },
      {
        email: "seed-org@acme.com",
        name: "Organization Representative",
        roles: [Roles.Organization],
      },
    ];

    const seededUsers = [];
    for (const userData of usersData) {
      logger.info(`Upserting user: ${userData.email}`);
      const user = await prisma.user.upsert({
        where: { email: userData.email },
        update: {
          roles: userData.roles,
        },
        create: {
          email: userData.email,
          name: userData.name,
          roles: userData.roles,
          teams: {
            connect: { id: team.id },
          },
        },
      });
      seededUsers.push(user);
    }

    const adminUser = seededUsers[0];
    const orgUser = seededUsers[2];

    // 3. Seed Organization Types
    const orgTypes = ["NGO", "Foundation", "Corporate Partner"];
    const seededOrgTypes = [];
    for (const typeName of orgTypes) {
      logger.info(`Creating or finding organization type: ${typeName}`);
      const existing = await prisma.organizationType.findFirst({
        where: { teamId: team.id, name: typeName },
      });
      if (existing) {
        seededOrgTypes.push(existing);
      } else {
        const created = await prisma.organizationType.create({
          data: {
            name: typeName,
            teamId: team.id,
            color:
              typeName === "NGO"
                ? "blue"
                : typeName === "Foundation"
                  ? "green"
                  : "purple",
          },
        });
        seededOrgTypes.push(created);
      }
    }

    const ngoType = seededOrgTypes[0];
    const foundationType = seededOrgTypes[1];

    // 4. Seed Organizations
    logger.info("Upserting organizations...");
    const org1Email = "info@savetheearth.example.org";
    const org1 = await prisma.organization.upsert({
      where: { email: org1Email },
      update: {},
      create: {
        name: "Save The Earth NGO",
        email: org1Email,
        address: "123 Eco Way",
        city: "Munich",
        country: "Germany",
        website: "https://savetheearth.example.org",
        orgTypeId: ngoType.id,
        teamId: team.id,
        users: {
          connect: { id: orgUser.id },
        },
      },
    });

    const org2Email = "contact@globaledu.example.org";
    const org2 = await prisma.organization.upsert({
      where: { email: org2Email },
      update: {},
      create: {
        name: "Global Education Foundation",
        email: org2Email,
        address: "456 Learning Lane",
        city: "Hamburg",
        country: "Germany",
        website: "https://globaledu.example.org",
        orgTypeId: foundationType.id,
        teamId: team.id,
      },
    });

    // 5. Seed Contacts
    logger.info("Upserting contacts...");
    const contact1Email = "jane.doe@savetheearth.example.org";
    await prisma.contact.upsert({
      where: { teamId_email: { teamId: team.id, email: contact1Email } },
      update: {},
      create: {
        name: "Jane Doe",
        email: contact1Email,
        phone: "+491701234567",
        teamId: team.id,
        organizations: {
          create: {
            organizationId: org1.id,
          },
        },
      },
    });

    const contact2Email = "john.smith@globaledu.example.org";
    await prisma.contact.upsert({
      where: { teamId_email: { teamId: team.id, email: contact2Email } },
      update: {},
      create: {
        name: "John Smith",
        email: contact2Email,
        phone: "+491707654321",
        teamId: team.id,
        organizations: {
          create: {
            organizationId: org2.id,
          },
        },
      },
    });

    const contact3Email = "alice.jones@example.com";
    const c3 = await prisma.contact.upsert({
      where: { teamId_email: { teamId: team.id, email: contact3Email } },
      update: {},
      create: {
        name: "Alice Jones",
        email: contact3Email,
        phone: "+447911123456",
        city: "London",
        country: "United Kingdom",
        teamId: team.id,
      },
    });

    const contact4Email = "bob.martin@example.com";
    const c4 = await prisma.contact.upsert({
      where: { teamId_email: { teamId: team.id, email: contact4Email } },
      update: {},
      create: {
        name: "Bob Martin",
        email: contact4Email,
        phone: "+15551234567",
        city: "New York",
        country: "United States",
        teamId: team.id,
      },
    });

    const contact5Email = "charlie.brown@example.com";
    const c5 = await prisma.contact.upsert({
      where: { teamId_email: { teamId: team.id, email: contact5Email } },
      update: {},
      create: {
        name: "Charlie Brown",
        email: contact5Email,
        phone: "+15559876543",
        city: "Chicago",
        country: "United States",
        teamId: team.id,
      },
    });

    const contact6Email = "sarah.connor@example.com";
    const c6 = await prisma.contact.upsert({
      where: { teamId_email: { teamId: team.id, email: contact6Email } },
      update: {},
      create: {
        name: "Sarah Connor",
        email: contact6Email,
        phone: "+15559998888",
        city: "Los Angeles",
        country: "United States",
        teamId: team.id,
      },
    });

    // 5.b. Seed Contact Lists
    logger.info("Creating contact lists...");
    const existingList1 = await prisma.contactList.findFirst({
      where: { teamId: team.id, name: "US Contacts" },
    });
    if (!existingList1) {
      await prisma.contactList.create({
        data: {
          name: "US Contacts",
          description: "Contacts based in the United States",
          type: ContactListType.SMART,
          filters: [
            {
              type: "contactField",
              field: "country",
              operator: "equals",
              value: "United States",
            },
          ],
          teamId: team.id,
        },
      });
    }

    const existingList2 = await prisma.contactList.findFirst({
      where: { teamId: team.id, name: "Key Partners" },
    });
    if (!existingList2) {
      await prisma.contactList.create({
        data: {
          name: "Key Partners",
          description: "Important partners and stakeholders",
          type: ContactListType.MANUAL,
          teamId: team.id,
          contacts: {
            create: [{ contactId: c3.id }, { contactId: c4.id }],
          },
        },
      });
    }

    // 6. Seed Funding Requests
    logger.info("Creating funding requests...");
    const existingFr1 = await prisma.fundingRequest.findFirst({
      where: { name: "Solar Panels for Office" },
    });
    if (!existingFr1) {
      await prisma.fundingRequest.create({
        data: {
          name: "Solar Panels for Office",
          organizationId: org1.id,
          description:
            "Install solar panels on the main NGO office building to reduce carbon footprint and operational costs.",
          purpose: "Climate mitigation and energy independence.",
          amountRequested: 50000,
          refinancingConcept:
            "Energy savings will pay back maintenance costs after 5 years.",
          sustainability: "The panels have a lifetime of 25 years.",
          expectedCompletionDate: new Date(
            Date.now() + 180 * 24 * 60 * 60 * 1000,
          ), // 6 months from now
          status: FundingStatus.Submitted,
          submittedById: orgUser.id,
          teamId: team.id,
        },
      });
    }

    let fr2 = await prisma.fundingRequest.findFirst({
      where: { name: "Digital Literacy Campaign 2026" },
    });
    if (!fr2) {
      fr2 = await prisma.fundingRequest.create({
        data: {
          name: "Digital Literacy Campaign 2026",
          organizationId: org2.id,
          description:
            "Deploy tablets and training materials to rural classrooms to teach basic programming and digital skills.",
          purpose: "Bridging the digital divide for 500+ children.",
          amountRequested: 25000,
          amountAgreed: 20000,
          remainingAmount: 5000,
          refinancingConcept:
            "Local government will match operational costs starting in year 2.",
          sustainability:
            "Trained teachers will continue curriculum independently.",
          expectedCompletionDate: new Date(
            Date.now() + 120 * 24 * 60 * 60 * 1000,
          ), // 4 months from now
          status: FundingStatus.Approved,
          submittedById: adminUser.id,
          teamId: team.id,
        },
      });
    }

    // 7. Seed Transactions
    logger.info("Creating transactions...");
    const existingTransaction = await prisma.transaction.findFirst({
      where: { fundingRequestId: fr2.id },
    });
    if (!existingTransaction) {
      await prisma.transaction.create({
        data: {
          amount: 15000,
          totalAmount: 20000,
          remainingAmount: 5000,
          fundingRequestId: fr2.id,
          organizationId: org2.id,
          teamId: team.id,
        },
      });
    }

    // 8. Populate form configuration
    logger.info("Populating form configurations for team...");
    await populateDefaultFormConfiguration();

    logger.info("Database seeding completed successfully!");
  } catch (error) {
    console.error(error);
    logger.error({ error }, "Error seeding database");
    throw error;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    logger.error({ error }, "Seeding failed");
    process.exit(1);
  });