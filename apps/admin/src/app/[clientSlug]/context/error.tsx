'use client';

import { PageError } from '@/components/states';

export default function ContextError({ error, reset }: { error: Error; reset: () => void }) {
  return <PageError title="Couldn't load the context engine" error={error} reset={reset} />;
}
