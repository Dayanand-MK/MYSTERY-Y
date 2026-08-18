import { Archive } from 'lucide-react';

interface EvidenceLockerProps {
  caseNumber: string;
  briefingTitle: string;
}

/** Deliberately does not derive entries from question options, which could expose answers. */
export default function EvidenceLocker({ caseNumber, briefingTitle }: EvidenceLockerProps) {
  return (
    <section className="border border-detective-border/70 bg-black/20 p-3 rounded space-y-2">
      <h3 className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-detective-amber uppercase">
        <Archive className="w-3.5 h-3.5" /> Evidence Locker
      </h3>
      <div className="border border-dashed border-detective-border/70 bg-black/20 px-2.5 py-2 text-[10px] text-stone-300">
        <span className="block text-detective-muted text-[9px] mb-1">CASE REFERENCE</span>
        <span className="font-bold">{caseNumber} — {briefingTitle}</span>
      </div>
      <p className="text-[9px] leading-relaxed text-detective-muted">Use the supplied physical case file for evidence. No digital evidence index is configured for this case, so this locker intentionally adds no clues.</p>
    </section>
  );
}
