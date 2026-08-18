interface InvestigationProgressProps {
  answered: number;
  total: number;
}

export default function InvestigationProgress({ answered, total }: InvestigationProgressProps) {
  const percentage = total ? Math.round((answered / total) * 100) : 0;
  return (
    <section className="border border-detective-border/70 bg-black/20 rounded p-3">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider">
        <span className="font-bold text-detective-muted">Investigation Progress</span>
        <span className="font-bold text-white">{answered} / {total}</span>
      </div>
      <div className="mt-2 h-1.5 bg-black/60 border border-white/5 overflow-hidden" role="progressbar" aria-valuenow={answered} aria-valuemin={0} aria-valuemax={total}>
        <div className="h-full bg-detective-crimson transition-all duration-300" style={{ width: `${percentage}%` }} />
      </div>
      <p className="mt-1.5 text-[9px] text-detective-muted">Completion only. Answer evaluation remains classified.</p>
    </section>
  );
}
