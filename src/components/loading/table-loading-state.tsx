import { Skeleton } from "@/components/ui/skeleton";

interface TableLoadingStateProps {
  rows?: number;
}

export default function TableLoadingState({
  rows = 8,
}: TableLoadingStateProps) {
  return (
    <div className="space-y-3 p-2 sm:p-3">
      <Skeleton className="h-9 w-full" />
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  );
}