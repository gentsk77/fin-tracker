import { Skeleton } from "@/components/ui/skeleton";
import { CardSkeleton, MetricSkeleton } from "@/components/ui/card-skeleton";

export default function InvestmentsLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-72" />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <MetricSkeleton />
        <MetricSkeleton />
        <MetricSkeleton />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CardSkeleton heightClass="h-[240px]" />
        <CardSkeleton heightClass="h-[240px]" />
      </div>

      <CardSkeleton heightClass="h-[160px]" />
    </div>
  );
}
