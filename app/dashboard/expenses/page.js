'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../../lib/supabaseClient';
import OfflineSyncStatus from '../../../components/OfflineSyncStatus';
import { enqueueOfflineEntry } from '../../../lib/offlineQueue';

const formatNaira = (value) => `₦${Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

export default function ExpensesPage() {
  const supabase = createClient();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState('');
  const [receiptFile, setReceiptFile] = useState(null);
  const [formMessage, setFormMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({
    amount: '',
    expense_date: new Date().toISOString().slice(0, 10),
    category: '',
    description: '',
    payment_account: 'cash',
  });

  async function load() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    setUserId(user.id);

    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('user_id', user.id)
      .order('expense_date', { ascending: false })
      .limit(100);

    if (error) {
      setFormError(error.message || 'Could not load expenses.');
      setLoading(false);
      return;
    }

    try {
      const expensesWithReceiptUrls = await Promise.all((data || []).map(async (expense) => {
        if (!expense.receipt_path) return expense;
        const { data: signedUrl, error: receiptError } = await supabase.storage
          .from('expense-receipts')
          .createSignedUrl(expense.receipt_path, 60 * 60);
        if (receiptError) throw new Error(`Could not load receipt link: ${receiptError.message}`);
        return { ...expense, receiptUrl: signedUrl.signedUrl };
      }));
      setExpenses(expensesWithReceiptUrls);
    } catch (receiptError) {
      setFormError(receiptError.message || 'Could not load receipt links.');
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    window.addEventListener('offline-entries-synced', load);
    return () => window.removeEventListener('offline-entries-synced', load);
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setFormMessage('');
    setFormError('');
    if (receiptFile && (!['image/jpeg', 'image/png', 'image/webp'].includes(receiptFile.type) || receiptFile.size > 5 * 1024 * 1024)) {
      setFormError('Choose a JPEG, PNG, or WebP receipt photo no larger than 5 MB.');
      return;
    }
    if (!navigator.onLine && receiptFile) {
      setFormError('Receipt photos need an internet connection. Remove the photo to save the expense offline.');
      return;
    }
    const expenseId = crypto.randomUUID();
    const payload = {
      id: expenseId,
      user_id: userId,
      amount: Number(form.amount),
      expense_date: form.expense_date,
      category: form.category,
      description: form.description,
      payment_account: form.payment_account,
    };

    if (!navigator.onLine) {
      try {
        enqueueOfflineEntry(userId, { id: expenseId, type: 'expense', payload, createdAt: new Date().toISOString() });
      } catch (queueError) {
        setFormError(queueError.message || 'Could not save this expense on your device.');
        return;
      }
      setFormMessage('Expense saved on this device and will sync when you reconnect.');
      setForm({ amount: '', expense_date: new Date().toISOString().slice(0, 10), category: '', description: '', payment_account: 'cash' });
      setReceiptFile(null);
      return;
    }

    setSaving(true);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      setSaving(false);
      alert('Your session has expired. Please sign in again before adding an expense.');
      return;
    }

    const { error } = await supabase.from('expenses').insert(payload);

    if (error && (!navigator.onLine || !error.status || /fetch|network|offline/i.test(error.message || ''))) {
      setSaving(false);
      try {
        enqueueOfflineEntry(user.id, { id: expenseId, type: 'expense', payload: { ...payload, user_id: user.id }, createdAt: new Date().toISOString() });
      } catch (queueError) {
        setFormError(queueError.message || 'Could not save this expense on your device.');
        return;
      }
      setFormMessage('Expense saved on this device and will sync when you reconnect.');
      setForm({ amount: '', expense_date: new Date().toISOString().slice(0, 10), category: '', description: '', payment_account: 'cash' });
      setReceiptFile(null);
      return;
    }
    if (error) {
      setSaving(false);
      setFormError(error.message);
      return;
    }

    if (receiptFile) {
      const safeName = receiptFile.name.replace(/[^a-zA-Z0-9._-]/g, '-');
      const receiptPath = `${user.id}/${expenseId}/${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from('expense-receipts')
        .upload(receiptPath, receiptFile, { contentType: receiptFile.type, upsert: false });
      if (uploadError) {
        setFormError(`Expense saved, but the receipt could not be uploaded: ${uploadError.message}`);
        setForm({ amount: '', expense_date: new Date().toISOString().slice(0, 10), category: '', description: '', payment_account: 'cash' });
        setReceiptFile(null);
        await load();
        setSaving(false);
        return;
      }

      const { error: linkError } = await supabase
        .from('expenses')
        .update({ receipt_path: receiptPath })
        .eq('id', expenseId)
        .eq('user_id', user.id);
      if (linkError) {
        const { error: cleanupError } = await supabase.storage.from('expense-receipts').remove([receiptPath]);
        setFormError(`Expense saved, but its receipt could not be linked: ${linkError.message}${cleanupError ? ` Receipt cleanup also failed: ${cleanupError.message}` : ''}`);
        setForm({ amount: '', expense_date: new Date().toISOString().slice(0, 10), category: '', description: '', payment_account: 'cash' });
        setReceiptFile(null);
        await load();
        setSaving(false);
        return;
      }
    }

    {
      setForm({
        amount: '',
        expense_date: new Date().toISOString().slice(0, 10),
        category: '',
        description: '',
        payment_account: 'cash',
      });
      setReceiptFile(null);
      setFormMessage('Expense added.');
      await load();
    }
    setSaving(false);
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Expenses</h1>
      <OfflineSyncStatus userId={userId} supabase={supabase} />

      <form onSubmit={handleSubmit} className="card mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <div>
          <label className="label">Amount</label>
          <input className="input" type="number" min="0.01" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </div>
        <div>
          <label className="label">Date</label>
          <input className="input" type="date" required value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
        </div>
        <div>
          <label className="label">Paid from</label>
          <select className="input" required value={form.payment_account} onChange={(event) => setForm({ ...form, payment_account: event.target.value })}>
            <option value="cash">Cash</option>
            <option value="bank">Bank</option>
          </select>
        </div>
        <div>
          <label className="label">Category</label>
          <input className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        </div>
        <div className="md:col-span-2">
          <label className="label">Description</label>
          <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="md:col-span-3">
          <label className="label" htmlFor="expense-receipt">Receipt photo (optional)</label>
          <input id="expense-receipt" className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:font-semibold file:text-brand-700" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => setReceiptFile(event.target.files?.[0] || null)} />
          <p className="mt-1 text-xs text-slate-500">JPEG, PNG, or WebP; up to 5 MB.</p>
        </div>
        <div className="md:col-span-5">
          <button type="submit" disabled={saving} className="btn-primary w-full sm:w-auto">
            {saving ? 'Saving...' : 'Add expense'}
          </button>
        </div>
        {formError && <p role="alert" className="md:col-span-6 text-sm text-red-700">{formError}</p>}
        {formMessage && <p role="status" className="md:col-span-6 text-sm text-emerald-700">{formMessage}</p>}
      </form>

      {loading ? (
        <div>Loading expenses...</div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:block">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="py-2">Date</th>
                <th>Category</th>
                <th>Description</th>
                <th>Account</th>
                <th>Receipt</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr key={expense.id} className="border-b last:border-none">
                  <td className="py-2">{expense.expense_date}</td>
                  <td>{expense.category || '—'}</td>
                  <td>{expense.description || '—'}</td>
                  <td className="capitalize">{expense.payment_account === 'unassigned' ? 'Needs account' : expense.payment_account || 'Cash'}</td>
                  <td>{expense.receiptUrl ? <a href={expense.receiptUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 hover:underline">View photo</a> : '—'}</td>
                  <td className="text-right font-semibold text-red-600">{formatNaira(expense.amount)}</td>
                </tr>
              ))}
              {expenses.length === 0 && (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-slate-400">
                    No expenses recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
          <div className="space-y-3 md:hidden">
            {expenses.length === 0 ? (
              <div className="card text-center text-sm text-slate-500">No expenses recorded yet.</div>
            ) : expenses.map((expense) => (
              <article key={expense.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="break-words font-semibold text-slate-900">{expense.category || 'Expense'}</h2>
                    <p className="mt-1 text-xs text-slate-500">{expense.expense_date} · Paid from {expense.payment_account === 'unassigned' ? 'account not set' : expense.payment_account || 'cash'}</p>
                  </div>
                  <span className="shrink-0 font-bold text-red-600">{formatNaira(expense.amount)}</span>
                </div>
                <p className="mt-3 break-words border-t border-slate-100 pt-3 text-sm text-slate-600">{expense.description || 'No description'}</p>
                {expense.receiptUrl && <a href={expense.receiptUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center font-semibold text-brand-700">View receipt photo</a>}
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
