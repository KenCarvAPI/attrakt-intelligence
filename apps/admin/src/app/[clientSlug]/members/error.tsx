'use client';

import { PageError } from '@/components/states';

export default function MembersError({ error, reset }: { error: Error; reset: () => void }) {
  return <PageError title="Couldn't load members" error={error} reset={reset} />;
}
