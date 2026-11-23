import React, { useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { cn } from '../../lib/utils';

interface CardSpotlightProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Aceternity UI CardSpotlight surface with subtle cursor-tracked emerald luminance.
 */
export const CardSpotlight: React.FC<CardSpotlightProps> = ({ children, className }) => {
  const shouldReduceMotion = useReducedMotion();
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isFocused, setIsFocused] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (shouldReduceMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setPosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsFocused(true)}
      onMouseLeave={() => setIsFocused(false)}
      className={cn(
        'relative overflow-hidden rounded-xl border border-slate-200/90 bg-white p-5 transition-colors duration-200 hover:border-slate-300',
        className
      )}
    >
      {!shouldReduceMotion && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-px transition-opacity duration-200"
          style={{
            opacity: isFocused ? 1 : 0,
            background: `radial-gradient(280px circle at ${position.x}px ${position.y}px, rgba(13, 148, 136, 0.07), transparent 70%)`,
          }}
        />
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
};
