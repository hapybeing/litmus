import { FileSpreadsheet } from 'lucide-react';

interface DropCurtainProps {
  visible: boolean;
}

export function DropCurtain({ visible }: DropCurtainProps) {
  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none"
      style={{
        backgroundColor: 'rgba(239, 244, 255, 0.92)',
      }}
      aria-live="polite"
    >
      <div
        className="w-full h-full flex flex-col items-center justify-center relative"
        style={{
          border: '1.5px dashed var(--ink-cobalt)',
          borderRadius: '2px',
        }}
      >
        {/* Architectural corner register marks */}
        <span
          className="absolute top-3 left-3 w-3 h-3 border-t-2 border-l-2"
          style={{ borderColor: 'var(--ink-cobalt)' }}
        />
        <span
          className="absolute top-3 right-3 w-3 h-3 border-t-2 border-r-2"
          style={{ borderColor: 'var(--ink-cobalt)' }}
        />
        <span
          className="absolute bottom-3 left-3 w-3 h-3 border-b-2 border-l-2"
          style={{ borderColor: 'var(--ink-cobalt)' }}
        />
        <span
          className="absolute bottom-3 right-3 w-3 h-3 border-b-2 border-r-2"
          style={{ borderColor: 'var(--ink-cobalt)' }}
        />

        <FileSpreadsheet
          className="w-8 h-8 mb-3"
          strokeWidth={1.5}
          style={{ color: 'var(--ink-cobalt)' }}
          aria-hidden="true"
        />
        <div
          className="font-editorial text-[34px] leading-tight"
          style={{ color: 'var(--ink-primary)' }}
        >
          Drop Specimen onto Bench
        </div>
        <div
          className="mt-2 micro-label"
          style={{ color: 'var(--ink-cobalt)' }}
        >
          DROP SPECIMEN · CSV / TSV / PDF · 100% BROWSER-NATIVE
        </div>
        <p className="mt-2 text-[12.5px]" style={{ color: 'var(--ink-slate)' }}>
          CSV / TSV tables parse directly into Lab 02 GRIM &amp; GRIMMER verification with zero server upload.
        </p>
      </div>
    </div>
  );
}
