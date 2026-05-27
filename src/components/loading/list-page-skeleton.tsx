import { Skeleton } from "@/components/ui/skeleton";

interface ListPageSkeletonProps {
  titleWidthClassName?: string;
  descriptionWidthClassName?: string;
  showDescription?: boolean;
  actionCount?: number;
  showSearchRow?: boolean;
}

export default function ListPageSkeleton({
  titleWidthClassName = "w-44",
  descriptionWidthClassName = "w-80",
  showDescription = true,
  actionCount = 0,
  showSearchRow = true,
}: ListPageSkeletonProps) {
  const actionSkeletonKeys = Array.from(
    { length: actionCount },
    (_, index) => `action-skeleton-${index + 1}`,
  );

  return (
    <div className="space-y-6 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className={`h-8 ${titleWidthClassName}`} />
          {showDescription ? (
            <Skeleton className={`h-4 ${descriptionWidthClassName}`} />
          ) : null}
        </div>
        {actionCount > 0 ? (
          <div className="flex items-center gap-2">
            {actionSkeletonKeys.map((key) => (
              <Skeleton key={key} className="h-9 w-32" />
            ))}
          </div>
        ) : null}
      </div>

      {showSearchRow ? (
        <div className="flex w-full max-w-xl flex-col gap-2 sm:flex-row sm:items-center">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-full sm:w-24" />
        </div>
      ) : null}

      <div className="rounded-md border p-3 sm:p-4">
        <div className="space-y-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
    </div>
  );
}