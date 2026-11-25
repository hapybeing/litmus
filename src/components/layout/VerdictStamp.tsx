import type { VerdictType } from '../../types/forensics';

interface VerdictStampProps {
  verdict: VerdictType;
  size?: 'sm' | 'md';
  animateKey?: string;
}

const VERDICT_STYLES: Record<
  VerdictType,
  {
    color: string;
    bg: string;
    border: string;
    glyph: string;
    shortLabel?: string;
  }
> = {
  VERIFIED: {
    color: 'var(--ink-forest)',
    bg: 'var(--tint-forest)',
    border: 'var(--rule-forest)',
    glyph: '✓',
  },
  'GRIM IMPOSSIBLE': {
    color: 'var(--ink-vermilion)',
    bg: 'var(--tint-vermilion)',
    border: 'var(--rule-vermilion)',
    glyph: '✕',
  },
  'GRIMMER IMPOSSIBLE': {
    color: 'var(--ink-vermilion)',
    bg: 'var(--tint-vermilion)',
    border: 'var(--rule-vermilion)',
    glyph: '✕',
  },
  'DECISION ERROR': {
    color: 'var(--ink-vermilion)',
    bg: 'var(--tint-vermilion)',
    border: 'var(--rule-vermilion)',
    glyph: '✕',
  },
  'ROUNDING DRIFT': {
    color: 'var(--ink-amber)',
    bg: 'var(--tint-amber)',
    border: 'var(--rule-amber)',
    glyph: '▲',
  },
  INAPPLICABLE: {
    color: 'var(--ink-slate)',
    bg: 'var(--bg-inset)',
    border: 'var(--rule-strong)',
    glyph: '○',
  },
};

export function VerdictStamp({ verdict, size = 'sm', animateKey }: VerdictStampProps) {
  const s = VERDICT_STYLES[verdict];
  const padClass = size === 'md' ? 'px-2.5 py-1 text-[10.5px]' : 'px-1.5 py-[3px] text-[9.5px]';

  return (
    <span
      key={animateKey ? `${animateKey}-${verdict}` : verdict}
      className={`animate-ink-stamp inline-flex items-center gap-1.5 font-semibold uppercase tracking-[0.09em] whitespace-nowrap shrink-0 select-none ${padClass}`}
      style={{
        color: s.color,
        backgroundColor: s.bg,
        border: `1px solid ${s.border}`,
        boxShadow: `inset 0 0 0 1px ${s.bg}`,
        borderRadius: '1px',
      }}
    >
      <span aria-hidden="true" className="text-[9px] leading-none">
        {s.glyph}
      </span>
      <span>{verdict}</span>
    </span>
  );
}
