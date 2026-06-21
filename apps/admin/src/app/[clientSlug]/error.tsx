'use client';

import { PageError } from '@/components/states';

export default function OverviewError({ error, reset }: { error: Error; reset: () => void }) {
  return <PageError title="Couldn't load the overview" error={error} reset={reset} />;
}
