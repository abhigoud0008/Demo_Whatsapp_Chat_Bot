import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '../../lib/utils';

interface SpotlightProps {
  className?: string;
  fill?: string;
}

/**
 * Aceternity UI Spotlight pattern tuned for light enterprise surfaces.
 */
export const Spotlight: React.FC<SpotlightProps> = ({
  className,
  fill = 'rgba(13, 148, 136, 0.14)',
}) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.svg
      initial={shouldReduceMotion ? { opacity: 0.65 } : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'pointer-events-none absolute z-0 h-[140%] w-[130%] lg:w-[85%]',
        className
      )}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 3787 2842"
      fill="none"
      aria-hidden="true"
    >
      <g filter="url(#grievance-spotlight-blur)">
        <ellipse
          cx="1924.71"
          cy="273.501"
          rx="1924.71"
          ry="273.501"
          transform="matrix(-0.822377 -0.568943 -0.568943 0.822377 3631.88 2291.09)"
          fill={fill}
        />
      </g>
      <defs>
        <filter
          id="grievance-spotlight-blur"
          x="0.860352"
          y="0.838989"
          width="3785.16"
          height="2840.26"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation="151" result="effect1_foregroundBlur" />
        </filter>
      </defs>
    </motion.svg>
  );
};
