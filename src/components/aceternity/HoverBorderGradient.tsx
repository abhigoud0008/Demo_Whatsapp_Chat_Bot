import React, { useState } from 'react';
import { cn } from '../../lib/utils';

interface HoverBorderGradientProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  containerClassName?: string;
  className?: string;
}

/**
 * Aceternity UI HoverBorderGradient adapted as an accessible single-line action button.
 */
export const HoverBorderGradient: React.FC<HoverBorderGradientProps> = ({
  children,
  containerClassName,
  className,
  disabled,
  ...props
}) => {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type={props.type ?? 'button'}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        'group relative inline-flex items-center justify-center rounded-xl p-[1px] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-55',
        containerClassName
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-0 rounded-xl bg-gradient-to-r from-teal-600/40 via-emerald-500/50 to-teal-700/40 transition-opacity duration-200',
          hovered && !disabled ? 'opacity-100' : 'opacity-65'
        )}
      />
      <span
        className={cn(
          'relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[11px] bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors duration-150 group-hover:bg-slate-800',
          className
        )}
      >
        {children}
      </span>
    </button>
  );
};
