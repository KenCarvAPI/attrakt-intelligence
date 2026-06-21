'use client';

import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/** A shimmering placeholder block used by route loading skeletons. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted/60 ${className}`} />;
}

/**
 * Shared error boundary UI for dashboard route segments. Next.js error.tsx files
 * are thin wrappers around this so every page degrades the same way: a clear
 * message and a retry that re-runs the failed server render.
 */
export function PageError({
  title = 'Something went wrong',
  error,
  reset,
}: {
  title?: string;
  error?: Error;
  reset?: () => void;
}) {
  return (
    <Card className="mx-auto mt-10 max-w-lg">
      <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/15">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {error?.message || 'The data could not be loaded. This is usually transient.'}
          </p>
        </div>
        {reset && (
          <Button variant="outline" size="sm" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" /> Try again
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
