'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../lib/supabaseClient';
import { canManageBusiness, getBusinessContext } from '../lib/businessContext';

const roleLabels = {
  owner: 'Owner',
  manager: 'Manager',
  staff: 'Staff',
  viewer: 'Viewer',
};

export default function BusinessTeamManager() {
  const [supabase] = useState(() => createClient());
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState('');
  const [members, setMembers] = useState([]);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('staff');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function loadTeam(activeBusinessId) {
    const { data, error: loadError } = await supabase
      .from('business_memberships')
      .select('id, email, role, status, user_id, created_at')
      .eq('business_id', activeBusinessId)
      .order('created_at');
    if (loadError) throw new Error(`Could not load team members: ${loadError.message}`);
    setMembers(data || []);
  }

  useEffect(() => {
    async function initialize() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) throw new Error(authError?.message || 'Please sign in again.');
        setUserId(user.id);
        const context = await getBusinessContext(supabase, user.id);
        setRole(context.role);
        await loadTeam(context.business_id);
      } catch (loadError) {
        setError(loadError.message || 'Could not load business team.');
      } finally {
        setLoading(false);
      }
    }
    initialize();
  }, [supabase]);

  async function inviteMember(event) {
    event.preventDefault();
    setBusyId('invite');
    setError('');
    setMessage('');
    const { data, error: inviteError } = await supabase.rpc('invite_business_member', {
      p_email: email,
      p_role: inviteRole,
    });
    if (inviteError) {
      setError(inviteError.message);
    } else {
      setMessage(data?.[0]?.invitation_status === 'pending'
        ? 'Invitation saved. Ask the person to sign up using this email address; access activates when they create their account.'
        : 'Team member added.');
      setEmail('');
      try {
        const { business_id: businessId } = await getBusinessContext(supabase, userId);
        await loadTeam(businessId);
      } catch (loadError) {
        setError(loadError.message);
      }
    }
    setBusyId('');
  }

  async function changeRole(member, nextRole) {
    setBusyId(member.id);
    setError('');
    setMessage('');
    const { error: updateError } = await supabase
      .from('business_memberships')
      .update({ role: nextRole })
      .eq('id', member.id);
    if (updateError) {
      setError(updateError.message);
    } else {
      setMembers((current) => current.map((item) => item.id === member.id ? { ...item, role: nextRole } : item));
      setMessage(`Role updated for ${member.email}.`);
    }
    setBusyId('');
  }

  async function removeMember(member) {
    if (!window.confirm(`Remove ${member.email} from this business? Their account and existing business records will not be deleted.`)) return;
    setBusyId(member.id);
    setError('');
    setMessage('');
    const { error: deleteError } = await supabase.from('business_memberships').delete().eq('id', member.id);
    if (deleteError) {
      setError(deleteError.message);
    } else {
      setMembers((current) => current.filter((item) => item.id !== member.id));
      setMessage(`${member.email} was removed from the business.`);
    }
    setBusyId('');
  }

  if (loading) return <p className="text-sm text-slate-500">Loading business team...</p>;
  if (error && !members.length) return <p role="alert" className="text-sm text-red-700">{error}</p>;

  return (
    <section className="card mt-6 max-w-3xl space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Team access</h2>
        <p className="mt-1 text-sm text-slate-600">Share this business’s data with teammates. The business owner’s subscription covers its members.</p>
      </div>
      {canManageBusiness(role) && (
        <form onSubmit={inviteMember} className="grid gap-3 sm:grid-cols-[1fr_180px_auto]">
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
            Teammate email
            <input className="input" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
            Role
            <select className="input" value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}>
              <option value="manager">Manager</option>
              <option value="staff">Staff</option>
              <option value="viewer">Viewer</option>
            </select>
          </label>
          <button type="submit" className="btn-primary self-end" disabled={busyId === 'invite'}>
            {busyId === 'invite' ? 'Adding...' : 'Add teammate'}
          </button>
        </form>
      )}
      {members.length ? (
        <ul className="divide-y divide-slate-100">
          {members.map((member) => (
            <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">{member.email}{member.user_id === userId ? ' · You' : ''}</p>
                <p className="text-xs text-slate-500">{member.status === 'pending' ? 'Invitation pending' : roleLabels[member.role]}</p>
              </div>
              {canManageBusiness(role) && member.role !== 'owner' && (
                <div className="flex items-center gap-3">
                  <label className="sr-only" htmlFor={`member-role-${member.id}`}>Role for {member.email}</label>
                  <select
                    id={`member-role-${member.id}`}
                    className="input min-h-10 py-2 text-sm"
                    value={member.role}
                    disabled={busyId === member.id}
                    onChange={(event) => changeRole(member, event.target.value)}
                  >
                    <option value="manager">Manager</option>
                    <option value="staff">Staff</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button type="button" className="text-sm font-semibold text-red-700 disabled:opacity-50" onClick={() => removeMember(member)} disabled={busyId === member.id}>
                    Remove
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-slate-500">No team members yet.</p>}
      {!canManageBusiness(role) && <p className="text-xs text-slate-500">Only owners and managers can change team access.</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
    </section>
  );
}
