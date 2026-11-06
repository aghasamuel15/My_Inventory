'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../lib/supabaseClient';
import { canManageBusiness, getBusinessContext } from '../lib/businessContext';

const maxLogoBytes = 2 * 1024 * 1024;

export default function BusinessProfileForm() {
  const supabase = createClient();
  const [businessId, setBusinessId] = useState('');
  const [canManage, setCanManage] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadProfile() {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        setError(authError?.message || 'Please sign in again.');
        setLoading(false);
        return;
      }

      let context;
      try {
        context = await getBusinessContext(supabase, user.id);
      } catch (contextError) {
        setError(contextError.message);
        setLoading(false);
        return;
      }
      setBusinessId(context.business_id);
      setCanManage(canManageBusiness(context.role));
      const { data: business, error: businessError } = await supabase
        .from('businesses')
        .select('name')
        .eq('id', context.business_id)
        .single();
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('business_logo_url')
        .eq('id', context.business_id)
        .maybeSingle();

      if (businessError || profileError) {
        setError(businessError?.message || profileError?.message);
      } else {
        setBusinessName(business?.name || '');
        setLogoUrl(data?.business_logo_url || '');
      }
      setLoading(false);
    }

    loadProfile();
  }, []);

  async function handleSave(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    const { error: saveError } = await supabase.rpc('update_business_profile', {
      p_name: businessName.trim(),
      p_logo_url: logoUrl || null,
    });

    setSaving(false);
    if (saveError) {
      setError(saveError.message);
    } else {
      setMessage('Business profile saved.');
    }
  }

  async function handleLogoUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > maxLogoBytes) {
      setError('Choose a PNG or JPEG logo no larger than 2 MB.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    const extension = file.type === 'image/png' ? 'png' : 'jpg';
    const path = `${businessId}/logo.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from('business-logos')
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      setSaving(false);
      setError(uploadError.message);
      return;
    }

    const { data } = supabase.storage.from('business-logos').getPublicUrl(path);
    const nextLogoUrl = `${data.publicUrl}?updated=${Date.now()}`;
    const { error: saveError } = await supabase.rpc('update_business_profile', {
      p_name: businessName.trim(),
      p_logo_url: nextLogoUrl,
    });

    setSaving(false);
    if (saveError) {
      setError(saveError.message);
    } else {
      setLogoUrl(nextLogoUrl);
      setMessage('Logo uploaded and saved.');
    }
  }

  async function handleLogoRemove() {
    if (!logoUrl) return;
    setSaving(true);
    setError('');
    setMessage('');
    const url = new URL(logoUrl);
    const objectPath = url.pathname.split('/storage/v1/object/public/business-logos/')[1];

    const { error: saveError } = await supabase.rpc('update_business_profile', {
      p_name: businessName,
      p_logo_url: null,
    });
    setSaving(false);

    if (saveError) {
      setError(saveError.message);
    } else {
      setLogoUrl('');
      if (objectPath) {
        const { error: removeError } = await supabase.storage.from('business-logos').remove([decodeURIComponent(objectPath)]);
        if (removeError) {
          setError(`Logo link removed, but the stored image could not be deleted: ${removeError.message}`);
          return;
        }
      }
      setMessage('Logo removed.');
    }
  }

  if (loading) return <p>Loading business profile...</p>;

  return (
    <form onSubmit={handleSave} className="card max-w-2xl space-y-5">
      <div>
        <label className="label" htmlFor="business-name">Business name</label>
        <input
          id="business-name"
          className="input"
          maxLength={120}
          value={businessName}
          onChange={(event) => setBusinessName(event.target.value)}
          required
          disabled={!canManage}
        />
      </div>
      <div>
        <span className="label">Invoice logo</span>
        {logoUrl && (
          <div className="mb-3 flex items-center gap-4">
            <img src={logoUrl} alt="Business logo preview" className="h-16 w-16 rounded border border-slate-200 object-contain p-1" />
            <button type="button" className="text-sm font-semibold text-red-700" onClick={handleLogoRemove} disabled={saving || !canManage}>
              Remove logo
            </button>
          </div>
        )}
        <input
          type="file"
          accept="image/png,image/jpeg"
          onChange={handleLogoUpload}
          disabled={saving || !canManage}
          aria-label="Upload business logo"
        />
        <p className="mt-1 text-xs text-slate-500">PNG or JPEG, up to 2 MB.</p>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
      {!canManage && <p className="text-xs text-slate-500">Only owners and managers can edit the business profile.</p>}
      <button type="submit" className="btn-primary disabled:opacity-60" disabled={saving || !canManage}>
        {saving ? 'Saving...' : 'Save business profile'}
      </button>
    </form>
  );
}
