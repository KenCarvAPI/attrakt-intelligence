import { Skeleton } from '@/components/states';
import { Card, CardContent } from '@/components/ui/card';

export default function MembersLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-7 w-36" />
        <Skeleton className="mt-2 h-4 w-80" />
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-[150px]" />
        <Skeleton className="h-10 w-[150px]" />
      </div>
      <Card>
        <CardContent className="space-y-3 p-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
