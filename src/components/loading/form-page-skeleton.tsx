import { Skeleton } from "@/components/ui/skeleton";

export default function FormPageSkeleton() {
  return (
    <div className="p-4">
      <div className="mx-auto w-full max-w-3xl space-y-4 rounded-lg border p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80" />
        <div className="space-y-3 pt-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-28 w-full" />
          <div className="flex justify-end gap-2 pt-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
      </div>
    </div>
  );
}
