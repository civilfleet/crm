const DEFAULT_PROVIDER_TIMEOUT_MS = 30_000;
const DEFAULT_CONNECTION_TIMEOUT_MS = 30_000;
const DEFAULT_SOCKET_TIMEOUT_MS = 60_000;

const positiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const getEmailProviderTimeoutMs = () =>
  positiveInteger(
    process.env.EMAIL_PROVIDER_REQUEST_TIMEOUT_MS,
    DEFAULT_PROVIDER_TIMEOUT_MS,
  );

export const getEmailConnectionTimeouts = () => ({
  connectionTimeout: positiveInteger(
    process.env.EMAIL_CONNECTION_TIMEOUT_MS,
    DEFAULT_CONNECTION_TIMEOUT_MS,
  ),
  greetingTimeout: positiveInteger(
    process.env.EMAIL_GREETING_TIMEOUT_MS,
    DEFAULT_CONNECTION_TIMEOUT_MS,
  ),
  socketTimeout: positiveInteger(
    process.env.EMAIL_SOCKET_TIMEOUT_MS,
    DEFAULT_SOCKET_TIMEOUT_MS,
  ),
});

export const createEmailProviderAbortSignal = () =>
  AbortSignal.timeout(getEmailProviderTimeoutMs());
