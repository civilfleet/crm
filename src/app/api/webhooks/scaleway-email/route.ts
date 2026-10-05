import { NextResponse } from "next/server";
import {
  applyScalewayEmailEvent,
  parseScalewayEmailEvent,
} from "@/services/email-delivery-events";
import {
  confirmScalewaySnsSubscription,
  getAllowedScalewaySnsTopicArns,
  parseScalewaySnsEnvelope,
  verifyScalewaySnsEnvelope,
} from "@/services/integrations/scaleway-sns";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 300 * 1024;

export async function POST(request: Request) {
  try {
    const body = await request.text();
    if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: "Payload too large." },
        { status: 413 },
      );
    }

    const envelope = parseScalewaySnsEnvelope(JSON.parse(body));
    await verifyScalewaySnsEnvelope(envelope, {
      allowedTopicArns: getAllowedScalewaySnsTopicArns(),
    });

    if (envelope.Type === "SubscriptionConfirmation") {
      await confirmScalewaySnsSubscription(envelope);
      return NextResponse.json({ data: { confirmed: true } });
    }
    if (envelope.Type === "UnsubscribeConfirmation") {
      return NextResponse.json({ data: { acknowledged: true } });
    }

    const event = parseScalewayEmailEvent(envelope.Message);
    const result = await applyScalewayEmailEvent(event);
    return NextResponse.json({ data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid webhook.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
