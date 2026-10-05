import {
  createPublicKey,
  createVerify,
  type KeyObject,
  X509Certificate,
} from "node:crypto";

const CERTIFICATE_TIMEOUT_MS = 5_000;
const certificateCache = new Map<string, Promise<KeyObject>>();

export type ScalewaySnsEnvelope = {
  Type: "Notification" | "SubscriptionConfirmation" | "UnsubscribeConfirmation";
  Message: string;
  MessageId: string;
  TopicArn: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  Subject?: string;
  SubscribeURL?: string;
  Token?: string;
};

type VerifyScalewaySnsOptions = {
  allowedTopicArns: string[];
  loadSigningPublicKey?: (envelope: ScalewaySnsEnvelope) => Promise<KeyObject>;
};

const requireString = (value: unknown, field: string) => {
  if (typeof value !== "string" || !value) {
    throw new Error(`Invalid Scaleway SNS ${field}.`);
  }
  return value;
};

export const parseScalewaySnsEnvelope = (
  value: unknown,
): ScalewaySnsEnvelope => {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid Scaleway SNS envelope.");
  }
  const input = value as Record<string, unknown>;
  const type = requireString(input.Type, "Type");
  if (
    type !== "Notification" &&
    type !== "SubscriptionConfirmation" &&
    type !== "UnsubscribeConfirmation"
  ) {
    throw new Error("Unsupported Scaleway SNS message type.");
  }

  return {
    Type: type,
    Message: requireString(input.Message, "Message"),
    MessageId: requireString(input.MessageId, "MessageId"),
    TopicArn: requireString(input.TopicArn, "TopicArn"),
    Timestamp: requireString(input.Timestamp, "Timestamp"),
    SignatureVersion: requireString(input.SignatureVersion, "SignatureVersion"),
    Signature: requireString(input.Signature, "Signature"),
    SigningCertURL: requireString(input.SigningCertURL, "SigningCertURL"),
    Subject: typeof input.Subject === "string" ? input.Subject : undefined,
    SubscribeURL:
      typeof input.SubscribeURL === "string" ? input.SubscribeURL : undefined,
    Token: typeof input.Token === "string" ? input.Token : undefined,
  };
};

export const getScalewaySnsStringToSign = (envelope: ScalewaySnsEnvelope) => {
  const fieldNames =
    envelope.Type === "Notification"
      ? ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"]
      : [
          "Message",
          "MessageId",
          "SubscribeURL",
          "Timestamp",
          "Token",
          "TopicArn",
          "Type",
        ];

  return fieldNames
    .flatMap((field) => {
      const value = envelope[field as keyof ScalewaySnsEnvelope];
      return value === undefined ? [] : [field, value];
    })
    .map((value) => `${value}\n`)
    .join("");
};

const getRegionFromTopicArn = (topicArn: string) => {
  const match = /^arn:scw:sns:([a-z0-9-]+):/.exec(topicArn);
  if (!match) throw new Error("Invalid Scaleway SNS topic ARN.");
  return match[1];
};

export const validateScalewaySnsCertificateUrl = (
  value: string,
  region: string,
) => {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.hostname !== "messaging.s3.fr-par.scw.cloud" ||
    !url.pathname.startsWith(`/${region}/sns/sns_certificate_`) ||
    !url.pathname.endsWith(".crt")
  ) {
    throw new Error("Untrusted Scaleway SNS signing certificate URL.");
  }
  return url;
};

const splitCertificates = (pem: string) =>
  pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ??
  [];

const isCurrentlyValid = (certificate: X509Certificate) => {
  const now = Date.now();
  return (
    Date.parse(certificate.validFrom) <= now &&
    Date.parse(certificate.validTo) >= now
  );
};

const loadScalewaySigningPublicKey = async (envelope: ScalewaySnsEnvelope) => {
  const region = getRegionFromTopicArn(envelope.TopicArn);
  const certificateUrl = validateScalewaySnsCertificateUrl(
    envelope.SigningCertURL,
    region,
  );
  const trustChainPem =
    process.env.SCALEWAY_SNS_TRUST_CHAIN_PEM ??
    (process.env.SCALEWAY_SNS_TRUST_CHAIN_PEM_BASE64
      ? Buffer.from(
          process.env.SCALEWAY_SNS_TRUST_CHAIN_PEM_BASE64,
          "base64",
        ).toString("utf8")
      : undefined);
  if (!trustChainPem) {
    throw new Error(
      "SCALEWAY_SNS_TRUST_CHAIN_PEM or SCALEWAY_SNS_TRUST_CHAIN_PEM_BASE64 is required.",
    );
  }

  let cached = certificateCache.get(certificateUrl.href);
  if (!cached) {
    cached = (async () => {
      const response = await fetch(certificateUrl, {
        signal: AbortSignal.timeout(CERTIFICATE_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(
          `Unable to fetch Scaleway SNS signing certificate (${response.status}).`,
        );
      }

      const certificate = new X509Certificate(await response.text());
      if (!isCurrentlyValid(certificate)) {
        throw new Error(
          "Scaleway SNS signing certificate is expired or not active.",
        );
      }

      const authorities = splitCertificates(trustChainPem).map(
        (pem) => new X509Certificate(pem),
      );
      if (
        authorities.length === 0 ||
        !authorities.some(
          (authority) =>
            isCurrentlyValid(authority) &&
            certificate.checkIssued(authority) &&
            certificate.verify(authority.publicKey),
        )
      ) {
        throw new Error(
          "Scaleway SNS signing certificate is not issued by the configured trust chain.",
        );
      }

      return createPublicKey(certificate.publicKey);
    })();
    certificateCache.set(certificateUrl.href, cached);
    void cached.catch(() => certificateCache.delete(certificateUrl.href));
  }
  return await cached;
};

export const verifyScalewaySnsEnvelope = async (
  envelope: ScalewaySnsEnvelope,
  {
    allowedTopicArns,
    loadSigningPublicKey = loadScalewaySigningPublicKey,
  }: VerifyScalewaySnsOptions,
) => {
  if (!allowedTopicArns.includes(envelope.TopicArn)) {
    throw new Error("Scaleway SNS topic is not allowed.");
  }
  if (envelope.SignatureVersion !== "1") {
    throw new Error("Unsupported Scaleway SNS signature version.");
  }
  if (!Number.isFinite(Date.parse(envelope.Timestamp))) {
    throw new Error("Invalid Scaleway SNS timestamp.");
  }

  const publicKey = await loadSigningPublicKey(envelope);
  const verifier = createVerify("RSA-SHA1");
  verifier.update(getScalewaySnsStringToSign(envelope), "utf8");
  verifier.end();
  if (!verifier.verify(publicKey, envelope.Signature, "base64")) {
    throw new Error("Invalid Scaleway SNS signature.");
  }
};

export const getAllowedScalewaySnsTopicArns = () => {
  const topics = (process.env.SCALEWAY_EMAIL_SNS_TOPIC_ARNS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (topics.length === 0) {
    throw new Error("SCALEWAY_EMAIL_SNS_TOPIC_ARNS is required.");
  }
  return topics;
};

export const confirmScalewaySnsSubscription = async (
  envelope: ScalewaySnsEnvelope,
) => {
  if (envelope.Type !== "SubscriptionConfirmation" || !envelope.SubscribeURL) {
    throw new Error("Scaleway SNS subscription confirmation URL is missing.");
  }
  const region = getRegionFromTopicArn(envelope.TopicArn);
  const url = new URL(envelope.SubscribeURL);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.hostname !== `sns.mnq.${region}.scaleway.com`
  ) {
    throw new Error("Untrusted Scaleway SNS subscription URL.");
  }
  const response = await fetch(url, {
    signal: AbortSignal.timeout(CERTIFICATE_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(
      `Scaleway SNS subscription confirmation failed (${response.status}).`,
    );
  }
};
