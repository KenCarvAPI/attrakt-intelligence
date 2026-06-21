import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6 text-center">
      <div className="max-w-md">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">404</p>
        <h1 className="mt-2 text-lg font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          That client or page doesn&apos;t exist. Check the client slug in the URL.
        </p>
        <Button asChild variant="outline" size="sm" className="mt-6">
          <Link href="/">Back to dashboard</Link>
        </Button>
      </div>
    </main>
  );
}
