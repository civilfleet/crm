import { Skeleton } from "@/components/ui/skeleton";

/**
 * The shape of a records page before its data arrives: header, toolbar,
 * grid. Same frame as the real thing, so nothing jumps when it loads.
 */
export const RecordsLoading = ({ rows = 10 }: { rows?: number }) => (
  <div
    role="status"
    aria-busy="true"
    aria-label="Loading"
    className="flex min-h-[calc(100svh-3.5rem)] flex-col bg-card md:h-svh md:min-h-0"
  >
    <div className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
      <Skeleton className="size-7 rounded-md" />
      <Skeleton className="h-4 w-28" />
      <Skeleton className="ml-auto h-8 w-32 rounded-md" />
    </div>
    <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
      <Skeleton className="h-7 w-40 rounded-md" />
      <Skeleton className="ml-auto h-8 w-56 rounded-md" />
    </div>
    <div className="flex-1 overflow-hidden">
      {Array.from({ length: rows }, (_, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholder rows have no identity
          key={index}
          className="flex h-10 items-center gap-6 border-b px-4"
        >
          <Skeleton className="size-4 rounded-sm" />
          <Skeleton className="h-3.5 w-48" />
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="hidden h-3.5 w-32 sm:block" />
          <Skeleton className="hidden h-3.5 w-24 md:block" />
        </div>
      ))}
    </div>
  </div>
);

/** The shape of a single record page: top bar, header, tabs, details panel. */
export const RecordLoading = () => (
  <div
    role="status"
    aria-busy="true"
    aria-label="Loading"
    className="flex min-h-[calc(100svh-3.5rem)] flex-col bg-card md:h-svh md:min-h-0"
  >
    <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-4 w-36" />
      <Skeleton className="ml-auto h-8 w-20 rounded-md" />
    </div>
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="flex-1 space-y-6 px-6 pt-6">
        <div className="flex items-start gap-4">
          <Skeleton className="size-12 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
        </div>
        <div className="flex gap-4 border-b pb-3">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 w-12" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
      <div className="space-y-3 border-t px-5 py-4 lg:w-[22rem] lg:border-t-0 lg:border-l">
        <Skeleton className="h-3 w-16" />
        {Array.from({ length: 6 }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholder rows have no identity
          <div key={index} className="flex gap-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 flex-1" />
          </div>
        ))}
      </div>
    </div>
  </div>
);

/** The shape of a form page: breadcrumb, title, sections with fields, footer. */
export const FormLoading = ({ sections = 3 }: { sections?: number }) => (
  <div
    role="status"
    aria-busy="true"
    aria-label="Loading"
    className="flex min-h-[calc(100svh-3.5rem)] flex-col bg-card md:h-svh md:min-h-0"
  >
    <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-4 w-36" />
    </div>
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col overflow-hidden px-4 pt-8 sm:px-6">
      <div className="space-y-2 pb-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      {Array.from({ length: sections }, (_, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholder sections have no identity
          key={index}
          className="grid gap-x-10 gap-y-4 border-t py-6 md:grid-cols-[13rem_minmax(0,1fr)]"
        >
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3.5 w-40" />
          </div>
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
          </div>
        </div>
      ))}
      <div className="mt-auto flex justify-end gap-2 border-t py-3">
        <Skeleton className="h-9 w-20 rounded-md" />
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>
    </div>
  </div>
);

/** The shape of Home before it loads: greeting, then a grid of cards. */
export const HomeLoading = () => (
  <div
    role="status"
    aria-busy="true"
    aria-label="Loading"
    className="flex min-h-[calc(100svh-3.5rem)] flex-col bg-card md:h-svh md:min-h-0"
  >
    <div className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
      <Skeleton className="size-7 rounded-md" />
      <Skeleton className="h-4 w-20" />
      <Skeleton className="ml-auto h-8 w-28 rounded-md" />
    </div>
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <div className="space-y-2">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholder cards have no identity
          <Skeleton key={index} className="h-28 rounded-lg" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-lg lg:col-span-2" />
        <Skeleton className="h-80 rounded-lg" />
      </div>
    </div>
  </div>
);
