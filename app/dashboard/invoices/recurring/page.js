import { notFound } from 'next/navigation';
import RecurringTemplatesList from '../../../../components/RecurringTemplatesList';
import { canWriteBusinessData, getBusinessContext } from '../../../../lib/businessContext';
import { createServerSupabaseClient } from '../../../../lib/supabaseServer';

export default async function RecurringInvoicesPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();
  const context = await getBusinessContext(supabase, user.id);
  const { business_id: businessId } = context;

  const { data: templates, error } = await supabase
    .from('recurring_invoice_templates')
    .select('id, frequency, next_issue_date, items, active, customer:customers(name)')
    .eq('user_id', businessId)
    .order('next_issue_date');
  if (error) throw new Error(`Could not load recurring invoice schedules: ${error.message}`);

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-slate-900">Recurring invoices</h1>
      <p className="mb-6 text-sm text-slate-600">Scheduled invoices are created as drafts for you to review and send. No recurring invoice is emailed automatically.</p>
      <RecurringTemplatesList templates={templates || []} canWrite={canWriteBusinessData(context.role)} />
    </div>
  );
}
