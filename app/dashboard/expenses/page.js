'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../../lib/supabaseClient';

const formatNaira = (value) => `₦${Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

export default function ExpensesPage() {
  const supabase = createClient();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    amount: '',
    expense_date: new Date().toISOString().slice(0, 10),
    category: '',
    description: '',
  });

  async function load() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('expenses')
      .select('*')
      .eq('user_id', user.id)
      .order('expense_date', { ascending: false })
      .limit(100);

    setExpenses(data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      setSaving(false);
      alert('Your session has expired. Please sign in again before adding an expense.');
      return;
    }

    const { error } = await supabase.from('expenses').insert({
      user_id: user.id,
      amount: Number(form.amount),
      expense_date: form.expense_date,
      category: form.category,
      description: form.description,
    });

    setSaving(false);
    if (!error) {
      setForm({
        amount: '',
        expense_date: new Date().toISOString().slice(0, 10),
        category: '',
        description: '',
      });
      load();
      return;
    }

    alert(error.message);
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Expenses</h1>

      <form onSubmit={handleSubmit} className="card mb-8 grid gap-4 md:grid-cols-5">
        <div>
          <label className="label">Amount</label>
          <input className="input" type="number" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </div>
        <div>
          <label className="label">Date</label>
          <input className="input" type="date" required value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
        </div>
        <div>
          <label className="label">Category</label>
          <input className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        </div>
        <div className="md:col-span-2">
          <label className="label">Description</label>
          <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="md:col-span-5">
          <button type="submit" disabled={saving} className="btn-primary w-full sm:w-auto">
            {saving ? 'Saving...' : 'Add expense'}
          </button>
        </div>
      </form>

      {loading ? (
        <div>Loading expenses...</div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:block">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="py-2">Date</th>
                <th>Category</th>
                <th>Description</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr key={expense.id} className="border-b last:border-none">
                  <td className="py-2">{expense.expense_date}</td>
                  <td>{expense.category || '—'}</td>
                  <td>{expense.description || '—'}</td>
                  <td className="text-right font-semibold text-red-600">{formatNaira(expense.amount)}</td>
                </tr>
              ))}
              {expenses.length === 0 && (
                <tr>
                  <td colSpan="4" className="py-8 text-center text-slate-400">
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
                    <p className="mt-1 text-xs text-slate-500">{expense.expense_date}</p>
                  </div>
                  <span className="shrink-0 font-bold text-red-600">{formatNaira(expense.amount)}</span>
                </div>
                <p className="mt-3 break-words border-t border-slate-100 pt-3 text-sm text-slate-600">{expense.description || 'No description'}</p>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
