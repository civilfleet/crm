import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");

    const [{ default: logger }, { isPreviewDemoEnabled }] = await Promise.all([
      import("./lib/logger"),
      import("./config/preview-demo"),
    ]);
    const previewDemoEnabled = isPreviewDemoEnabled(
      process.env.PREVIEW_DEMO_ENABLED,
    );

    logger.info(
      {
        mode: previewDemoEnabled ? "preview-demo" : "standard",
        previewDemoEnabled,
      },
      "Application startup mode",
    );
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
