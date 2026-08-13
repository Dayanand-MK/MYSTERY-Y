import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize2, RotateCcw } from 'lucide-react';

interface EvidencePlayerProps {
  videoUrl: string;
  evidenceId?: string;
  title?: string;
}

export default function EvidencePlayer({ videoUrl, evidenceId = 'VID-01', title = 'SECURE STORAGE BREACH' }: EvidencePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(true); // Default muted to comply with autoplay/audio rules
  const [volume, setVolume] = useState(0); // Initial volume matching muted state
  const [timestamp, setTimestamp] = useState('');

  // Update timestamps in monospace
  useEffect(() => {
    const pad = (num: number) => String(num).padStart(2, '0');
    const date = new Date();
    // Simulate real CCTV clock overlays
    const timeStr = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    setTimestamp(timeStr);

    const interval = setInterval(() => {
      const d = new Date();
      setTimestamp(`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
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

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    const vol = parseFloat(e.target.value);
    videoRef.current.volume = vol;
    setVolume(vol);
    setIsMuted(vol === 0);
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

  const handleFullscreen = () => {
    if (!videoRef.current) return;
    if (videoRef.current.requestFullscreen) {
      videoRef.current.requestFullscreen();
    }
  };

  const handleRestart = () => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = 0;
    setCurrentTime(0);
    if (!isPlaying) {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const formatVideoTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="relative bg-black rounded border border-detective-border overflow-hidden cctv-overlay group">
      
      {/* CCTV HUD overlays */}
      <div className="absolute top-4 left-4 z-20 pointer-events-none font-mono text-[10px] text-green-500 tracking-wider space-y-1">
        <div className="flex items-center gap-1.5 font-bold">
          <span className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></span>
          REC [CAM-01]
        </div>
        <div>EVIDENCE ID: {evidenceId}</div>
        <div>FEED: SECURE ARCHIVES</div>
      </div>

      <div className="absolute top-4 right-4 z-20 pointer-events-none font-mono text-[10px] text-green-500 text-right">
        <div>2026-08-11</div>
        <div>{timestamp}</div>
      </div>

      {/* Raw HTML5 Video Element */}
      <video
        ref={videoRef}
        src={videoUrl}
        className="w-full aspect-video object-cover"
        muted={isMuted}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        playsInline
        controlsList="nodownload" // Disable standard download button
      />

      {/* Custom Control Bar Overlay */}
      <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20 font-mono text-xs">
        
        {/* Seekbar slider */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] text-detective-muted">{formatVideoTime(currentTime)}</span>
          <input
            type="range"
            min="0"
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="flex-grow h-1 bg-detective-border rounded-lg appearance-none cursor-pointer accent-detective-crimson"
          />
          <span className="text-[10px] text-detective-muted">{formatVideoTime(duration)}</span>
        </div>

        {/* Buttons and volume */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handlePlayPause}
              className="text-white hover:text-detective-crimson transition-colors"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>

            <button
              onClick={handleRestart}
              className="text-white hover:text-detective-crimson transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1.5">
              <button
                onClick={toggleMute}
                className="text-white hover:text-detective-crimson transition-colors"
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 h-1 bg-detective-border rounded-lg appearance-none cursor-pointer accent-detective-crimson"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded text-white tracking-widest uppercase">
              {title}
            </span>
            <button
              onClick={handleFullscreen}
              className="text-white hover:text-detective-crimson transition-colors"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
