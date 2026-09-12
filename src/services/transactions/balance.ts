import { Prisma } from "@prisma/client";

export const calculateTransactionBalance = ({
  amount,
  alreadyDisbursed,
  totalAmount,
}: {
  amount: Prisma.Decimal.Value;
  alreadyDisbursed: Prisma.Decimal.Value;
  totalAmount: Prisma.Decimal.Value;
}) => {
  const normalizedAmount = new Prisma.Decimal(amount);
  const normalizedTotal = new Prisma.Decimal(totalAmount);
  const normalizedDisbursed = new Prisma.Decimal(alreadyDisbursed);
  const remainingBefore = normalizedTotal.minus(normalizedDisbursed);

  if (normalizedAmount.lte(0)) {
    throw new Error("Transaction amount must be greater than zero");
  }
  if (remainingBefore.lt(0) || normalizedAmount.gt(remainingBefore)) {
    throw new Error("Transaction amount exceeds the remaining balance");
  }

  return {
    amount: normalizedAmount,
    remainingAmount: remainingBefore.minus(normalizedAmount),
  };
};
