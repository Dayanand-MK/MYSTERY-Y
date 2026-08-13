import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import CaseBriefing from '../../components/evidence/CaseBriefing';
import { Loader } from 'lucide-react';

export default function VerifyCase() {
  const navigate = useNavigate();
  const { currentTeam, currentSession, beginInvestigation, participantError } = useAuth();
  const [caseDetails, setCaseDetails] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);

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
    setIsStarting(true);
    const success = await beginInvestigation();
    setIsStarting(false);
    if (success) {
      navigate('/investigation');
    }
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
      {participantError && (
        <div className="max-w-3xl w-full bg-detective-panel border border-detective-crimson/30 text-detective-alert px-4 py-3 rounded mb-4 font-mono text-xs uppercase tracking-wider flex items-center gap-2">
          <span>⚠ WARNING:</span> {participantError}
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
