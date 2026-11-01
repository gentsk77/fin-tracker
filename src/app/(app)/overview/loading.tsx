import {
  AttentionBannerSkeleton,
  CardSkeleton,
} from "@/components/ui/card-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function OverviewLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-64" />
      </div>

      <AttentionBannerSkeleton />
      <CardSkeleton heightClass="h-[340px]" />
      <CardSkeleton heightClass="h-[180px]" />
      <CardSkeleton heightClass="h-[180px]" />

      <div className="grid gap-4 lg:grid-cols-2">
        <CardSkeleton heightClass="h-[260px]" />
        <CardSkeleton heightClass="h-[260px]" />
      </div>
    </div>
  );
}
