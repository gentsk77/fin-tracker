import {
  CardSkeleton,
  MetricSkeleton,
} from "@/components/ui/card-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function NetWorthLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-72" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricSkeleton />
        <MetricSkeleton />
        <MetricSkeleton />
      </div>

      <CardSkeleton heightClass="h-[340px]" />
      <CardSkeleton heightClass="h-[260px]" />
      <CardSkeleton heightClass="h-[200px]" />
      <CardSkeleton heightClass="h-[160px]" />
    </div>
  );
}
