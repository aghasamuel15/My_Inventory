'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../lib/supabaseClient';

const maxLogoBytes = 2 * 1024 * 1024;

export default function BusinessProfileForm() {
  const supabase = createClient();
  const [userId, setUserId] = useState('');
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

      setUserId(user.id);
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('business_name, business_logo_url')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) {
        setError(profileError.message);
      } else {
        setBusinessName(data?.business_name || '');
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

    const { error: saveError } = await supabase.from('profiles').upsert({
      id: userId,
      business_name: businessName.trim(),
      business_logo_url: logoUrl || null,
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
    const path = `${userId}/logo.${extension}`;
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
    const { error: saveError } = await supabase.from('profiles').upsert({
      id: userId,
      business_name: businessName.trim() || null,
      business_logo_url: nextLogoUrl,
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

    if (objectPath) {
      const { error: removeError } = await supabase.storage.from('business-logos').remove([decodeURIComponent(objectPath)]);
      if (removeError) {
        setSaving(false);
        setError(removeError.message);
        return;
      }
    }

    const { error: saveError } = await supabase
      .from('profiles')
      .update({ business_logo_url: null })
      .eq('id', userId);
    setSaving(false);

    if (saveError) {
      setError(saveError.message);
    } else {
      setLogoUrl('');
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
        />
      </div>
      <div>
        <span className="label">Invoice logo</span>
        {logoUrl && (
          <div className="mb-3 flex items-center gap-4">
            <img src={logoUrl} alt="Business logo preview" className="h-16 w-16 rounded border border-slate-200 object-contain p-1" />
            <button type="button" className="text-sm font-semibold text-red-700" onClick={handleLogoRemove} disabled={saving}>
              Remove logo
            </button>
          </div>
        )}
        <input
          type="file"
          accept="image/png,image/jpeg"
          onChange={handleLogoUpload}
          disabled={saving}
          aria-label="Upload business logo"
        />
        <p className="mt-1 text-xs text-slate-500">PNG or JPEG, up to 2 MB.</p>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
      <button type="submit" className="btn-primary disabled:opacity-60" disabled={saving}>
        {saving ? 'Saving...' : 'Save business profile'}
      </button>
    </form>
  );
}
