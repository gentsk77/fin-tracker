import { Skeleton } from "@/components/ui/skeleton";
import { CardSkeleton } from "@/components/ui/card-skeleton";

export default function SpendingLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-72" />
      </div>

      <CardSkeleton heightClass="h-[300px]" />
      <CardSkeleton heightClass="h-[320px]" />
      <CardSkeleton heightClass="h-[400px]" />
    </div>
  );
}
