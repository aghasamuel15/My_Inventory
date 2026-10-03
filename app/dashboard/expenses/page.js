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
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : 'Add expense'}
          </button>
        </div>
      </form>

      {loading ? (
        <div>Loading expenses...</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
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
      )}
    </div>
  );
}
