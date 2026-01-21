import { Skeleton } from "@uni-status/ui";

export default function StatusPageLoading() {
  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header skeleton */}
        <div className="text-center">
          <Skeleton className="mx-auto h-16 w-16 rounded-full" />
          <Skeleton className="mx-auto mt-4 h-8 w-48" />
          <Skeleton className="mx-auto mt-2 h-4 w-64" />
        </div>

        {/* Overall status banner skeleton */}
        <Skeleton className="mt-6 h-28 w-full rounded-lg" />

        {/* Monitors section skeleton */}
        <div className="mt-8 space-y-4">
          <Skeleton className="h-6 w-24" />

          {/* Monitor items */}
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 flex-1">
                  <Skeleton className="h-3 w-3 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="mt-1 h-4 w-48" />
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <Skeleton className="h-3 w-12" />
                    <Skeleton className="mt-1 h-4 w-16" />
                  </div>
                  <div className="text-right">
                    <Skeleton className="h-3 w-14" />
                    <Skeleton className="mt-1 h-4 w-12" />
                  </div>
                </div>
              </div>
              <Skeleton className="mt-4 h-6 w-full rounded" />
              <div className="mt-1 flex justify-between">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-12" />
              </div>
            </div>
          ))}
        </div>

        {/* Subscribe section skeleton */}
        <div className="mt-12 border-t pt-8">
          <div className="text-center">
            <Skeleton className="mx-auto h-6 w-48" />
            <Skeleton className="mx-auto mt-2 h-4 w-64" />
            <div className="mt-4 flex justify-center gap-3 max-w-md mx-auto">
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-10 w-24" />
            </div>
          </div>
        </div>

        {/* Footer skeleton */}
        <div className="mt-8 border-t pt-6 text-center">
          <Skeleton className="mx-auto h-4 w-32" />
        </div>
      </div>
    </div>
  );
}
