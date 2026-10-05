const SCALEWAY_TRANSACTIONAL_EMAIL_API =
  "https://api.scaleway.com/transactional-email/v1alpha1";
const VERIFICATION_TIMEOUT_MS = 10_000;

type ScalewayDomain = {
  name?: string;
  project_id?: string;
  status?: string;
};

type VerifyScalewaySenderInput = {
  apiKey: string;
  region: string;
  projectId: string;
  senderEmail: string;
  fetchImpl?: typeof fetch;
};

const getResponseError = async (response: Response) => {
  try {
    const body = (await response.json()) as {
      message?: string;
      error?: string;
    };
    return body.message || body.error || response.statusText;
  } catch {
    return response.statusText;
  }
};

export const verifyScalewaySenderConfiguration = async ({
  apiKey,
  region,
  projectId,
  senderEmail,
  fetchImpl = fetch,
}: VerifyScalewaySenderInput) => {
  const senderDomain = senderEmail.trim().toLowerCase().split("@").at(-1);
  if (!senderDomain) {
    throw new Error("Default sender email has no domain.");
  }

  const url = new URL(
    `${SCALEWAY_TRANSACTIONAL_EMAIL_API}/regions/${encodeURIComponent(region)}/domains`,
  );
  url.searchParams.set("project_id", projectId);
  url.searchParams.set("name", senderDomain);
  url.searchParams.set("page_size", "100");

  const response = await fetchImpl(url, {
    headers: { "X-Auth-Token": apiKey },
    signal: AbortSignal.timeout(VERIFICATION_TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = await getResponseError(response);
    throw new Error(
      `Scaleway sender verification failed (${response.status}): ${detail}`,
    );
  }

  const body = (await response.json()) as { domains?: ScalewayDomain[] };
  const domain = body.domains?.find(
    (candidate) =>
      candidate.name?.toLowerCase() === senderDomain &&
      candidate.project_id === projectId,
  );
  if (!domain) {
    throw new Error(
      `Sender domain ${senderDomain} is not registered in this Scaleway project.`,
    );
  }
  if (domain.status !== "checked") {
    throw new Error(
      `Sender domain ${senderDomain} is not verified by Scaleway (status: ${domain.status ?? "unknown"}).`,
    );
  }

  return { domain: senderDomain, status: domain.status };
};
