import { Skeleton } from "@/components/ui/skeleton";

interface TableLoadingStateProps {
  rows?: number;
}

export default function TableLoadingState({
  rows = 8,
}: TableLoadingStateProps) {
  const rowSkeletonKeys = Array.from(
    { length: rows },
    (_, index) => `table-row-skeleton-${index + 1}`,
  );

  return (
    <div className="space-y-3 p-2 sm:p-3">
      <Skeleton className="h-9 w-full" />
      {rowSkeletonKeys.map((key) => (
        <Skeleton key={key} className="h-10 w-full" />
      ))}
    </div>
  );
}
