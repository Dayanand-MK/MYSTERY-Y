import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, RotateCcw, FileText, ShieldAlert, Loader } from 'lucide-react';

interface CaseBriefingProps {
  caseInfo: {
    case_number: string;
    title: string;
    description?: string;
    briefing_media_type?: 'none' | 'video' | 'audio';
    briefing_media_url?: string;
    briefing_title?: string;
    briefing_text?: string;
  };
  teamName: string;
  teamSize?: string;
  isBeforeStart: boolean;
  onBegin?: () => Promise<void>;
  isStarting?: boolean;
}

export default function CaseBriefing({
  caseInfo,
  teamName,
  teamSize = '2–3 MEMBERS',
  isBeforeStart,
  onBegin,
  isStarting = false
}: CaseBriefingProps) {
  const mediaType = caseInfo.briefing_media_type || 'none';
  const mediaUrl = caseInfo.briefing_media_url || '';
  const briefingTitle = caseInfo.briefing_title || 'Case Briefing';
  const briefingText = caseInfo.briefing_text || caseInfo.description || '';

  return (
    <div className="max-w-3xl w-full bg-detective-panel border border-detective-border rounded shadow-[0_10px_35px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden font-mono">
      
      {/* Dossier Header Stamp */}
      <div className="bg-black/40 border-b border-detective-border px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <span className="text-[10px] text-detective-crimson font-bold tracking-widest uppercase block">
            CLASSIFIED DOSSIER
          </span>
          <h1 className="text-lg font-bold text-white uppercase mt-0.5">
            {briefingTitle}
          </h1>
        </div>
        <span className="text-[10px] border-2 border-detective-crimson text-detective-alert px-2.5 py-0.5 rounded font-bold uppercase tracking-widest animate-pulse-subtle">
          CASE STATUS: INVESTIGATION REVIEW
        </span>
      </div>

      <div className="p-6 md:p-8 space-y-6 flex-grow">
        
        {/* Case Metadata Table */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-black/35 rounded border border-detective-border/60 p-4 text-xs">
          <div>
            <span className="block text-[10px] text-detective-muted uppercase font-bold mb-0.5">CASE ID</span>
            <span className="font-bold text-white uppercase tracking-wider">{caseInfo.case_number}</span>
          </div>
          <div>
            <span className="block text-[10px] text-detective-muted uppercase font-bold mb-0.5">CASE STATUS</span>
            <span className="font-bold text-detective-amber uppercase">INVESTIGATION REVIEW</span>
          </div>
          <div>
            <span className="block text-[10px] text-detective-muted uppercase font-bold mb-0.5">YOUR ROLE</span>
            <span className="font-bold text-white uppercase truncate block">INDEPENDENT INVESTIGATION TEAM</span>
          </div>
          <div>
            <span className="block text-[10px] text-detective-muted uppercase font-bold mb-0.5">TEAM</span>
            <span className="font-bold text-white uppercase truncate block" title={teamName}>{teamName}</span>
          </div>
        </div>

        {/* Media Player Section */}
        {mediaType === 'video' && mediaUrl ? (
          <CaseVideoPlayer src={mediaUrl} caseNumber={caseInfo.case_number} />
        ) : mediaType === 'audio' && mediaUrl ? (
          <CaseAudioPlayer src={mediaUrl} caseNumber={caseInfo.case_number} />
        ) : (
          <div className="bg-black/25 rounded border border-detective-border/50 p-6 text-xs text-detective-text leading-relaxed space-y-3 relative overflow-hidden">
            <div className="absolute top-2 right-2 opacity-5 pointer-events-none">
              <FileText className="w-24 h-24 text-white" />
            </div>
            <div className="font-bold text-detective-crimson uppercase tracking-wider border-b border-white/5 pb-1">
              Case Orientation Summary
            </div>
            <p className="whitespace-pre-line text-stone-300">
              {briefingText}
            </p>
          </div>
        )}

        {/* Text Briefing content (only rendered under audio/video player if media is present) */}
        {mediaType !== 'none' && briefingText && (
          <div className="bg-black/10 rounded border border-detective-border/40 p-4 text-xs text-stone-400 leading-relaxed">
            <span className="block text-[10px] text-detective-muted uppercase font-bold mb-1.5 border-b border-white/5 pb-0.5">
              Briefing Text Note
            </span>
            <p className="whitespace-pre-line">{briefingText}</p>
          </div>
        )}

        {/* Security / Submission Rules Box */}
        <div className="border border-detective-crimson/25 bg-detective-crimson/5 rounded p-4 text-[11px] leading-relaxed text-stone-300 space-y-2">
          <div className="font-bold text-detective-alert flex items-center gap-1.5 uppercase tracking-wide">
            <ShieldAlert className="w-4 h-4 flex-shrink-0" /> SECURITY CODE AND INVESTIGATION PROTOCOL
          </div>
          <ul className="list-disc pl-4 space-y-1 text-stone-400">
            <li>The physical case file remains the <strong>PRIMARY</strong> source of investigation evidence.</li>
            <li>Pressing 'Begin Investigation' starts the official server countdown clock.</li>
            <li>Tab switches, defocusing, and clipboard tamper attempts are logged and trigger screen lockouts.</li>
            <li>Make sure all answers are finalized and submitted before the case timer expires.</li>
          </ul>
        </div>
      </div>

      {/* Before-start button controls */}
      {isBeforeStart && onBegin && (
        <div className="bg-black/50 border-t border-detective-border p-6 flex flex-col items-center gap-4">
          <div className="text-center text-xs text-detective-muted italic">
            "Your investigation begins when you click the clearance button below."
          </div>
          <button
            onClick={onBegin}
            disabled={isStarting}
            className="max-w-xs w-full flex items-center justify-center gap-2 bg-detective-crimson hover:bg-detective-alert text-white py-3.5 rounded font-mono uppercase tracking-widest font-bold border border-detective-crimson/50 hover:shadow-[0_0_15px_rgba(211,47,47,0.4)] transition-all duration-300 disabled:opacity-50 text-xs"
          >
            {isStarting ? (
              <>
                <Loader className="w-4 h-4 animate-spin" /> Starting Server Clock...
              </>
            ) : (
              'Begin Investigation'
            )}
          </button>
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   SUB-COMPONENT: Custom Case Video Player
   ========================================================================= */
function CaseVideoPlayer({ src, caseNumber }: { src: string; caseNumber: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState(0);

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(err => console.error(err));
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    setCurrentTime(videoRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    const seekVal = parseFloat(e.target.value);
    videoRef.current.currentTime = seekVal;
    setCurrentTime(seekVal);
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const nextMuted = !isMuted;
    videoRef.current.muted = nextMuted;
    setIsMuted(nextMuted);
    if (!nextMuted && volume === 0) {
      videoRef.current.volume = 0.5;
      setVolume(0.5);
    }
  };

  const formatVideoTime = (time: number) => {
    if (isNaN(time)) return '00:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="relative bg-black rounded border border-detective-border overflow-hidden cctv-overlay group">
      
      {/* CCTV HUD Overlay */}
      <div className="absolute top-4 left-4 z-20 pointer-events-none font-mono text-[9px] text-green-500 tracking-wider space-y-0.5">
        <div className="flex items-center gap-1 font-bold">
          <span className="w-1.5 h-1.5 bg-red-600 rounded-full animate-pulse"></span>
          RECORDING [CLASSIFIED CASE BRIEFING]
        </div>
        <div>CASE: {caseNumber}</div>
      </div>

      <video
        ref={videoRef}
        src={src}
        className="w-full aspect-video object-cover"
        muted={isMuted}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
        playsInline
        controlsList="nodownload"
      />

      {/* Control overlay HUD */}
      <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20 font-mono text-xs">
        
        {/* Scrubber seekbar */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] text-detective-muted">{formatVideoTime(currentTime)}</span>
          <input
            type="range"
            min="0"
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="flex-grow h-1 bg-detective-border roundedappearance-none cursor-pointer accent-detective-crimson"
          />
          <span className="text-[10px] text-detective-muted">{formatVideoTime(duration)}</span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={handlePlayPause} className="text-white hover:text-detective-crimson transition-colors">
              {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white" />}
            </button>

            <button
              onClick={() => {
                if (videoRef.current) {
                  videoRef.current.currentTime = 0;
                  setCurrentTime(0);
                }
              }}
              className="text-white hover:text-detective-crimson transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <button onClick={toggleMute} className="text-white hover:text-detective-crimson transition-colors">
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
          <span className="text-[10px] text-stone-500 uppercase tracking-widest font-bold">
            CASE BRIEFING VIDEO
          </span>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   SUB-COMPONENT: Custom Case Audio Player
   ========================================================================= */
function CaseAudioPlayer({ src, caseNumber }: { src: string; caseNumber: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  const handlePlayPause = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(err => console.error(err));
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    setCurrentTime(audioRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (!audioRef.current) return;
    setDuration(audioRef.current.duration);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const seekVal = parseFloat(e.target.value);
    audioRef.current.currentTime = seekVal;
    setCurrentTime(seekVal);
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const formatAudioTime = (time: number) => {
    if (isNaN(time)) return '00:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="bg-black/40 border border-detective-border rounded p-6 font-mono text-xs text-stone-300 space-y-4">
      <div className="flex justify-between items-start border-b border-white/10 pb-2">
        <div>
          <span className="text-[9px] text-detective-amber font-bold tracking-widest uppercase">
            [ DIGITAL CASE BRIEFING ]
          </span>
          <h4 className="text-white font-bold uppercase mt-1">CASE: {caseNumber}</h4>
        </div>
      </div>

      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
      />

      {/* Waveform Equalizer Visualizer */}
      <div className="h-16 flex items-end justify-center gap-1 bg-black/60 border border-white/5 rounded px-4 py-2">
        {Array.from({ length: 28 }).map((_, idx) => {
          const animDelay = `${idx * 0.04}s`;
          return (
            <div
              key={idx}
              style={{
                height: isPlaying ? '100%' : '15%',
                animationDelay: animDelay,
              }}
              className={`w-1.5 bg-detective-amber rounded-t transition-all duration-300 ${
                isPlaying ? 'animate-audio-bar' : ''
              }`}
            />
          );
        })}
      </div>

      {/* Scrubber Seek bar */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-detective-muted">{formatAudioTime(currentTime)}</span>
        <input
          type="range"
          min="0"
          max={duration || 100}
          value={currentTime}
          onChange={handleSeek}
          className="flex-grow h-1 bg-stone-800 rounded appearance-none cursor-pointer accent-detective-amber"
        />
        <span className="text-[10px] text-detective-muted">{formatAudioTime(duration)}</span>
      </div>

      {/* Controls Bar */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-3">
          <button
            onClick={handlePlayPause}
            className="w-9 h-9 rounded-full bg-detective-amber text-black hover:bg-yellow-600 flex items-center justify-center transition-colors shadow-md"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-black" />
            ) : (
              <Play className="w-4 h-4 fill-black ml-0.5" />
            )}
          </button>

          <button
            onClick={() => {
              if (audioRef.current) {
                audioRef.current.currentTime = 0;
                setCurrentTime(0);
              }
            }}
            className="text-stone-400 hover:text-white transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        <span className="text-[10px] text-stone-500 uppercase tracking-widest font-bold">
          CASE BRIEFING AUDIO
        </span>

        {/* Volume toggler */}
        <button onClick={toggleMute} className="text-stone-400 hover:text-white transition-colors">
          {isMuted ? <VolumeX className="w-4.5 h-4.5" /> : <Volume2 className="w-4.5 h-4.5" />}
        </button>
      </div>
    </div>
  );
}
