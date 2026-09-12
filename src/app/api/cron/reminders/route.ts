import { NextResponse } from "next/server";
import { hasValidBearerSecret } from "@/lib/cron-auth";
import logger from "@/lib/logger";
import { sendEmail } from "@/lib/nodemailer";
import {
  getDonationAgreementPastEightWeeks,
  getDonationAgreementPastSevenDays,
} from "@/services/donation-agreement";

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    logger.error("CRON_SECRET is not configured");
    return NextResponse.json(
      { success: false, message: "Cron endpoint is not configured" },
      { status: 503 },
    );
  }
  if (
    !hasValidBearerSecret(
      request.headers.get("authorization"),
      process.env.CRON_SECRET,
    )
  ) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const [donationsForReceiptReminder, donationsForBudgetReportReminder] =
      await Promise.all([
        getDonationAgreementPastSevenDays(),
        getDonationAgreementPastEightWeeks(),
      ]);

    // Send receipt reminders
    await Promise.all(
      donationsForReceiptReminder.map((donation) =>
        sendEmail(
          {
            to: donation?.organization?.email as string,
            subject: "Reminder: Please Upload Your Donation Receipt",
            template: "reminder",
          },
          {
            fundingRequestName: donation?.fundingRequest?.name,
            reminderMessage: "Upload funds transfer receipt.",
            actionLink: `${process.env.NEXT_PUBLIC_BASE_URL}/organization/funding-request/${donation?.fundingRequest?.id}`,
            actionButtonText: "Upload Receipt",
            supportEmail: donation?.team?.email,
            teamName: donation?.team?.name,
          },
        ),
      ),
    );

    // Send budget and report reminders
    await Promise.all(
      donationsForBudgetReportReminder.map((donation) =>
        sendEmail(
          {
            to: donation?.organization?.email as string,
            subject: "Reminder: Please Upload Your Donation Receipt",
            template: "reminder",
          },
          {
            fundingRequestName: donation?.fundingRequest?.name,
            reminderMessage: "Upload budget statement and report.",
            actionLink: `${process.env.NEXT_PUBLIC_BASE_URL}/organization/funding-request/${donation?.fundingRequest?.id}`,
            actionButtonText: "Upload Receipt",
            supportEmail: donation?.team?.email,
            teamName: donation?.team?.name,
          },
        ),
      ),
    );

    return NextResponse.json({
      success: true,
      message: "Reminders sent successfully",
    });
  } catch (error) {
    logger.error({ error }, "Error in cron job");
    return NextResponse.json(
      { success: false, message: "Failed to send reminders" },
      { status: 500 },
    );
  }
}
