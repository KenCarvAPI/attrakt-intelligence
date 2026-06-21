import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Lightweight styled native <select>. Native is deliberate: the filters are
 * simple, and a native control is robust and keyboard-accessible with zero JS.
 */
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          'h-9 w-full appearance-none rounded-md border border-input bg-transparent pl-3 pr-8 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>option]:bg-popover [&>option]:text-popover-foreground',
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
);
Select.displayName = 'Select';

export { Select };
