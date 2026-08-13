import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import {
  Terminal,
  Shield,
  Users,
  Briefcase,
  FileSpreadsheet,
  CheckSquare,
  ShieldAlert,
  BarChart3,
  Sliders,
  PlayCircle,
  LogOut,
  Menu,
  X,
  Bell,
  UserCog
} from 'lucide-react';

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { adminUser, adminLogout, isAdminLoading } = useAuth();
  
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [showNotificationCenter, setShowNotificationCenter] = useState(false);

  // Redirect if not logged in
  useEffect(() => {
    if (!isAdminLoading && !adminUser) {
      navigate('/admin/login');
    }
  }, [adminUser, isAdminLoading, navigate]);

  // Real-time security alerts subscription
  useEffect(() => {
    if (!adminUser) return;

    // Subscribe to new security logs
    const channel = supabase
      .channel('admin-security-alerts')
      .on(
        'postgres_changes',
        { event: 'INSERT', table: 'security_logs' },
        (payload: any) => {
          // Fetch team label to make it readable
          supabase
            .from('teams')
            .select('team_id_label, name')
            .eq('id', payload.new.team_id)
            .single()
            .then(({ data }) => {
              const alertMsg = {
                id: payload.new.id,
                event_type: payload.new.event_type,
                severity: payload.new.severity,
                created_at: payload.new.created_at,
                team_label: data?.team_id_label || 'SYSTEM',
                team_name: data?.name || 'SYSTEM'
              };
              setAlerts((prev) => [alertMsg, ...prev.slice(0, 19)]);
            });
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [adminUser]);

  const handleLogout = async () => {
    await adminLogout();
    navigate('/admin/login');
  };

  if (isAdminLoading || !adminUser) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-detective-dark font-mono text-sm text-detective-muted">
        <Terminal className="w-8 h-8 animate-spin text-detective-crimson mb-2" />
        ESTABLISHING SECURE ADMIN LINK...
      </div>
    );
  }

  // Navigation Links definition with role gating
  const navigationItems = [
    { name: 'Command Center', path: '/admin', icon: Terminal, roles: ['super_admin', 'evaluator', 'coordinator'] },
    { name: 'Teams', path: '/admin/teams', icon: Users, roles: ['super_admin', 'evaluator', 'coordinator'] },
    { name: 'Cases', path: '/admin/cases', icon: Briefcase, roles: ['super_admin'] },
    { name: 'Submissions', path: '/admin/submissions', icon: FileSpreadsheet, roles: ['super_admin', 'evaluator', 'coordinator'] },
    { name: 'Scoring', path: '/admin/scoring', icon: CheckSquare, roles: ['super_admin', 'evaluator'] },
    { name: 'Security Center', path: '/admin/security', icon: ShieldAlert, roles: ['super_admin', 'evaluator', 'coordinator'] },
    { name: 'Leaderboard', path: '/admin/leaderboard', icon: BarChart3, roles: ['super_admin', 'evaluator'] },
    { name: 'Event Controls', path: '/admin/settings', icon: Sliders, roles: ['super_admin'] },
    { name: 'Test Panel', path: '/admin/test-mode', icon: PlayCircle, roles: ['super_admin'] },
    { name: 'Admin Management', path: '/admin/admin-management', icon: UserCog, roles: ['super_admin'] }
  ];

  const allowedNavs = navigationItems.filter(item => item.roles.includes(adminUser.role));

  return (
    <div className="h-screen flex bg-detective-dark text-detective-text overflow-hidden font-mono">
      
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 bg-detective-panel border-r border-detective-border flex-shrink-0">
        {/* Header stamped */}
        <div className="h-16 border-b border-detective-border px-6 flex items-center gap-2 bg-black/20">
          <Shield className="w-5 h-5 text-detective-crimson" />
          <span className="font-bold text-white tracking-widest text-sm uppercase">Command Center</span>
        </div>

        {/* Profile Card */}
        <div className="p-4 border-b border-detective-border bg-black/10 text-xs space-y-1">
          <div className="text-detective-muted uppercase text-[10px]">User Role</div>
          <div className="font-bold text-white text-xs truncate">{adminUser.email}</div>
          <div className="text-detective-crimson font-bold uppercase tracking-widest text-[9px] bg-detective-crimson/15 px-2 py-0.5 rounded border border-detective-crimson/30 inline-block mt-1">
            {adminUser.role.replace('_', ' ')}
          </div>
        </div>

        {/* Sidebar Nav */}
        <nav className="flex-grow p-4 space-y-1.5 overflow-y-auto">
          {allowedNavs.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded text-left text-xs uppercase tracking-wider transition-colors border ${
                  isActive
                    ? 'border-detective-crimson bg-detective-crimson/10 font-bold text-white shadow-[0_0_8px_rgba(139,0,0,0.15)]'
                    : 'border-transparent text-detective-muted hover:bg-black/20 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.name}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-detective-border">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-4 py-2.5 rounded text-left text-xs uppercase tracking-wider text-detective-muted hover:bg-detective-crimson/15 hover:text-detective-alert border border-transparent hover:border-detective-crimson/30 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            System Sign Out
          </button>
        </div>
      </aside>

      {/* Main View Area */}
      <div className="flex-grow flex flex-col overflow-hidden relative">
        
        {/* Top Header */}
        <header className="h-16 bg-detective-panel border-b border-detective-border px-6 flex items-center justify-between flex-shrink-0 z-30">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="lg:hidden p-2 text-detective-muted hover:text-white"
            >
              {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <span className="font-bold text-xs uppercase text-detective-muted tracking-widest hidden sm:inline-block">
              SYSTEM REPORT: <span className="text-detective-green">OPERATIONAL</span>
            </span>
          </div>

          {/* Alerts Bell notification */}
          <div className="relative">
            <button
              onClick={() => setShowNotificationCenter(!showNotificationCenter)}
              className={`p-2 rounded border border-detective-border hover:bg-black/20 text-detective-muted hover:text-white transition-all relative ${
                alerts.length > 0 ? 'border-detective-crimson text-detective-alert animate-pulse-subtle' : ''
              }`}
            >
              <Bell className="w-4 h-4" />
              {alerts.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-detective-crimson text-white font-bold text-[9px] px-1 rounded-full">
                  {alerts.length}
                </span>
              )}
            </button>

            {/* Notification dropdown dropdown */}
            {showNotificationCenter && (
              <div className="absolute right-0 mt-3 w-80 bg-detective-panel border border-detective-border rounded shadow-2xl z-50 p-4 font-mono text-xs max-h-96 overflow-y-auto">
                <div className="flex justify-between items-center border-b border-detective-border pb-2 mb-3">
                  <span className="font-bold text-detective-crimson text-xs uppercase">Security Feed Alerts</span>
                  <button
                    onClick={() => setAlerts([])}
                    className="text-[9px] text-detective-muted hover:text-white underline decoration-dotted"
                  >
                    Clear All
                  </button>
                </div>
                {alerts.length === 0 ? (
                  <div className="text-center py-6 text-detective-muted text-[10px]">
                    NO ACTIVE ALERTS RECEIVED
                  </div>
                ) : (
                  <div className="space-y-3">
                    {alerts.map((alert) => (
                      <div
                        key={alert.id}
                        className={`p-2.5 rounded border border-detective-border bg-black/30 flex flex-col gap-1 ${
                          alert.severity === 'high' ? 'border-l-4 border-l-detective-crimson' : 'border-l-4 border-l-detective-amber'
                        }`}
                      >
                        <div className="flex justify-between text-[9px] font-bold">
                          <span className="text-detective-crimson uppercase">{alert.event_type}</span>
                          <span className="text-detective-muted">{new Date(alert.created_at).toLocaleTimeString()}</span>
                        </div>
                        <div className="text-white text-[10px] uppercase font-bold">{alert.team_label} - {alert.team_name}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        {/* Sidebar drawer for Mobile */}
        {isMenuOpen && (
          <div className="absolute inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setIsMenuOpen(false)}>
            <div
              className="w-64 bg-detective-panel h-full border-r border-detective-border flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-16 border-b border-detective-border px-6 flex items-center justify-between">
                <span className="font-bold text-white tracking-widest text-xs uppercase">Command Center</span>
                <button onClick={() => setIsMenuOpen(false)}>
                  <X className="w-5 h-5 text-detective-muted" />
                </button>
              </div>

              <div className="p-4 border-b border-detective-border bg-black/10 text-xs">
                <div className="font-bold text-white truncate">{adminUser.email}</div>
                <div className="text-detective-crimson font-bold uppercase text-[9px] mt-1">{adminUser.role}</div>
              </div>

              <nav className="flex-grow p-4 space-y-1.5 overflow-y-auto">
                {allowedNavs.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.path}
                      onClick={() => {
                        navigate(item.path);
                        setIsMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 rounded text-left text-xs uppercase tracking-wider text-detective-muted hover:bg-black/20 hover:text-white border border-transparent"
                    >
                      <Icon className="w-4 h-4" />
                      {item.name}
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>
        )}

        {/* Outlet routing rendering viewport */}
        <main className="flex-grow overflow-y-auto p-6 bg-[#0f1012]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
