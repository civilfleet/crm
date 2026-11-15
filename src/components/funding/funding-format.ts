/** Prisma sends decimals as strings; an empty or broken value is unknown. */
export const toAmount = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
};

const wholeEuros = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const euros = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

/** "24.000 €" (German formatting, as everywhere in the app); cents only when there are any. */
export const formatEuro = (value: unknown) => {
  const amount = toAmount(value);
  if (amount === null) return "";
  return Number.isInteger(amount)
    ? wholeEuros.format(amount)
    : euros.format(amount);
};
