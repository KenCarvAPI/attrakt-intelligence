import { Skeleton } from '@/components/states';
import { Card, CardContent } from '@/components/ui/card';

export default function ContextLoading() {
  return (
    <div className="space-y-8">
      <div>
        <Skeleton className="h-7 w-48" />
        <Skeleton className="mt-2 h-4 w-96" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><CardContent className="p-6"><Skeleton className="h-28 w-full" /></CardContent></Card>
        ))}
      </div>
      <Card><CardContent className="p-6"><Skeleton className="h-40 w-full" /></CardContent></Card>
    </div>
  );
}
