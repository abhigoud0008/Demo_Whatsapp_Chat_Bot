import React from 'react';
import { cn } from '../../lib/utils';

export const BentoGrid: React.FC<{
  className?: string;
  children: React.ReactNode;
}> = ({ className, children }) => {
  return (
    <div className={cn('grid grid-cols-1 gap-5 lg:grid-cols-12', className)}>
      {children}
    </div>
  );
};

export const BentoGridItem: React.FC<{
  className?: string;
  title?: string;
  subtitle?: string;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}> = ({ className, title, subtitle, headerAction, children }) => {
  return (
    <section
      className={cn(
        'flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-5',
        className
      )}
    >
      {(title || headerAction) && (
        <div className="mb-4 flex items-start justify-between gap-4 border-b border-slate-100 pb-3.5">
          <div className="min-w-0">
            {title && (
              <h2 className="font-display text-base font-semibold tracking-tight text-slate-900">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
            )}
          </div>
          {headerAction && <div className="shrink-0">{headerAction}</div>}
        </div>
      )}
      <div className="flex-1">{children}</div>
    </section>
  );
};
