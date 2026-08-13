import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, CheckSquare } from 'lucide-react';

export default function Rules() {
  const navigate = useNavigate();

  const protocols = [
    "Each team consists of 2–3 members. Solo attempts are strictly prohibited.",
    "Use only physical case file folder contents and digital evidence dashboard. External searching is monitored.",
    "Do not communicate clues, answers, or passwords with other teams.",
    "Investigation timer starts exactly when 'BEGIN INVESTIGATION' is pressed.",
    "Answers are saved automatically in real-time. Do not close the window voluntarily.",
    "Once submitted, answers are permanently locked and cannot be edited.",
    "Tab switches, window defocusing, and copy/paste limits are logged to the Security Command Center.",
    "Repeated security logs (exceeding limit of 2 warnings) will flag the team for immediate admin disqualification review.",
    "The decision of the lead organizers and evaluators is absolute and final."
  ];

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-start bg-detective-dark py-12 px-4 cctv-overlay">
      {/* Dossier Dossier Outer Container */}
      <div className="max-w-2xl w-full bg-detective-paper text-detective-dark rounded p-8 md:p-12 relative shadow-[0_10px_30px_rgba(0,0,0,0.5)] border-l-[16px] border-detective-crimson/80">
        
        {/* Top Header Stamp */}
        <div className="flex justify-between items-start border-b border-dashed border-detective-dark/20 pb-6 mb-8">
          <div>
            <h2 className="font-mono text-xs uppercase tracking-widest text-stone-500">Department of Forensic Intel</h2>
            <h1 className="text-3xl font-mono font-bold uppercase tracking-tight text-detective-dark mt-1">
              Investigation Protocol
            </h1>
          </div>
          <div className="text-right">
            <span className="text-detective-crimson font-mono font-bold border-2 border-detective-crimson text-xs uppercase tracking-widest px-2.5 py-1 rotate-12 inline-block">
              CLASSIFIED
            </span>
            <div className="font-mono text-[10px] text-stone-500 mt-2">DOC-ID: Y-PROT-2026</div>
          </div>
        </div>

        {/* Introduction */}
        <p className="font-mono text-sm leading-relaxed text-detective-dark/80 mb-6">
          To all field agents: Before initiating case access, you must thoroughly digest and verify the following operational codes. Failure to comply with security guidelines is subject to immediate suspension.
        </p>

        {/* Checklist */}
        <div className="space-y-4 font-mono text-sm text-detective-dark mb-8">
          {protocols.map((protocol, index) => (
            <div key={index} className="flex items-start gap-3 bg-black/5 p-3 rounded border border-black/5">
              <span className="text-detective-crimson font-bold min-w-[20px]">{String(index + 1).padStart(2, '0')}.</span>
              <p className="leading-relaxed">{protocol}</p>
            </div>
          ))}
        </div>

        {/* Security Alert Note */}
        <div className="flex items-center gap-3 border border-detective-crimson/30 bg-detective-crimson/5 text-detective-crimson p-4 rounded mb-8 font-mono text-xs">
          <ShieldAlert className="w-5 h-5 flex-shrink-0" />
          <p>
            <strong>SYSTEM WARNING:</strong> The workstation tracking code is fully armed. Any attempts to cheat, inspect elements, or clone sessions are logged instantly.
          </p>
        </div>

        {/* CTA */}
        <div className="flex justify-end pt-4 border-t border-dashed border-detective-dark/20">
          <button
            onClick={() => navigate('/register')}
            className="flex items-center gap-2 bg-detective-dark hover:bg-detective-crimson text-white font-mono uppercase tracking-wider text-sm px-6 py-3 rounded transition-colors duration-200"
          >
            <CheckSquare className="w-4 h-4" />
            Acknowledge & Register Team
          </button>
        </div>
      </div>
    </div>
  );
}
