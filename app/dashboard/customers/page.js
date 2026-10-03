'use client';

import { useEffect, useState } from 'react';
import { getInvoiceBalance } from '../../../lib/invoiceBalance';
import { createClient } from '../../../lib/supabaseClient';

const formatNaira = (value) => `₦${Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

export default function CustomersPage() {
  const supabase = createClient();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '' });

  async function load() {
    setLoading(true);
    setLoadError('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: customersData, error: customerError } = await supabase
      .from('customers')
      .select('*')
      .eq('user_id', user.id)
      .order('name');

    const { data: invoicesData, error: invoiceError } = await supabase
      .from('invoices')
      .select('customer_id, total, status, document_type, payments:invoice_payments(amount)')
      .eq('user_id', user.id);

    if (customerError || invoiceError) {
      setLoadError(customerError?.message || invoiceError?.message || 'Could not load customer balances.');
      setLoading(false);
      return;
    }

    const owedByCustomer = {};
    for (const invoice of invoicesData || []) {
      if (!invoice.customer_id || invoice.document_type === 'quote' || invoice.status === 'draft') continue;
      owedByCustomer[invoice.customer_id] = (owedByCustomer[invoice.customer_id] || 0)
        + getInvoiceBalance(invoice);
    }

    setCustomers((customersData || []).map((customer) => ({ ...customer, owed: owedByCustomer[customer.id] || 0 })));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from('customers').insert({
      user_id: user.id,
      ...form,
    });

    setSaving(false);
    if (!error) {
      setForm({ name: '', phone: '', email: '', address: '' });
      load();
      return;
    }

    alert(error.message);
  }

  async function handleDelete(id) {
    const confirmed = confirm('Delete this customer?');
    if (!confirmed) return;

    await supabase.from('customers').delete().eq('id', id);
    load();
  }

  const totalOwed = customers.reduce((sum, customer) => sum + Number(customer.owed || 0), 0);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Customers</h1>

      <form onSubmit={handleSubmit} className="card mb-8 grid gap-4 md:grid-cols-5">
        <div>
          <label className="label">Name</label>
          <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label">Phone</label>
          <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label className="label">Address</label>
          <input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <div>
          <button type="submit" disabled={saving} className="btn-primary w-full">
            {saving ? 'Saving...' : 'Add customer'}
          </button>
        </div>
      </form>

      {loadError && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{loadError}</p>}
      {loading ? (
        <div>Loading customers...</div>
      ) : (
        <>
          <div className="mb-4 text-sm text-slate-600">
            Total owed to you:{' '}
            <span className="font-bold text-red-600">{formatNaira(totalOwed)}</span>
          </div>

          <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:block">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2">Name</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th className="text-right">Owes you</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id} className="border-b last:border-none">
                    <td className="py-2">{customer.name}</td>
                    <td>{customer.phone || '—'}</td>
                    <td>{customer.email || '—'}</td>
                    <td className={`text-right font-semibold ${customer.owed > 0 ? 'text-red-600' : ''}`}>
                      {formatNaira(customer.owed)}
                    </td>
                    <td className="text-right">
                      <a href={`/dashboard/customers/${customer.id}/statement`} className="mr-3 text-xs font-semibold text-brand-700 hover:underline">
                        Statement
                      </a>
                      <button onClick={() => handleDelete(customer.id)} className="text-xs font-semibold text-red-600">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {customers.length === 0 && (
                  <tr>
                    <td colSpan="5" className="py-8 text-center text-slate-400">
                      No customers yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 md:hidden">
            {customers.length === 0 ? (
              <div className="card text-center text-sm text-slate-500">No customers yet.</div>
            ) : customers.map((customer) => (
              <article key={customer.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="break-words font-semibold text-slate-900">{customer.name}</h2>
                    <p className="mt-1 break-all text-sm text-slate-600">{customer.phone || customer.email || 'No contact details'}</p>
                  </div>
                  <div className={`shrink-0 text-right font-bold ${customer.owed > 0 ? 'text-red-600' : 'text-slate-800'}`}>
                    {formatNaira(customer.owed)}
                    <div className="text-[11px] font-medium text-slate-500">owed</div>
                  </div>
                </div>
                {customer.phone && customer.email && <p className="mt-2 break-all text-xs text-slate-500">{customer.email}</p>}
                {customer.address && <p className="mt-2 break-words text-xs text-slate-500">{customer.address}</p>}
                <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
                  <a href={`/dashboard/customers/${customer.id}/statement`} className="btn-secondary flex-1 text-center text-sm">Statement</a>
                  <button onClick={() => handleDelete(customer.id)} className="rounded-xl border border-red-100 px-4 py-2 text-sm font-semibold text-red-600">Delete</button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
