import React from 'react';

export type ActionIconName =
  | 'flipH'
  | 'flipV'
  | 'rotate'
  | 'trash'
  | 'sliders'
  | 'plus'
  | 'tidy'
  | 'copy'
  | 'duplicate'
  | 'paste'
  | 'fit'
  | 'wand';

export const ActionIcon: React.FC<{ name: ActionIconName; size?: number }> = ({ name, size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
    {name === 'flipH' && (
      <path d="M8 2.5V13.5M5.5 5.5L2.5 8L5.5 10.5M10.5 5.5L13.5 8L10.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    )}
    {name === 'flipV' && (
      <path d="M2.5 8H13.5M5.5 5.5L8 2.5L10.5 5.5M5.5 10.5L8 13.5L10.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    )}
    {name === 'rotate' && (
      <path d="M12.5 5.5A4.8 4.8 0 1 0 12.8 9.2M12.5 2.5V5.8H9.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    )}
    {name === 'trash' && (
      <path d="M3 4.5H13M6 4.5V3H10V4.5M5 4.5L5.6 13H10.4L11 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    )}
    {name === 'sliders' && (
      <>
        <path d="M3 4.5H13M3 8H13M3 11.5H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="6" cy="4.5" r="1.4" fill="var(--bg-elevated)" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="10.5" cy="8" r="1.4" fill="var(--bg-elevated)" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="7" cy="11.5" r="1.4" fill="var(--bg-elevated)" stroke="currentColor" strokeWidth="1.4" />
      </>
    )}
    {name === 'plus' && (
      <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    )}
    {name === 'tidy' && (
      <path d="M2 4H6V12H14M2 12H4M9 4H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    )}
    {name === 'copy' && (
      <>
        <rect x="5.5" y="5.5" width="8" height="8" rx="1.4" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10.5 5.5V3.9C10.5 3.1 9.9 2.5 9.1 2.5H3.9C3.1 2.5 2.5 3.1 2.5 3.9V9.1C2.5 9.9 3.1 10.5 3.9 10.5H5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </>
    )}
    {name === 'duplicate' && (
      <>
        <rect x="2.5" y="2.5" width="7.5" height="7.5" rx="1.4" stroke="currentColor" strokeWidth="1.5" />
        <rect x="6" y="6" width="7.5" height="7.5" rx="1.4" fill="var(--bg-elevated)" stroke="currentColor" strokeWidth="1.5" />
        <path d="M9.75 8.2V11.3M8.2 9.75H11.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </>
    )}
    {name === 'paste' && (
      <>
        <rect x="3.5" y="4" width="9" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6 4V3C6 2.45 6.45 2 7 2H9C9.55 2 10 2.45 10 3V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M6 8H10M6 10.5H8.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </>
    )}
    {name === 'fit' && (
      <path d="M2.5 6V3.5C2.5 2.95 2.95 2.5 3.5 2.5H6M10 2.5H12.5C13.05 2.5 13.5 2.95 13.5 3.5V6M13.5 10V12.5C13.5 13.05 13.05 13.5 12.5 13.5H10M6 13.5H3.5C2.95 13.5 2.5 13.05 2.5 12.5V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    )}
    {name === 'wand' && (
      <>
        <path d="M2.8 13.2L9.4 6.6M8.2 5.4L10.6 7.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M11.5 2V4.4M10.3 3.2H12.7M13.2 6.8V8.6M12.3 7.7H14.1M6.2 2.4V3.8M5.5 3.1H6.9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </>
    )}
  </svg>
);
