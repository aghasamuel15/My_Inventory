'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../lib/supabaseClient';
import { canManageBusiness, getBusinessContext } from '../lib/businessContext';

const roleLabels = {
  owner: 'Admin',
  manager: 'Manager',
  staff: 'Staff',
  viewer: 'Viewer',
};
const configurableFeatures = [
  { id: 'sales', label: 'Sales' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'customers', label: 'Customers' },
  { id: 'invoices', label: 'Invoices and payments' },
  { id: 'reports', label: 'Reports' },
];
const allFeatures = configurableFeatures.map((feature) => feature.id);

function getRoleFeatureRpcError(error) {
  const missingFunction = error?.code === 'PGRST202'
    || error?.message?.includes('get_business_role_features')
    || error?.message?.includes('set_business_role_features');

  if (missingFunction) {
    return 'Supabase is missing the role-feature function or has a stale schema cache. Run supabase/repair_business_role_feature_functions.sql in the Supabase SQL Editor, then reload the app.';
  }

  return error?.message || 'Unknown Supabase error.';
}

export default function BusinessTeamManager() {
  const [supabase] = useState(() => createClient());
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState('');
  const [members, setMembers] = useState([]);
  const [roleFeatures, setRoleFeatures] = useState({});
  const [memberName, setMemberName] = useState('');
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('staff');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [savingRole, setSavingRole] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function loadTeam(activeBusinessId) {
    const { data, error: loadError } = await supabase
      .from('business_memberships')
      .select('id, member_name, email, role, status, user_id, created_at')
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
        if (context.role === 'owner') {
          const { data: permissions, error: permissionsError } = await supabase.rpc('get_business_role_features');
          if (permissionsError) {
            throw new Error(`Could not load role feature settings: ${getRoleFeatureRpcError(permissionsError)}`);
          }
          setRoleFeatures(Object.fromEntries(
            (permissions || []).map((item) => [item.role, item.features || allFeatures])
          ));
        }
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
    try {
      const response = await fetch('/api/business/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: memberName, email, role: inviteRole }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (result.invitationCreated) {
          setMessage('The invitation is saved, but its email was not sent.');
          setError(`${result.error} You can retry using Resend invitation.`);
        } else {
          setError(result.error || 'Could not send the invitation.');
        }
      } else {
        setMessage(result.message || 'Invitation email sent.');
        setError('');
      }
      setMemberName('');
      setEmail('');
      try {
        const { business_id: businessId } = await getBusinessContext(supabase, userId);
        await loadTeam(businessId);
      } catch (loadError) {
        setError(loadError.message);
      }
    } catch (inviteError) {
      setError(inviteError.message || 'Could not send the invitation.');
    } finally {
      setBusyId('');
    }
  }

  async function resendInvitation(member) {
    setBusyId(member.id);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/business/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: member.member_name, email: member.email, role: member.role }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not resend the invitation.');
      setMessage(result.message || `Invitation email sent to ${member.email}.`);
    } catch (resendError) {
      setError(resendError.message || 'Could not resend the invitation.');
    } finally {
      setBusyId('');
    }
  }

  async function saveRoleFeatures(targetRole) {
    setSavingRole(targetRole);
    setError('');
    setMessage('');
    const { error: saveError } = await supabase.rpc('set_business_role_features', {
      p_role: targetRole,
      p_features: roleFeatures[targetRole] || [],
    });
    if (saveError) {
      setError(`Could not save ${roleLabels[targetRole]} access: ${getRoleFeatureRpcError(saveError)}`);
    } else {
      setMessage(`${roleLabels[targetRole]} feature access saved.`);
    }
    setSavingRole('');
  }

  function toggleRoleFeature(targetRole, featureId) {
    setRoleFeatures((current) => {
      const currentFeatures = current[targetRole] || [];
      return {
        ...current,
        [targetRole]: currentFeatures.includes(featureId)
          ? currentFeatures.filter((feature) => feature !== featureId)
          : [...currentFeatures, featureId],
      };
    });
    setMessage('');
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

  async function saveMemberName(member) {
    const name = member.member_name.trim();
    if (!name) {
      setError('Enter a teammate name before saving.');
      return;
    }

    setBusyId(member.id);
    setError('');
    setMessage('');
    const { error: updateError } = await supabase
      .from('business_memberships')
      .update({ member_name: name })
      .eq('id', member.id);
    if (updateError) {
      setError(`Could not save teammate name: ${updateError.message}`);
    } else {
      setMembers((current) => current.map((item) => item.id === member.id ? { ...item, member_name: name } : item));
      setMessage(`Name saved for ${name}.`);
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
        <p className="mt-1 text-sm text-slate-600">The first account for a business is its Admin and has full access. Admin access cannot be granted by invitation; invite teammates as Manager, Staff, or Viewer. The Admin’s subscription covers the team.</p>
      </div>
      {canManageBusiness(role) && (
        <form onSubmit={inviteMember} className="grid gap-3 sm:grid-cols-[1fr_1fr_180px_auto]">
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
            Teammate name
            <input className="input" type="text" autoComplete="name" required value={memberName} onChange={(event) => setMemberName(event.target.value)} />
          </label>
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
            {busyId === 'invite' ? 'Sending...' : 'Send invitation'}
          </button>
        </form>
      )}
      {members.length ? (
        <ul className="divide-y divide-slate-100">
          {members.map((member) => (
            <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">{member.member_name || member.email}{member.user_id === userId ? ' · You' : ''}</p>
                <p className="text-xs text-slate-500">{member.email} · {roleLabels[member.role]}</p>
                <p className="text-xs text-slate-500">
                  {member.status === 'pending' ? 'Invitation pending · ' : 'Added '}
                  {new Date(member.created_at).toLocaleDateString()}
                </p>
              </div>
              {role === 'owner' && member.role !== 'owner' && (
                <div className="flex items-center gap-2">
                  <label className="sr-only" htmlFor={`member-name-${member.id}`}>Name for {member.email}</label>
                  <input
                    id={`member-name-${member.id}`}
                    className="input min-h-10 py-2 text-sm"
                    value={member.member_name}
                    placeholder="Add teammate name"
                    maxLength={120}
                    onChange={(event) => setMembers((current) => current.map((item) => (
                      item.id === member.id ? { ...item, member_name: event.target.value } : item
                    )))}
                  />
                  <button
                    type="button"
                    className="text-sm font-semibold text-brand-700 disabled:opacity-50"
                    onClick={() => saveMemberName(member)}
                    disabled={busyId === member.id || !member.member_name.trim()}
                  >
                    Save name
                  </button>
                </div>
              )}
              {canManageBusiness(role) && member.role !== 'owner' && (
                <div className="flex items-center gap-3">
                  {member.status === 'pending' && (
                    <button
                      type="button"
                      className="text-sm font-semibold text-brand-700 disabled:opacity-50"
                      onClick={() => resendInvitation(member)}
                      disabled={busyId === member.id}
                    >
                      {busyId === member.id ? 'Sending...' : 'Resend invitation'}
                    </button>
                  )}
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
      {role === 'owner' && (
        <div className="space-y-4 border-t border-slate-100 pt-5">
          <div>
            <h3 className="font-semibold text-slate-900">Feature access by role</h3>
            <p className="mt-1 text-sm text-slate-600">Choose which sections each role can access. Admins always have access to every section. Viewers remain read-only, and only Admins and managers can manage the team.</p>
          </div>
          {['manager', 'staff', 'viewer'].map((targetRole) => (
            <fieldset key={targetRole} className="rounded-xl border border-slate-200 p-4">
              <legend className="px-1 text-sm font-semibold text-slate-800">{roleLabels[targetRole]}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {configurableFeatures.map((feature) => (
                  <label key={feature.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={(roleFeatures[targetRole] || []).includes(feature.id)}
                      onChange={() => toggleRoleFeature(targetRole, feature.id)}
                      disabled={savingRole === targetRole}
                    />
                    {feature.label}
                  </label>
                ))}
              </div>
              <button
                type="button"
                className="btn-secondary mt-4 text-sm"
                onClick={() => saveRoleFeatures(targetRole)}
                disabled={savingRole === targetRole}
              >
                {savingRole === targetRole ? 'Saving...' : `Save ${roleLabels[targetRole]} access`}
              </button>
            </fieldset>
          ))}
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
    </section>
  );
}
