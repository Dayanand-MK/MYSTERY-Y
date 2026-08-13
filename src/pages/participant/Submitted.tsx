import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Calendar, ArrowRight, Loader } from 'lucide-react';

interface ReceiptData {
  submission_id_label: string;
  team_name: string;
  case_number: string;
  time_taken: string;
  submitted_at: string;
}

export default function Submitted() {
  const navigate = useNavigate();
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  useEffect(() => {
    const data = localStorage.getItem('mystery_y_receipt');
    if (data) {
      setReceipt(JSON.parse(data));
    }
  }, []);

  const handleFinish = () => {
    // Clear receipts and return to Landing
    localStorage.removeItem('mystery_y_receipt');
    navigate('/');
  };

  if (!receipt) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-detective-dark font-mono text-sm text-detective-muted">
        <Loader className="w-6 h-6 animate-spin text-detective-crimson mb-2" />
        PROCESSING RECEIPT LOGS...
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-start bg-detective-dark py-12 px-4 cctv-overlay overflow-y-auto">
      <div className="max-w-md w-full bg-detective-paper text-detective-dark rounded p-8 shadow-[0_10px_30px_rgba(0,0,0,0.5)] border-l-[16px] border-detective-dark my-auto">
        
        {/* Receipt header stamped */}
        <div className="text-center border-b border-dashed border-detective-dark/20 pb-6 mb-6">
          <div className="inline-flex items-center justify-center bg-detective-green/10 text-detective-green p-3 rounded-full mb-3 border border-detective-green">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-mono font-bold uppercase tracking-tight text-detective-dark">
            Case Closed
          </h1>
          <div className="text-[10px] text-stone-500 uppercase tracking-widest font-mono mt-1">
            Official Receipt Logged
          </div>
        </div>

        {/* Dossier Receipt styling */}
        <div className="font-mono text-xs space-y-4 mb-8 bg-black/5 p-4 rounded border border-black/5 text-detective-dark">
          <div className="flex justify-between border-b border-black/10 pb-1.5">
            <span className="text-stone-500">RECEIPT INDEX:</span>
            <span className="font-bold text-detective-crimson">{receipt.submission_id_label}</span>
          </div>

          <div className="flex justify-between border-b border-black/10 pb-1.5">
            <span className="text-stone-500">TEAM:</span>
            <span className="font-bold text-right uppercase truncate max-w-[200px]">{receipt.team_name}</span>
          </div>

          <div className="flex justify-between border-b border-black/10 pb-1.5">
            <span className="text-stone-500">CASE ID:</span>
            <span className="font-bold">{receipt.case_number}</span>
          </div>

          <div className="flex justify-between border-b border-black/10 pb-1.5">
            <span className="text-stone-500">DURATION:</span>
            <span className="font-bold">{receipt.time_taken}</span>
          </div>

          <div className="flex justify-between border-b border-black/10 pb-1.5">
            <span className="text-stone-500">TIMESTAMP:</span>
            <span className="font-bold">{new Date(receipt.submitted_at).toLocaleTimeString()}</span>
          </div>

          <div className="flex justify-between items-center pt-2">
            <span className="text-stone-500">STATUS:</span>
            <span className="text-[10px] bg-detective-green text-white font-bold px-2 py-0.5 rounded tracking-widest uppercase">
              RECEIVED
            </span>
          </div>
        </div>

        {/* Message for symposium organizers */}
        <p className="font-mono text-center text-[10px] text-stone-500 leading-relaxed mb-8">
          Provide your unique <strong>Receipt Index</strong> to the symposium desk. Do not share this index with other teams.
        </p>

        {/* CTA */}
        <button
          onClick={handleFinish}
          className="w-full flex items-center justify-center gap-2 bg-detective-dark hover:bg-detective-crimson text-white py-3.5 rounded font-mono uppercase tracking-wider font-bold transition-all duration-300 shadow-md"
        >
          Exit Workstation <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
