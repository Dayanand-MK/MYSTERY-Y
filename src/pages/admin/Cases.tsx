import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Plus, Briefcase, FileText, Film, Settings, Loader, Eye, RefreshCw, Key, ShieldAlert, Copy, Check, X, ChevronDown, ChevronUp } from 'lucide-react';

export default function Cases() {
  const navigate = useNavigate();

  const [cases, setCases] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [codes, setCodes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Creator form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [eventId, setEventId] = useState('');
  const [caseNumber, setCaseNumber] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [videoPath, setVideoPath] = useState('');
  const [durationLimit, setDurationLimit] = useState(60);
  const [totalMarks, setTotalMarks] = useState(100);
  const [status, setStatus] = useState<'draft' | 'active' | 'inactive'>('draft');
  // Case Briefing fields
  const [briefingMediaType, setBriefingMediaType] = useState<'none' | 'video' | 'audio'>('none');
  const [briefingMediaUrl, setBriefingMediaUrl] = useState('');
  const [briefingTitle, setBriefingTitle] = useState('Case Briefing');
  const [briefingText, setBriefingText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Access code generator state
  const [showCodeGenerator, setShowCodeGenerator] = useState(false);
  const [selectedCaseForCodes, setSelectedCaseForCodes] = useState<any>(null);
  const [generateCount, setGenerateCount] = useState(5);
  const [isGeneratingCodes, setIsGeneratingCodes] = useState(false);

  // Copy state feedback & card expansion state
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const [copiedAllCaseId, setCopiedAllCaseId] = useState<string | null>(null);
  const [expandedCardCaseId, setExpandedCardCaseId] = useState<string | null>(null);

  const handleCopyCode = (codeText: string, codeId: string) => {
    navigator.clipboard.writeText(codeText);
    setCopiedCodeId(codeId);
    setTimeout(() => {
      setCopiedCodeId(null);
    }, 2000);
  };

  const handleCopyAllCodes = (caseId: string, availableCodesList: any[]) => {
    const codeString = availableCodesList.map((c) => c.code).join('\n');
    if (!codeString) return;
    navigator.clipboard.writeText(codeString);
    setCopiedAllCaseId(caseId);
    setTimeout(() => {
      setCopiedAllCaseId(null);
    }, 2000);
  };

  // Case Preview modal state
  const [previewCase, setPreviewCase] = useState<any>(null);
  const [previewQuestions, setPreviewQuestions] = useState<any[]>([]);
  const [previewOptions, setPreviewOptions] = useState<any[]>([]);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const { data: cData } = await supabase.from('cases').select('*');
      const { data: eData } = await supabase.from('events').select('id, name');
      const { data: cdData } = await supabase.from('case_access_codes').select('*');

      if (cData) setCases(cData);
      if (eData) {
        setEvents(eData);
        if (eData.length > 0) setEventId(eData[0].id);
      }
      if (cdData) setCodes(cdData);
    } catch (err) {
      console.error('Failed to load cases details', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseNumber.trim() || !title.trim()) return;

    setIsSubmitting(true);
    setErrorMsg(null);

    const payload = {
      event_id: eventId,
      case_number: caseNumber.trim().toUpperCase(),
      title: title.trim(),
      description: description.trim(),
      video_path: videoPath.trim() || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      briefing_media_type: briefingMediaType,
      briefing_media_url: briefingMediaUrl.trim() || null,
      briefing_title: briefingTitle.trim() || 'Case Briefing',
      briefing_text: briefingText.trim() || null,
      duration_limit: Number(durationLimit),
      total_marks: Number(totalMarks),
      status
    };

    try {
      const { error } = await supabase.from('cases').insert(payload);
      if (error) {
        setErrorMsg(error.message);
      } else {
        setShowCreateForm(false);
        // Clear all form fields
        setCaseNumber('');
        setTitle('');
        setDescription('');
        setVideoPath('');
        setBriefingMediaType('none');
        setBriefingMediaUrl('');
        setBriefingTitle('Case Briefing');
        setBriefingText('');
        loadData();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Case creation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle case status directly
  const handleToggleStatus = async (caseId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
      await supabase.from('cases').update({ status: nextStatus }).eq('id', caseId);
      loadData();
    } catch (err) {
      console.error('Status toggling failed', err);
    }
  };

  // Generate Access Codes in batch
  const handleGenerateCodes = async () => {
    if (!selectedCaseForCodes) return;
    setIsGeneratingCodes(true);

    const generatedArray = [];
    const prefix = selectedCaseForCodes.case_number;

    for (let i = 0; i < generateCount; i++) {
      // Create random key suffix
      const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
      const code = `${prefix}-${suffix}`;
      generatedArray.push({
        case_id: selectedCaseForCodes.id,
        code,
        status: 'available'
      });
    }

    try {
      await supabase.from('case_access_codes').insert(generatedArray);
      await loadData();
    } catch (err) {
      console.error('Failed to generate codes', err);
    } finally {
      setIsGeneratingCodes(false);
    }
  };

  // Preview case details
  const handleOpenPreview = async (c: any) => {
    setIsPreviewLoading(true);
    setPreviewCase(c);
    try {
      const { data: qData } = await supabase
        .from('questions')
        .select('*')
        .eq('case_id', c.id)
        .order('sort_order', { ascending: true });

      if (qData) setPreviewQuestions(qData);

      const { data: oData } = await supabase.from('question_options').select('id, question_id, option_text');
      if (oData) setPreviewOptions(oData);
    } catch (err) {
      console.error('Failed to load preview details', err);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const getCaseCodesCount = (caseId: string) => {
    const caseCodes = codes.filter((c) => c.case_id === caseId);
    return {
      total: caseCodes.length,
      available: caseCodes.filter((c) => c.status === 'available').length,
      used: caseCodes.filter((c) => c.status === 'used').length
    };
  };

  return (
    <div className="space-y-6 font-mono text-sm">
      
      {/* Header */}
      <div className="flex justify-between items-center border-b border-detective-border pb-4">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wider text-white">Investigation Cases Dossiers</h1>
          <p className="text-xs text-detective-muted uppercase tracking-widest mt-1">
            Configure Classified Incidents Settings
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="flex items-center gap-1.5 bg-detective-crimson hover:bg-detective-alert text-white px-4 py-2 rounded text-xs font-bold tracking-wider uppercase transition-colors"
        >
          <Plus className="w-4 h-4" /> Create Case
        </button>
      </div>

      {/* Case creator form overlay drawer */}
      {showCreateForm && (
        <form onSubmit={handleCreateCase} className="bg-detective-panel border border-detective-border rounded p-6 space-y-4">
          <h3 className="text-xs font-bold uppercase border-b border-detective-border pb-2 text-white flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-detective-crimson" /> New Case Dossier Form
          </h3>

          {errorMsg && (
            <div className="border border-detective-crimson/30 bg-detective-crimson/5 text-detective-alert p-2.5 rounded text-xs uppercase flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] uppercase text-detective-muted mb-1 font-bold">Event</label>
              <select
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
                className="w-full bg-black/40 border border-detective-border rounded p-2 text-white focus:outline-none text-xs"
              >
                {events.map((evt) => (
                  <option key={evt.id} value={evt.id}>{evt.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase text-detective-muted mb-1 font-bold">Case Number (Unique)</label>
              <input
                type="text"
                value={caseNumber}
                onChange={(e) => setCaseNumber(e.target.value)}
                placeholder="e.g. MY-TM-01"
                required
                className="w-full bg-black/40 border border-detective-border rounded p-2 text-white focus:outline-none focus:border-detective-crimson text-xs uppercase"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase text-detective-muted mb-1 font-bold">Case Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Incident Title"
                required
                className="w-full bg-black/40 border border-detective-border rounded p-2 text-white focus:outline-none focus:border-detective-crimson text-xs"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase text-detective-muted mb-1 font-bold">Evidence Video Stream Path / URL</label>
              <input
                type="text"
                value={videoPath}
                onChange={(e) => setVideoPath(e.target.value)}
                placeholder="Supabase Storage path or video URL"
                className="w-full bg-black/40 border border-detective-border rounded p-2 text-white focus:outline-none focus:border-detective-crimson text-xs"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase text-detective-muted mb-1 font-bold">Time Limit (Minutes)</label>
              <input
                type="number"
                value={durationLimit}
                onChange={(e) => setDurationLimit(Number(e.target.value))}
                min={1}
                required
                className="w-full bg-black/40 border border-detective-border rounded p-2 text-white focus:outline-none focus:border-detective-crimson text-xs"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase text-detective-muted mb-1 font-bold">Total Marks</label>
              <input
                type="number"
                value={totalMarks}
                onChange={(e) => setTotalMarks(Number(e.target.value))}
                min={1}
                required
                className="w-full bg-black/40 border border-detective-border rounded p-2 text-white focus:outline-none focus:border-detective-crimson text-xs"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase text-detective-muted mb-1 font-bold">Initial Status</label>
              <select
                value={status}
                onChange={(e: any) => setStatus(e.target.value)}
                className="w-full bg-black/40 border border-detective-border rounded p-2 text-white focus:outline-none text-xs"
              >
                <option value="draft">DRAFT</option>
                <option value="active">ACTIVE</option>
                <option value="inactive">INACTIVE</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase text-detective-muted mb-1 font-bold">Forensic Description Brief</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="State vault breach alibi, details..."
              rows={4}
              className="w-full bg-black/40 border border-detective-border rounded p-2 text-white focus:outline-none focus:border-detective-crimson text-xs"
            />
          </div>

          {/* Case Briefing Configuration */}
          <div className="border border-detective-amber/20 rounded p-4 bg-detective-amber/5 space-y-4">
            <h4 className="text-[10px] font-bold uppercase text-detective-amber tracking-widest border-b border-detective-amber/15 pb-1.5 flex items-center gap-1.5">
              <Film className="w-3.5 h-3.5" /> Case Briefing Configuration
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] uppercase text-detective-muted mb-1 font-bold">Briefing Media Type</label>
                <select
                  value={briefingMediaType}
                  onChange={(e: any) => setBriefingMediaType(e.target.value)}
                  className="w-full bg-black/40 border border-detective-border rounded p-2 text-white focus:outline-none text-xs"
                >
                  <option value="none">TEXT ONLY (No Media)</option>
                  <option value="video">VIDEO BRIEFING</option>
                  <option value="audio">AUDIO BRIEFING</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase text-detective-muted mb-1 font-bold">Briefing Title</label>
                <input
                  type="text"
                  value={briefingTitle}
                  onChange={(e) => setBriefingTitle(e.target.value)}
                  placeholder="e.g. Case Briefing"
                  className="w-full bg-black/40 border border-detective-border rounded p-2 text-white focus:outline-none focus:border-detective-amber text-xs"
                />
              </div>
            </div>

            {briefingMediaType !== 'none' && (
              <div>
                <label className="block text-[10px] uppercase text-detective-muted mb-1 font-bold">
                  {briefingMediaType === 'video' ? 'Video URL / Path' : 'Audio URL / Path'}
                </label>
                <input
                  type="text"
                  value={briefingMediaUrl}
                  onChange={(e) => setBriefingMediaUrl(e.target.value)}
                  placeholder={briefingMediaType === 'video' ? 'https://... or storage/path/video.mp4' : 'https://... or storage/path/audio.mp3'}
                  className="w-full bg-black/40 border border-detective-border rounded p-2 text-white focus:outline-none focus:border-detective-amber text-xs"
                />
                <span className="text-[9px] text-detective-muted mt-1 block">
                  Supabase Storage path OR direct public URL
                </span>
              </div>
            )}

            <div>
              <label className="block text-[10px] uppercase text-detective-muted mb-1 font-bold">
                Briefing Text <span className="normal-case text-[9px]">(shown as a note under the media player, or as standalone text if no media)</span>
              </label>
              <textarea
                value={briefingText}
                onChange={(e) => setBriefingText(e.target.value)}
                placeholder="Welcome, Investigation Team. You have been assigned this case..."
                rows={5}
                className="w-full bg-black/40 border border-detective-border rounded p-2 text-white focus:outline-none focus:border-detective-amber text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="px-4 py-2 rounded border border-detective-border text-detective-muted hover:text-white text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded bg-detective-crimson text-white hover:bg-detective-alert font-bold disabled:opacity-50 text-xs"
            >
              {isSubmitting ? 'Saving Dossier...' : 'Create Case'}
            </button>
          </div>
        </form>
      )}

      {/* Cases list cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-detective-muted">
          <Loader className="w-6 h-6 animate-spin text-detective-crimson mr-2" />
          PARSING INVESTIGATION DOSSIERS...
        </div>
      ) : cases.length === 0 ? (
        <div className="bg-detective-panel border border-detective-border rounded p-12 text-center text-detective-muted">
          NO CLASSIFIED CASES HAVE BEEN CONFIGURED YET.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {cases.map((c) => {
            const codeStats = getCaseCodesCount(c.id);
            return (
              <div key={c.id} className="bg-detective-panel border border-detective-border rounded p-5 flex flex-col justify-between shadow-md relative">
                
                {/* Header title */}
                <div className="border-b border-detective-border/60 pb-3 mb-4 flex justify-between items-start">
                  <div>
                    <span className="text-[10px] text-detective-crimson font-mono font-bold tracking-wider uppercase block">{c.case_number}</span>
                    <h2 className="text-sm font-bold text-white uppercase mt-0.5">{c.title}</h2>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[8px] font-bold border ${
                    c.status === 'active' ? 'border-detective-green text-detective-green bg-detective-green/5' :
                    c.status === 'draft' ? 'border-detective-border text-detective-muted bg-white/5' :
                    'border-detective-crimson text-detective-alert bg-detective-crimson/5'
                  }`}>
                    {c.status}
                  </span>
                </div>

                {/* Description brief snippet */}
                <p className="text-[11px] text-detective-text/80 leading-relaxed truncate mb-4">
                  {c.description}
                </p>

                {/* Code Statistics & Card Keys Panel */}
                <div className="bg-black/35 rounded border border-detective-border/50 p-3 mb-4 space-y-2">
                  <div className="flex justify-between items-center text-[10px]">
                    <div className="flex items-center gap-1.5 text-detective-muted">
                      <Key className="w-3.5 h-3.5 text-detective-amber" />
                      ACCESS KEY CODES:
                    </div>
                    <div className="font-mono space-x-2 flex items-center">
                      <span className="text-white">Total: {codeStats.total}</span>
                      <span className="text-detective-green font-bold">Unused: {codeStats.available}</span>
                      <span className="text-detective-crimson">Used: {codeStats.used}</span>
                      <button
                        onClick={() => setExpandedCardCaseId(expandedCardCaseId === c.id ? null : c.id)}
                        className="ml-2 text-detective-amber hover:text-white flex items-center gap-0.5 underline font-bold transition-colors"
                        title={expandedCardCaseId === c.id ? 'Hide Keys' : 'View Keys'}
                      >
                        {expandedCardCaseId === c.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        {expandedCardCaseId === c.id ? 'Hide' : 'View'}
                      </button>
                    </div>
                  </div>

                  {expandedCardCaseId === c.id && (() => {
                    const availableCaseCodes = codes.filter((cd) => cd.case_id === c.id && cd.status === 'available');
                    const isCopiedAll = copiedAllCaseId === c.id;

                    return (
                      <div className="pt-2.5 border-t border-detective-border/30 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] uppercase font-bold text-detective-muted tracking-wider">
                            Available Access Keys ({availableCaseCodes.length})
                          </span>
                          {availableCaseCodes.length > 0 && (
                            <button
                              onClick={() => handleCopyAllCodes(c.id, availableCaseCodes)}
                              className="flex items-center gap-1 text-[9px] text-detective-amber hover:text-white font-bold uppercase transition-colors"
                            >
                              {isCopiedAll ? (
                                <>
                                  <Check className="w-3 h-3 text-detective-green" />
                                  <span className="text-detective-green">Copied All</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Copy All</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>

                        {availableCaseCodes.length === 0 ? (
                          <div className="text-[10px] text-detective-muted italic py-1">
                            No available codes — generate more below
                          </div>
                        ) : (
                          <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                            {availableCaseCodes.map((cd) => {
                              const isCopied = copiedCodeId === cd.id;
                              return (
                                <div key={cd.id} className="flex items-center justify-between bg-black/60 px-2.5 py-1.5 rounded border border-detective-border/40 text-[10px]">
                                  <span className="font-mono text-white font-bold select-all tracking-wider">{cd.code}</span>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[8px] font-bold text-detective-green border border-detective-green/30 px-1 rounded bg-detective-green/5 uppercase">
                                      {cd.status}
                                    </span>
                                    <button
                                      onClick={() => handleCopyCode(cd.code, cd.id)}
                                      className="text-detective-muted hover:text-white flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/30 border border-detective-border/30 transition-colors"
                                      title="Copy Code"
                                    >
                                      {isCopied ? (
                                        <>
                                          <Check className="w-3 h-3 text-detective-green" />
                                          <span className="text-detective-green font-bold text-[9px]">Copied</span>
                                        </>
                                      ) : (
                                        <>
                                          <Copy className="w-3 h-3" />
                                          <span className="text-[9px]">Copy</span>
                                        </>
                                      )}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Action CTA links */}
                <div className="flex items-center justify-between pt-2 border-t border-detective-border/40 text-[10px]">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleOpenPreview(c)}
                      className="flex items-center gap-1 bg-black/30 hover:bg-black/60 border border-detective-border text-detective-muted hover:text-white px-2 py-1 rounded transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" /> Preview
                    </button>
                    
                    <button
                      onClick={() => {
                        setSelectedCaseForCodes(c);
                        setShowCodeGenerator(true);
                      }}
                      className="flex items-center gap-1 bg-black/30 hover:bg-black/60 border border-detective-border text-detective-muted hover:text-white px-2 py-1 rounded transition-colors"
                    >
                      <Key className="w-3.5 h-3.5 text-detective-amber" /> Key Codes
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleToggleStatus(c.id, c.status)}
                      className={`px-2.5 py-1 rounded font-bold uppercase transition-all ${
                        c.status === 'active'
                          ? 'bg-black/30 border border-detective-border text-detective-alert hover:bg-detective-crimson hover:text-white'
                          : 'bg-detective-green/10 border border-detective-green/35 text-detective-green hover:bg-detective-green hover:text-white'
                      }`}
                    >
                      {c.status === 'active' ? 'Deactivate' : 'Activate'}
                    </button>

                    <button
                      onClick={() => navigate(`/admin/questions?caseId=${c.id}`)}
                      className="bg-detective-crimson hover:bg-detective-alert text-white px-3 py-1 rounded font-bold transition-all uppercase"
                    >
                      Questions
                    </button>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* Code generator & Access Keys modal */}
      {showCodeGenerator && selectedCaseForCodes && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-detective-panel border border-detective-border rounded-lg p-6 max-w-md w-full font-mono text-xs shadow-2xl space-y-5">
            
            {/* Header */}
            <div className="flex justify-between items-center border-b border-detective-border pb-3">
              <div>
                <h3 className="text-sm font-bold uppercase text-white flex items-center gap-2">
                  <Key className="w-4 h-4 text-detective-amber" /> Access Keys Dossier
                </h3>
                <p className="text-[10px] text-detective-muted uppercase tracking-wider mt-0.5">
                  {selectedCaseForCodes.case_number} — {selectedCaseForCodes.title}
                </p>
              </div>
              <button
                onClick={() => setShowCodeGenerator(false)}
                className="text-detective-muted hover:text-white p-1 rounded transition-colors"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Access Codes List Section */}
            {(() => {
              const availableCodes = codes.filter(
                (c) => c.case_id === selectedCaseForCodes.id && c.status === 'available'
              );
              const isCopiedAll = copiedAllCaseId === selectedCaseForCodes.id;

              return (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] uppercase font-bold text-detective-muted tracking-wider">
                      Available Access Keys ({availableCodes.length})
                    </span>
                    {availableCodes.length > 0 && (
                      <button
                        onClick={() => handleCopyAllCodes(selectedCaseForCodes.id, availableCodes)}
                        className="flex items-center gap-1 bg-black/40 hover:bg-black/80 border border-detective-border text-detective-amber hover:text-white px-2.5 py-1 rounded text-[10px] transition-colors font-bold uppercase"
                      >
                        {isCopiedAll ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-detective-green" />
                            <span className="text-detective-green">Copied All ({availableCodes.length})</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy All</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {availableCodes.length === 0 ? (
                    <div className="bg-black/30 border border-dashed border-detective-border/50 rounded p-4 text-center text-detective-muted text-[11px]">
                      No available codes — generate more below
                    </div>
                  ) : (
                    <div className="max-h-56 overflow-y-auto space-y-2 pr-1 border border-detective-border/40 rounded p-2 bg-black/40">
                      {availableCodes.map((c) => {
                        const isCopied = copiedCodeId === c.id;
                        return (
                          <div
                            key={c.id}
                            className="bg-black/60 border border-detective-border/40 rounded px-3 py-2 flex items-center justify-between gap-2 hover:border-detective-amber/40 transition-colors"
                          >
                            <span className="font-mono text-xs font-bold text-white tracking-widest select-all">
                              {c.code}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded text-[8px] font-bold border border-detective-green/40 text-detective-green bg-detective-green/10 uppercase">
                                {c.status}
                              </span>
                              <button
                                onClick={() => handleCopyCode(c.code, c.id)}
                                className="flex items-center gap-1 bg-black/40 hover:bg-black border border-detective-border text-detective-muted hover:text-white px-2 py-1 rounded text-[10px] transition-colors font-mono"
                                title="Copy Key Code"
                              >
                                {isCopied ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-detective-green" />
                                    <span className="text-detective-green font-bold">Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5" />
                                    <span>Copy</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Generator Section */}
            <div className="border-t border-detective-border/50 pt-4 space-y-3">
              <h4 className="text-[10px] font-bold uppercase text-detective-amber tracking-wider flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Generate More Keys
              </h4>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="block text-[9px] uppercase text-detective-muted mb-1 font-bold">
                    Amount to Generate
                  </label>
                  <input
                    type="number"
                    value={generateCount}
                    onChange={(e) => setGenerateCount(Math.max(1, Number(e.target.value)))}
                    min={1}
                    max={50}
                    className="w-full bg-black/40 border border-detective-border rounded p-2 text-white focus:outline-none focus:border-detective-amber text-xs font-mono"
                  />
                </div>
                <div className="self-end">
                  <button
                    onClick={handleGenerateCodes}
                    disabled={isGeneratingCodes}
                    className="px-4 py-2 rounded bg-detective-crimson hover:bg-detective-alert text-white font-bold disabled:opacity-50 text-xs tracking-wider uppercase transition-colors"
                  >
                    {isGeneratingCodes ? 'Generating...' : 'Generate Keys'}
                  </button>
                </div>
              </div>
            </div>

            {/* Footer buttons */}
            <div className="flex justify-end border-t border-detective-border/40 pt-3">
              <button
                onClick={() => setShowCodeGenerator(false)}
                className="px-4 py-1.5 rounded border border-detective-border text-detective-muted hover:text-white transition-colors"
              >
                Done / Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Case preview modal */}
      {previewCase && (
        <div className="fixed inset-0 bg-black/90 z-50 overflow-y-auto p-6 md:p-12 flex justify-center">
          <div className="max-w-2xl w-full bg-detective-paper text-detective-dark rounded p-8 shadow-2xl relative border-t-8 border-detective-crimson my-auto">
            
            {/* Close */}
            <button
              onClick={() => setPreviewCase(null)}
              className="absolute top-4 right-4 font-mono text-[10px] text-stone-600 hover:text-stone-900 font-bold uppercase border border-black/10 rounded px-2.5 py-1"
            >
              Close Preview
            </button>

            <span className="dossier-stamp text-detective-crimson rotate-6 absolute bottom-12 right-12 text-sm font-bold uppercase select-none">
              PREVIEW DOSSIER
            </span>

            {/* Case details */}
            <div className="border-b border-black/15 pb-4 mb-6">
              <span className="text-xs text-detective-crimson font-bold uppercase">{previewCase.case_number}</span>
              <h1 className="text-2xl font-bold uppercase text-stone-900">{previewCase.title}</h1>
              <p className="text-xs text-stone-600 font-bold uppercase mt-1">Duration: {previewCase.duration_limit}m | Total: {previewCase.total_marks}M</p>
            </div>

            <p className="text-xs leading-relaxed text-stone-800 mb-6 bg-black/5 p-4 rounded italic">
              {previewCase.description}
            </p>

            {/* Questions list */}
            <div className="space-y-6">
              <h3 className="font-bold text-xs uppercase text-stone-700 tracking-wider border-b border-black/10 pb-1">
                Questionnaire Preview ({previewQuestions.length} Items)
              </h3>

              {isPreviewLoading ? (
                <div className="text-center py-6 text-xs text-stone-600">
                  Loading Questions...
                </div>
              ) : previewQuestions.length === 0 ? (
                <div className="text-center py-6 text-xs text-stone-600 uppercase font-bold">
                  No questions built for this case folder.
                </div>
              ) : (
                previewQuestions.map((q, idx) => (
                  <div key={q.id} className="space-y-2 p-4 bg-black/5 rounded border border-black/10">
                    <div className="font-bold text-xs flex justify-between text-stone-900">
                      <span>Q{idx + 1}. {q.question_text}</span>
                      <span className="text-[10px] text-stone-600 font-bold">({q.marks} Marks)</span>
                    </div>
                    <div className="text-[10px] text-stone-600 uppercase font-bold">
                      Type: {q.type.replace('_', ' ')}
                    </div>
                    {/* Render options previews if MCQs */}
                    {['single_choice', 'multiple_choice', 'evidence_selection'].includes(q.type) && (
                      <div className="pl-4 space-y-1 mt-2 text-[11px] text-stone-800 font-bold">
                        {previewOptions
                          .filter((o) => o.question_id === q.id)
                          .map((o) => (
                            <div key={o.id} className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 bg-stone-700 rounded-full"></span>
                              <span>{o.option_text}</span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
