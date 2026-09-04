/**
 * Small inline SVG icons for buckets and supermarket subcategories.
 * Bucket icons are generic feather-style pictograms drawn in currentColor so
 * they follow the theme. Chain icons are letter badges in arbitrary hues —
 * deliberately NOT the chains' brand colours or logos.
 */

import type { ReactNode } from 'react';

interface IconProps {
  id: string;
  size?: number;
}

function Stroke({ size, children }: { size: number; children: ReactNode }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const BUCKET_GLYPHS: Record<string, ReactNode> = {
  // receipt
  bills: (
    <>
      <path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2z" />
      <path d="M9 7h6M9 11h6" />
    </>
  ),
  // repeat arrows
  subscriptions: (
    <>
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </>
  ),
  // shopping cart
  groceries: (
    <>
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </>
  ),
  // fork and knife
  'eating-out': (
    <>
      <path d="M4 2v5a3 3 0 0 0 6 0V2" />
      <path d="M7 10v12" />
      <path d="M19 2a6 6 0 0 0-2 5c0 2 .8 3 2 4v11" />
    </>
  ),
  // car
  transport: (
    <>
      <path d="M4 13l1.7-4.6A2 2 0 0 1 7.6 7h8.8a2 2 0 0 1 1.9 1.4L20 13" />
      <rect x="2" y="13" width="20" height="5" rx="1.5" />
      <path d="M6.5 21v-3M17.5 21v-3" />
    </>
  ),
  // game controller
  entertainment: (
    <>
      <path d="M7 8h10a5 5 0 0 1 5 5v3a3 3 0 0 1-3 3c-1.2 0-2.2-.6-3-1.5L14.5 16h-5L8 17.5c-.8.9-1.8 1.5-3 1.5a3 3 0 0 1-3-3v-3a5 5 0 0 1 5-5z" />
      <path d="M7.5 12h3M9 10.5v3" />
      <circle cx="16" cy="11.2" r="0.6" fill="currentColor" />
      <circle cx="18" cy="13.2" r="0.6" fill="currentColor" />
    </>
  ),
  // medical cross
  health: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  // dollar sign
  income: (
    <>
      <path d="M12 2v20" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </>
  ),
  // transfer arrows
  savings: (
    <>
      <path d="M17 3l4 4-4 4" />
      <path d="M21 7H8" />
      <path d="M7 21l-4-4 4-4" />
      <path d="M3 17h13" />
    </>
  ),
  // ellipsis
  other: (
    <>
      <circle cx="5" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="19" cy="12" r="1" fill="currentColor" />
    </>
  ),
};

export function BucketIcon({ id, size = 18 }: IconProps) {
  return <Stroke size={size}>{BUCKET_GLYPHS[id] ?? BUCKET_GLYPHS.other}</Stroke>;
}

/** Letter badges; hues are arbitrary and intentionally not brand colours. */
const CHAIN_BADGES: Record<string, { letters: string; color: string }> = {
  aldi: { letters: 'A', color: '#7c6ff0' },
  coles: { letters: 'C', color: '#0fa3a3' },
  woolworths: { letters: 'W', color: '#e08a2e' },
  costco: { letters: 'CO', color: '#d16ba5' },
  other: { letters: '···', color: '#8a8896' },
};

/** Small clock shown next to transactions that have not settled yet. */
export function PendingIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      className="icon pending"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

export function ChainIcon({ id, size = 18 }: IconProps) {
  const badge = CHAIN_BADGES[id] ?? CHAIN_BADGES.other;
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill={badge.color} />
      <text
        x="12"
        y="16.2"
        textAnchor="middle"
        fontSize={badge.letters.length > 1 ? 9 : 12}
        fontWeight="700"
        fill="#fff"
        fontFamily="inherit"
      >
        {badge.letters}
      </text>
    </svg>
  );
}
