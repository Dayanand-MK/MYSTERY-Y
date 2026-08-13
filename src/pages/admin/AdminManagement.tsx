import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { Shield, Plus, Edit, Trash2, ToggleLeft, ToggleRight, Loader, ShieldAlert, CheckCircle2, User } from 'lucide-react';

export default function AdminManagement() {
  const navigate = useNavigate();
  const { adminUser } = useAuth();

  const [admins, setAdmins] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Add Admin form states
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<'evaluator' | 'coordinator'>('evaluator');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit Role state
  const [editingAdmin, setEditingAdmin] = useState<any | null>(null);
  const [editRole, setEditRole] = useState<'evaluator' | 'coordinator'>('evaluator');

  // Verify Super Admin Access Role Gate
  const isSuperAdmin = adminUser?.email === 'vh13155_ml23@velhightech.com' && adminUser?.role === 'super_admin';

  useEffect(() => {
    if (!isSuperAdmin) {
      // Direct access is rejected
      const timer = setTimeout(() => {
        navigate('/admin');
      }, 3000);
      return () => clearTimeout(timer);
    }

    loadAdmins();
  }, [isSuperAdmin, navigate]);

  const loadAdmins = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) {
        setErrorMsg(error.message);
      } else if (data) {
        setAdmins(data);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to fetch admin accounts.');
    } finally {
      setIsLoading(false);
    }
  };

  const logAdminAction = async (actionType: string, details: any) => {
    if (!adminUser) return;
    try {
      await supabase.from('admin_actions').insert({
        admin_id: adminUser.id,
        action_type: actionType,
        details
      });
    } catch (err) {
      console.error('Failed to log admin action', err);
    }
  };

  const [createdTempPassword, setCreatedTempPassword] = useState<string | null>(null);

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || !newName.trim()) return;

    // Client-side validations
    if (newEmail.trim().toLowerCase() === 'vh13155_ml23@velhightech.com') {
      setErrorMsg('CANNOT DUPLICATE THE PERMANENT SUPER ADMIN EMAIL.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    setCreatedTempPassword(null);

    const emailClean = newEmail.trim().toLowerCase();
    const nameClean = newName.trim();

    try {
      // Call Edge Function 'create-admin'
      const { data, error } = await supabase.functions.invoke('create-admin', {
        body: {
          email: emailClean,
          name: nameClean,
          role: newRole
        }
      });

      if (error || (data && !data.success)) {
        const errText = error?.message || data?.error || 'Admin creation failed.';
        setErrorMsg(errText);
      } else {
        setSuccessMsg(`ADMINISTRATOR ${emailClean.toUpperCase()} CREATED SECURELY VIA EDGE FUNCTION.`);
        if (data?.temporary_password) {
          setCreatedTempPassword(data.temporary_password);
        }
        setNewEmail('');
        setNewName('');
        setShowAddForm(false);
        await loadAdmins();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Admin creation failed via Edge Function.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (admin: any) => {
    if (admin.email === 'vh13155_ml23@velhightech.com') {
      setErrorMsg('THE PERMANENT SUPER ADMIN ACCOUNT CANNOT BE DISABLED.');
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);

    const nextStatus = admin.status === 'active' ? 'disabled' : 'active';
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ status: nextStatus })
        .eq('id', admin.id);

      if (error) {
        setErrorMsg(error.message);
      } else {
        setSuccessMsg(`ADMIN ${admin.email.toUpperCase()} HAS BEEN ${nextStatus.toUpperCase()}.`);
        const actionType = nextStatus === 'disabled' ? 'ADMIN_DISABLED' : 'ADMIN_ENABLED';
        await logAdminAction(actionType, { email: admin.email });
        await loadAdmins();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Status update failed.');
    }
  };

  const handleEditRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAdmin) return;

    if (editingAdmin.email === 'vh13155_ml23@velhightech.com') {
      setErrorMsg('THE PERMANENT SUPER ADMIN ROLE CANNOT BE CHANGED.');
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: editRole })
        .eq('id', editingAdmin.id);

      if (error) {
        setErrorMsg(error.message);
      } else {
        setSuccessMsg(`ROLE FOR ${editingAdmin.email.toUpperCase()} CHANGED TO ${editRole.toUpperCase()}.`);
        await logAdminAction('ADMIN_ROLE_CHANGED', { email: editingAdmin.email, old_role: editingAdmin.role, new_role: editRole });
        setEditingAdmin(null);
        await loadAdmins();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Role change failed.');
    }
  };

  const handleRemoveAdmin = async (admin: any) => {
    if (admin.email === 'vh13155_ml23@velhightech.com') {
      setErrorMsg('THE PERMANENT SUPER ADMIN ACCOUNT CANNOT BE DELETED.');
      return;
    }

    const confirmDelete = window.confirm(`ARE YOU SURE YOU WANT TO REVOKE SYSTEM ACCESS FOR: ${admin.email.toUpperCase()}?`);
    if (!confirmDelete) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', admin.id);

      if (error) {
        setErrorMsg(error.message);
      } else {
        setSuccessMsg(`SYSTEM ACCESS REVOKED FOR ${admin.email.toUpperCase()}.`);
        await logAdminAction('ADMIN_ACCESS_REMOVED', { email: admin.email });
        await loadAdmins();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Admin removal failed.');
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center bg-detective-dark/20 text-center font-mono p-6">
        <ShieldAlert className="w-16 h-16 text-detective-crimson mb-4 animate-pulse" />
        <h1 className="text-xl font-bold text-white uppercase tracking-wider mb-2">ACCESS RESTRICTED</h1>
        <p className="text-sm text-detective-muted max-w-md leading-relaxed uppercase">
          CLEARANCE CODE ERROR: Only the permanent Super Admin is authorized to access the Admin Management center.
        </p>
        <span className="text-[10px] text-detective-muted mt-6 animate-pulse-subtle">
          REDIRECTING SECURE LINK BACK TO WORKSTATION COMMAND...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-mono text-sm">
      
      {/* Header */}
      <div className="flex justify-between items-center border-b border-detective-border pb-4">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wider text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-detective-crimson" /> Admin Management Control
          </h1>
          <p className="text-xs text-detective-muted uppercase tracking-widest mt-1">
            Authorize & Manage Systems Administrators
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-1.5 bg-detective-crimson hover:bg-detective-alert text-white px-4 py-2 rounded text-xs font-bold tracking-wider uppercase transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Admin
        </button>
      </div>

      {/* Advisory notifications */}
      {errorMsg && (
        <div className="border border-detective-crimson/30 bg-detective-crimson/5 text-detective-alert p-3 rounded text-xs uppercase flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="border border-detective-green/30 bg-detective-green/5 text-detective-green p-3 rounded text-xs uppercase flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {createdTempPassword && (
        <div className="border border-detective-amber/40 bg-detective-amber/10 text-detective-amber p-4 rounded text-xs space-y-1 font-mono">
          <div className="font-bold uppercase tracking-wider flex items-center gap-2 text-white">
            <Shield className="w-4 h-4 text-detective-amber" /> Temporary Clearance Password Generated:
          </div>
          <div className="text-sm font-bold text-white bg-black/60 p-2 rounded border border-detective-amber/30 select-all inline-block mt-1">
            {createdTempPassword}
          </div>
          <p className="text-[10px] text-stone-400 uppercase mt-1">
            Share this key securely with the administrator. It will not be shown again.
          </p>
        </div>
      )}

      {/* Admins Data Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-detective-muted">
          <Loader className="w-6 h-6 animate-spin text-detective-crimson mr-2" />
          QUERYING CLEARANCE PROFILES...
        </div>
      ) : (
        <div className="overflow-x-auto border border-detective-border rounded bg-detective-panel shadow-md">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-black/40 border-b border-detective-border text-detective-muted font-bold">
                <th className="p-4">NAME</th>
                <th className="p-4">EMAIL</th>
                <th className="p-4">ROLE</th>
                <th className="p-4">STATUS</th>
                <th className="p-4">CREATED AT</th>
                <th className="p-4">LAST LOGIN</th>
                <th className="p-4 text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-detective-border/40 font-mono text-[11px]">
              {admins.map((adm) => {
                const isSelf = adm.id === adminUser.id;
                const isPermanentSA = adm.email === 'vh13155_ml23@velhightech.com';

                return (
                  <tr key={adm.id} className="hover:bg-black/10 transition-colors">
                    <td className="p-4 text-white uppercase font-bold flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-detective-muted" />
                      {adm.name || 'UNKNOWN'}
                    </td>
                    <td className="p-4 text-stone-300 font-bold">{adm.email}</td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded text-[8px] font-bold border uppercase ${
                        adm.role === 'super_admin' ? 'border-detective-crimson text-detective-alert bg-detective-crimson/5' :
                        adm.role === 'evaluator' ? 'border-detective-amber text-detective-amber bg-detective-amber/5' :
                        'border-detective-border text-detective-muted bg-white/5'
                      }`}>
                        {adm.role.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`font-bold uppercase tracking-wider ${
                        adm.status === 'active' ? 'text-detective-green' : 'text-detective-alert'
                      }`}>
                        {adm.status || 'active'}
                      </span>
                    </td>
                    <td className="p-4 text-detective-muted">
                      {new Date(adm.created_at).toLocaleString()}
                    </td>
                    <td className="p-4 text-detective-muted">
                      {adm.last_login ? new Date(adm.last_login).toLocaleString() : 'NEVER'}
                    </td>
                    <td className="p-4 text-right space-x-2">
                      {isPermanentSA ? (
                        <span className="text-[10px] text-detective-muted italic">SYSTEM OPERATOR</span>
                      ) : (
                        <>
                          {/* Edit Role */}
                          <button
                            onClick={() => {
                              setEditingAdmin(adm);
                              setEditRole(adm.role === 'super_admin' ? 'evaluator' : adm.role);
                            }}
                            className="bg-black/35 hover:bg-black/60 border border-detective-border hover:border-white/30 text-stone-400 hover:text-white px-2 py-1 rounded transition-colors inline-flex items-center gap-1"
                            title="Edit Role"
                          >
                            <Edit className="w-3 h-3" /> Edit
                          </button>

                          {/* Toggle Status */}
                          <button
                            onClick={() => handleToggleStatus(adm)}
                            className={`border px-2 py-1 rounded transition-colors inline-flex items-center gap-1 ${
                              adm.status === 'active'
                                ? 'bg-black/30 border-detective-border text-detective-alert hover:bg-detective-crimson hover:text-white'
                                : 'bg-detective-green/10 border-detective-green/40 text-detective-green hover:bg-detective-green hover:text-white'
                            }`}
                            title={adm.status === 'active' ? 'Disable Account' : 'Enable Account'}
                          >
                            {adm.status === 'active' ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                            {adm.status === 'active' ? 'Disable' : 'Enable'}
                          </button>

                          {/* Remove Admin */}
                          <button
                            onClick={() => handleRemoveAdmin(adm)}
                            className="bg-black/40 hover:bg-detective-crimson border border-detective-crimson/50 hover:border-detective-crimson text-detective-alert hover:text-white px-2 py-1 rounded transition-colors inline-flex items-center gap-1"
                            title="Revoke Access"
                          >
                            <Trash2 className="w-3 h-3" /> Remove
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Admin Modal Popup */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleAddAdmin} className="bg-detective-panel border border-detective-border rounded p-6 max-w-sm w-full font-mono text-xs space-y-4 shadow-2xl relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-detective-crimson"></div>
            <h3 className="text-sm font-bold uppercase text-white border-b border-detective-border pb-2 mb-4 flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-detective-crimson" /> Add New Systems Administrator
            </h3>

            <div>
              <label className="block text-[10px] uppercase text-detective-muted mb-1 font-bold">Email (Clearance ID)</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="operator@college.edu"
                required
                className="w-full bg-black/40 border border-detective-border rounded p-2 text-white focus:outline-none focus:border-detective-crimson text-xs"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase text-detective-muted mb-1 font-bold">Operator Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Full Name"
                required
                className="w-full bg-black/40 border border-detective-border rounded p-2 text-white focus:outline-none focus:border-detective-crimson text-xs"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase text-detective-muted mb-1 font-bold">Security Role Access</label>
              <select
                value={newRole}
                onChange={(e: any) => setNewRole(e.target.value)}
                className="w-full bg-black/40 border border-detective-border rounded p-2 text-white focus:outline-none text-xs"
              >
                <option value="evaluator">EVALUATOR (Grading & Scores review)</option>
                <option value="coordinator">COORDINATOR (Security Center & Team tracking)</option>
              </select>
            </div>

            <div className="flex justify-end gap-3 border-t border-detective-border/40 pt-4">
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setNewEmail('');
                  setNewName('');
                }}
                className="px-3 py-1.5 rounded border border-detective-border text-detective-muted hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-1.5 rounded bg-detective-crimson hover:bg-detective-alert text-white font-bold disabled:opacity-50"
              >
                {isSubmitting ? 'Registering...' : 'Add Admin'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Role Modal Popup */}
      {editingAdmin && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleEditRole} className="bg-detective-panel border border-detective-border rounded p-6 max-w-sm w-full font-mono text-xs space-y-4 shadow-2xl relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-detective-crimson"></div>
            <h3 className="text-sm font-bold uppercase text-white border-b border-detective-border pb-2 mb-4 flex items-center gap-1.5">
              <Edit className="w-4 h-4 text-detective-amber" /> Modify Administrator Role
            </h3>

            <div>
              <span className="text-[10px] text-detective-muted uppercase block">Admin Account</span>
              <span className="font-bold text-white uppercase text-xs block truncate mt-0.5">{editingAdmin.email}</span>
            </div>

            <div>
              <label className="block text-[10px] uppercase text-detective-muted mb-1 font-bold">New Security Role Access</label>
              <select
                value={editRole}
                onChange={(e: any) => setEditRole(e.target.value)}
                className="w-full bg-black/40 border border-detective-border rounded p-2 text-white focus:outline-none text-xs"
              >
                <option value="evaluator">EVALUATOR (Grading & Scores review)</option>
                <option value="coordinator">COORDINATOR (Security Center & Team tracking)</option>
              </select>
            </div>

            <div className="flex justify-end gap-3 border-t border-detective-border/40 pt-4">
              <button
                type="button"
                onClick={() => setEditingAdmin(null)}
                className="px-3 py-1.5 rounded border border-detective-border text-detective-muted hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-detective-crimson hover:bg-detective-alert text-white font-bold"
              >
                Save Role
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
