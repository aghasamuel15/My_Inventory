import BusinessProfileForm from '../../../components/BusinessProfileForm';
import BusinessTeamManager from '../../../components/BusinessTeamManager';
import AccountSettings from '../../../components/AccountSettings';

export default function SettingsPage() {
  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold tracking-[-0.04em] text-slate-900">Settings</h1>
      <p className="mb-6 text-sm text-slate-600">Manage your business profile, team access, account security and appearance.</p>
      <BusinessProfileForm />
      <AccountSettings />
      <BusinessTeamManager />
    </div>
  );
}
