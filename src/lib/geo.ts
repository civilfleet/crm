export const normalizePostalCode = (value?: string) => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.toUpperCase().replace(/\s+/g, " ");
};
