import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import CaseBriefing from '../../components/evidence/CaseBriefing';
import { Loader, AlertTriangle } from 'lucide-react';

export default function VerifyCase() {
  const navigate = useNavigate();
  const { currentTeam, currentSession, beginInvestigation } = useAuth();
  const [caseDetails, setCaseDetails] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // Auto-redirect if active session is already present
  useEffect(() => {
    if (currentSession) {
      navigate('/investigation');
    }
  }, [currentSession, navigate]);

  useEffect(() => {
    if (!currentTeam) {
      navigate('/register');
      return;
    }

    async function loadCase() {
      try {
        const { data, error } = await supabase
          .from('cases')
          .select('case_number, title, description, briefing_media_type, briefing_media_url, briefing_title, briefing_text')
          .eq('id', currentTeam!.case_id)
          .single();

        if (!error && data) {
          setCaseDetails(data);
        } else {
          // Mock fallback
          setCaseDetails({
            case_number: 'MY-DEMO-01',
            title: 'The Missing Evidence',
            description: 'Archive vault breach.',
            briefing_media_type: 'none',
            briefing_title: 'Case Briefing',
            briefing_text: 'You have been assigned this case for independent investigation. Review the physical case file.'
          });
        }
      } catch (err) {
        console.error('Failed to load case details', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadCase();
  }, [currentTeam, navigate]);

  const handleStart = async () => {
    if (isStarting) return; // double-click guard
    setIsStarting(true);
    setStartError(null);
    console.debug('[MYSTERY Y][VERIFY] Begin investigation triggered');
    try {
      const success = await beginInvestigation();
      if (success) {
        console.debug('[MYSTERY Y][VERIFY] Investigation started — navigating to /investigation');
        navigate('/investigation');
      } else {
        setStartError('Failed to initialise investigation. Please check your connection and retry.');
      }
    } catch (err: any) {
      console.error('[MYSTERY Y][VERIFY] Unexpected error starting investigation:', err);
      setStartError(err?.message || 'An unexpected error occurred. Please retry.');
    } finally {
      setIsStarting(false);
    }
  };

  const handleRetry = () => {
    setStartError(null);
    handleStart();
  };

  if (isLoading || !currentTeam || !caseDetails) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-detective-dark font-mono text-sm text-detective-muted">
        <Loader className="w-6 h-6 animate-spin text-detective-amber mb-2" />
        SECURED CONNECTION VERIFYING CASE FILE...
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-detective-dark py-12 px-4 cctv-overlay overflow-y-auto">
      {startError && (
        <div className="max-w-3xl w-full bg-detective-panel border border-detective-crimson/50 text-detective-alert px-4 py-3 rounded mb-4 font-mono text-xs uppercase tracking-wider">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-detective-crimson flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-bold">⚠ INITIALISATION ERROR:</span>{' '}
              <span className="text-detective-muted">{startError}</span>
              <div className="mt-2">
                <button
                  onClick={handleRetry}
                  className="text-detective-amber border border-detective-amber/50 px-3 py-1 rounded text-xs hover:bg-detective-amber/10 transition-colors"
                >
                  [ RETRY ]
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <CaseBriefing
        caseInfo={caseDetails}
        teamName={currentTeam.name}
        isBeforeStart={true}
        onBegin={handleStart}
        isStarting={isStarting}
      />
    </div>
  );
}
