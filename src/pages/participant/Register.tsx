import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { Users, FileKey, ShieldAlert, Loader } from 'lucide-react';

export default function Register() {
  const navigate = useNavigate();
  const { registerTeam, participantError } = useAuth();

  const [events, setEvents] = useState<any[]>([]);
  const [selectedEvent, setSelectedEvent] = useState('');
  const [teamName, setTeamName] = useState('');
  const [member1, setMember1] = useState('');
  const [member2, setMember2] = useState('');
  const [member3, setMember3] = useState('');
  const [accessCode, setAccessCode] = useState('');

  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Fetch open events on mount
  useEffect(() => {
    async function loadEvents() {
      setIsLoadingEvents(true);
      try {
        const { data, error } = await supabase
          .from('events')
          .select('id, name, status')
          .eq('status', 'open');

        if (!error && data && data.length > 0) {
          setEvents(data);
          setSelectedEvent(data[0].name);
        } else {
          // Mock default fallback if supabase hasn't run DDL yet
          setEvents([{ id: 'evt-2026-demo-uuid', name: 'Mystery Y Symposium 2026', status: 'open' }]);
          setSelectedEvent('Mystery Y Symposium 2026');
        }
      } catch (err) {
        console.error('Failed to load events', err);
      } finally {
        setIsLoadingEvents(false);
      }
    }
    loadEvents();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Frontend checks
    if (!teamName.trim()) {
      setFormError('TEAM NAME IS REQUIRED');
      return;
    }
    if (!member1.trim() || !member2.trim()) {
      setFormError('AT LEAST TWO TEAM MEMBERS ARE REQUIRED');
      return;
    }
    if (!accessCode.trim()) {
      setFormError('CASE ACCESS CODE IS REQUIRED');
      return;
    }

    setIsSubmitting(true);

    const members = [member1, member2];
    if (member3.trim()) {
      members.push(member3);
    }

    const success = await registerTeam(
      selectedEvent,
      teamName,
      members,
      accessCode.toUpperCase().trim()
    );

    setIsSubmitting(false);

    if (success) {
      navigate('/verify-case');
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-start bg-detective-dark py-12 px-4 cctv-overlay overflow-y-auto">
      <div className="max-w-xl w-full bg-detective-paper text-detective-dark rounded p-8 shadow-[0_10px_30px_rgba(0,0,0,0.5)] border-l-[16px] border-detective-amber my-auto">
        
        {/* Header dossier card */}
        <div className="flex justify-between items-start border-b border-dashed border-detective-dark/20 pb-4 mb-6">
          <div>
            <h2 className="font-mono text-xs uppercase tracking-widest text-stone-500">Investigation Command</h2>
            <h1 className="text-2xl font-mono font-bold uppercase tracking-tight text-detective-dark">
              Team Enlistment Form
            </h1>
          </div>
          <div className="text-right">
            <span className="text-detective-amber font-mono font-bold border-2 border-detective-amber text-[10px] uppercase tracking-widest px-2 py-0.5 inline-block">
              RECRUITMENT
            </span>
          </div>
        </div>

        {/* Display backend/custom errors */}
        {(formError || participantError) && (
          <div className="flex items-center gap-2 border border-detective-crimson/30 bg-detective-crimson/5 text-detective-crimson p-3 rounded mb-5 font-mono text-xs uppercase">
            <ShieldAlert className="w-4 h-4 flex-shrink-0" />
            <span>{formError || participantError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5 font-mono text-sm">

          {/* Team Name */}
          <div>
            <label className="block text-xs uppercase text-stone-600 mb-1 font-bold">Team Name</label>
            <input
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="e.g. SHADOW HUNTERS"
              maxLength={32}
              className="w-full bg-black/5 border-b border-detective-dark/40 p-2 focus:outline-none focus:border-detective-crimson uppercase placeholder:text-gray-400"
            />
          </div>

          {/* Members */}
          <div className="space-y-3 bg-black/5 p-4 rounded border border-black/5">
            <div className="flex items-center gap-2 text-xs uppercase text-stone-600 font-bold border-b border-black/10 pb-1 mb-2">
              <Users className="w-3.5 h-3.5" /> Team Members (2 Min / 3 Max)
            </div>
            
            <div>
              <label className="block text-[10px] uppercase text-stone-500 mb-0.5">Member 01 (Lead Investigator)</label>
              <input
                type="text"
                value={member1}
                onChange={(e) => setMember1(e.target.value)}
                placeholder="Full Name"
                className="w-full bg-transparent border-b border-detective-dark/20 py-1 focus:outline-none focus:border-detective-crimson uppercase placeholder:text-gray-400"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase text-stone-500 mb-0.5">Member 02</label>
              <input
                type="text"
                value={member2}
                onChange={(e) => setMember2(e.target.value)}
                placeholder="Full Name"
                className="w-full bg-transparent border-b border-detective-dark/20 py-1 focus:outline-none focus:border-detective-crimson uppercase placeholder:text-gray-400"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase text-stone-500 mb-0.5">Member 03 (Optional)</label>
              <input
                type="text"
                value={member3}
                onChange={(e) => setMember3(e.target.value)}
                placeholder="Full Name"
                className="w-full bg-transparent border-b border-detective-dark/20 py-1 focus:outline-none focus:border-detective-crimson uppercase placeholder:text-gray-400"
              />
            </div>
          </div>

          {/* Access Code */}
          <div>
            <label className="block text-xs uppercase text-stone-600 mb-1 font-bold flex items-center gap-1">
              <FileKey className="w-3.5 h-3.5" /> Case Access Code (e.g. MY-DEMO-CODE1)
            </label>
            <input
              type="text"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              placeholder="ENTER VERIFICATION KEY"
              className="w-full bg-black/5 border border-detective-dark/20 rounded p-2 focus:outline-none focus:border-detective-crimson uppercase tracking-widest text-center text-md font-bold"
            />
          </div>

          {/* Register Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 bg-detective-dark hover:bg-detective-crimson text-white py-3 rounded transition-colors duration-200 uppercase tracking-widest font-bold disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" /> Verifying File Key...
                </>
              ) : (
                'Submit Dossier'
              )}
            </button>
          </div>
        </form>

        {/* Back navigation shortcut */}
        <div className="text-center mt-6">
          <button
            onClick={() => navigate('/')}
            className="text-xs text-stone-500 hover:text-stone-800 underline decoration-dotted"
          >
            Return to Entrance
          </button>
        </div>
      </div>
    </div>
  );
}
