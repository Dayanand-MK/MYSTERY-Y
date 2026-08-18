import { useEffect, useState } from 'react';
import { CheckCircle, FilePenLine } from 'lucide-react';

interface InvestigationNotesProps {
  teamId: string;
  sessionId: string;
  disabled?: boolean;
}

export default function InvestigationNotes({ teamId, sessionId, disabled = false }: InvestigationNotesProps) {
  const storageKey = `mystery_y_notes_${teamId}_${sessionId}`;
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setNotes(localStorage.getItem(storageKey) || '');
  }, [storageKey]);

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), 1800);
    return () => window.clearTimeout(timer);
  }, [saved]);

  const save = (value: string) => {
    setNotes(value);
    localStorage.setItem(storageKey, value);
    setSaved(true);
  };

  return (
    <section className="border border-detective-border/70 bg-black/20 p-3 rounded space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-detective-amber uppercase">
          <FilePenLine className="w-3.5 h-3.5" /> Investigation Notes
        </h3>
        {saved && <span className="flex items-center gap-1 text-[9px] text-detective-green"><CheckCircle className="w-3 h-3" /> SAVED LOCALLY</span>}
      </div>
      <textarea
        aria-label="Investigation Notes"
        disabled={disabled}
        value={notes}
        onChange={(event) => save(event.target.value)}
        placeholder="Record your team's private deductions, connections and observations..."
        className="w-full min-h-28 resize-y bg-black/30 border border-detective-border/60 rounded p-2.5 text-xs text-stone-200 leading-relaxed outline-none focus:border-detective-crimson disabled:opacity-50"
      />
      <p className="text-[9px] text-detective-muted">Private to this team on this device. Notes are not scored or submitted as answers.</p>
    </section>
  );
}
