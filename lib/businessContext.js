export async function getBusinessContext(supabase, userId) {
  const { data, error } = await supabase
    .from('business_memberships')
    .select('business_id, role')
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  if (error) throw new Error(`Could not load business access: ${error.message}`);
  return data;
}

export function canWriteBusinessData(role) {
  return ['owner', 'manager', 'staff'].includes(role);
}

export function canManageBusiness(role) {
  return ['owner', 'manager'].includes(role);
}
