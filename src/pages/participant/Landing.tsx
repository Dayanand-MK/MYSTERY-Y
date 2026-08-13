import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Terminal, Shield, FolderOpen } from 'lucide-react';

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-detective-dark px-4 overflow-hidden cctv-overlay">
      {/* Animated CRT Scanline */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-20">
        <div className="w-full h-[2px] bg-detective-crimson/10 opacity-30 shadow-[0_0_8px_rgba(211,47,47,0.5)] animate-scanline"></div>
      </div>

      {/* Cyber radar circle background */}
      <div className="absolute w-[500px] h-[500px] rounded-full border border-detective-border/20 flex items-center justify-center pointer-events-none opacity-20 z-0">
        <div className="w-[350px] h-[350px] rounded-full border border-detective-border/30 flex items-center justify-center">
          <div className="w-[200px] h-[200px] rounded-full border border-detective-border/40 border-dashed"></div>
        </div>
      </div>

      {/* Landing Board Header */}
      <div className="text-center z-10 max-w-lg">
        {/* Dossier Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-detective-crimson/10 text-detective-alert border border-detective-crimson/30 rounded font-mono text-xs uppercase tracking-wider mb-6">
          <Shield className="w-3.5 h-3.5 animate-pulse" />
          Classified Investigation Area
        </div>

        {/* Main Title */}
        <h1 className="text-6xl font-mono font-bold tracking-tight text-white select-none">
          MYSTERY <span className="text-detective-crimson">Y</span>
        </h1>
        
        {/* Wording Tagline */}
        <p className="mt-3 text-detective-muted font-mono tracking-widest uppercase text-sm">
          "Every clue matters. Every second counts."
        </p>

        {/* Redacted Line Details */}
        <div className="my-8 flex justify-center items-center gap-1.5 text-xs text-detective-muted/50 font-mono">
          <span>CASE NO: </span>
          <span className="bg-white/10 text-transparent select-none px-2 rounded">MY-XXXX-XX</span>
          <span>• PROTOCOL: </span>
          <span className="bg-white/10 text-transparent select-none px-4 rounded">CONFIDENTIAL</span>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => navigate('/register')}
            className="group flex items-center justify-center gap-2 bg-detective-crimson hover:bg-detective-alert text-white font-mono uppercase tracking-wider text-sm px-6 py-3 border border-detective-border rounded shadow-[0_0_15px_rgba(139,0,0,0.3)] transition-all duration-300"
          >
            <FolderOpen className="w-4 h-4" />
            Enter Case
          </button>
          
          <button
            onClick={() => navigate('/rules')}
            className="flex items-center justify-center gap-2 bg-detective-panel hover:bg-detective-border text-detective-text font-mono uppercase tracking-wider text-sm px-6 py-3 border border-detective-border rounded transition-all duration-200"
          >
            <Terminal className="w-4 h-4" />
            Case Protocol
          </button>
        </div>
      </div>

      {/* Admin shortcut link at the bottom */}
      <div className="absolute bottom-6 z-10 font-mono text-xs text-detective-muted">
        System access: {' '}
        <button
          onClick={() => navigate('/admin/login')}
          className="text-detective-crimson hover:text-detective-alert underline decoration-dotted transition-colors"
        >
          Access Command Center
        </button>
      </div>
    </div>
  );
}
