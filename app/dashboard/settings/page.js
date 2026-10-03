import BusinessProfileForm from '../../../components/BusinessProfileForm';

export default function SettingsPage() {
  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-slate-900">Business profile</h1>
      <p className="mb-6 text-sm text-slate-600">Your business name and logo appear on invoice PDFs and customer emails.</p>
      <BusinessProfileForm />
    </div>
  );
}
