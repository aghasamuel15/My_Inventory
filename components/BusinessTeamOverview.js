'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../lib/supabaseClient';
import { getBusinessContext } from '../lib/businessContext';

const roleLabels = {
  owner: 'Admin',
  manager: 'Manager',
  staff: 'Staff',
  viewer: 'Viewer',
};
const teamRoles = ['manager', 'staff', 'viewer'];

export default function BusinessTeamOverview() {
  const [supabase] = useState(() => createClient());
  const [role, setRole] = useState('');
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadTeamOverview() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) throw new Error(authError?.message || 'Please sign in again.');

        const context = await getBusinessContext(supabase, user.id);
        setRole(context.role);
        if (context.role !== 'owner') return;

        const { data, error: membersError } = await supabase
          .from('business_memberships')
          .select('id, member_name, email, role, status, created_at')
          .eq('business_id', context.business_id)
          .in('role', teamRoles)
          .order('created_at');
        if (membersError) throw new Error(`Could not load team overview: ${membersError.message}`);
        setMembers(data || []);
      } catch (loadError) {
        setError(loadError.message || 'Could not load your business role.');
      } finally {
        setLoading(false);
      }
    }

    loadTeamOverview();
  }, [supabase]);

  if (loading) return null;

  return (
    <section className="mb-6 rounded-2xl border border-[#e1e7df] bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#87938b]">Your access</p>
          <h2 className="mt-1 text-lg font-semibold text-[#20372c]">{roleLabels[role] || 'Business member'}</h2>
        </div>
        {role === 'owner' && (
          <p className="text-sm text-[#738078]">Team summary · {members.length} teammate{members.length === 1 ? '' : 's'}</p>
        )}
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}

      {role === 'owner' && !error && (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {teamRoles.map((teamRole) => {
            const roleMembers = members.filter((member) => member.role === teamRole);
            return (
              <section key={teamRole} className="rounded-xl border border-[#e8ece6] p-3 sm:p-4">
                <h3 className="flex items-center justify-between text-sm font-semibold text-[#20372c]">
                  <span>{roleLabels[teamRole]}</span>
                  <span className="rounded-full bg-[#f1f5f0] px-2.5 py-1 text-xs">{roleMembers.length}</span>
                </h3>
                {roleMembers.length ? (
                  <ul className="mt-2 divide-y divide-[#edf0eb]">
                    {roleMembers.map((member) => (
                      <li key={member.id} className="py-2">
                        <p className="text-sm font-medium text-slate-800">{member.member_name || member.email}</p>
                        <p className="text-xs text-slate-500">{member.email}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {member.status === 'pending' ? 'Invitation pending · ' : 'Added '}
                          {new Date(member.created_at).toLocaleDateString()}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-2 text-xs text-slate-500">No {roleLabels[teamRole].toLowerCase()}s added.</p>}
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
