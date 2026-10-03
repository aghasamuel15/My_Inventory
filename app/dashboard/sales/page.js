'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../../lib/supabaseClient';
import OfflineSyncStatus from '../../../components/OfflineSyncStatus';
import { enqueueOfflineEntry } from '../../../lib/offlineQueue';

const formatNaira = (value) => `₦${Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
const today = () => new Date().toLocaleDateString('en-CA');

export default function SalesPage() {
  const supabase = createClient();
  const [sales, setSales] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    customer_id: '',
    product_id: '',
    quantity: '1',
    sale_date: today(),
    description: '',
  });
  const selectedProduct = products.find((product) => product.id === form.product_id);
  const saleTotal = Number(form.quantity || 0) * Number(selectedProduct?.selling_price || 0);

  async function load() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    setUserId(user.id);

    const [{ data: salesData }, { data: customerData }, { data: productData }] = await Promise.all([
      supabase.from('sales').select('*').eq('user_id', user.id).order('sale_date', { ascending: false }).limit(100),
      supabase.from('customers').select('id, name').eq('user_id', user.id).order('name'),
      supabase.from('inventory_products').select('id, name, selling_price, quantity, unit').eq('user_id', user.id).eq('is_active', true).order('name'),
    ]);

    setSales(salesData || []);
    setCustomers(customerData || []);
    setProducts(productData || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    window.addEventListener('offline-entries-synced', load);
    return () => window.removeEventListener('offline-entries-synced', load);
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.product_id) {
      alert('Add an inventory product before recording a sale.');
      return;
    }
    const saleId = crypto.randomUUID();
    const payload = {
      p_product_id: form.product_id,
      p_customer_id: form.customer_id || null,
      p_quantity: Number(form.quantity),
      p_sale_date: form.sale_date,
      p_description: form.description || null,
      p_sale_id: saleId,
    };

    if (!navigator.onLine) {
      try {
        enqueueOfflineEntry(userId, { id: saleId, type: 'sale', payload, createdAt: new Date().toISOString() });
      } catch (queueError) {
        alert(queueError.message || 'Could not save this sale on your device.');
        return;
      }
      setForm({ customer_id: '', product_id: '', quantity: '1', sale_date: today(), description: '' });
      return;
    }

    setSaving(true);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      setSaving(false);
      alert('Your session has expired. Please sign in again before recording a sale.');
      return;
    }

    const { error } = await supabase.rpc('record_product_sale', payload);

    setSaving(false);
    if (error) {
      if (!navigator.onLine || !error.status || /fetch|network|offline/i.test(error.message || '')) {
        try {
          enqueueOfflineEntry(user.id, { id: saleId, type: 'sale', payload, createdAt: new Date().toISOString() });
        } catch (queueError) {
          alert(queueError.message || 'Could not save this sale on your device.');
          return;
        }
        setForm({ customer_id: '', product_id: '', quantity: '1', sale_date: today(), description: '' });
        return;
      }
      alert(error.message);
      return;
    }

    setForm({ customer_id: '', product_id: '', quantity: '1', sale_date: today(), description: '' });
    await load();
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Sales</h1>
      <OfflineSyncStatus userId={userId} supabase={supabase} />

      <form onSubmit={handleSubmit} className="card mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div>
          <label className="label">Product</label>
          <select className="input" required value={form.product_id} onChange={(event) => setForm({ ...form, product_id: event.target.value })}>
            <option value="">Select inventory item</option>
            {products.map((product) => (
              <option key={product.id} value={product.id} disabled={Number(product.quantity) <= 0}>
                {product.name} · {product.quantity} {product.unit} in stock
              </option>
            ))}
          </select>
          {selectedProduct && <p className="mt-1 text-xs text-slate-500">{formatNaira(selectedProduct.selling_price)} per {selectedProduct.unit}</p>}
        </div>
        <div>
          <label className="label">Quantity</label>
          <input className="input" type="number" min="0.01" step="0.01" max={selectedProduct?.quantity || undefined} required value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} />
        </div>
        <div>
          <label className="label">Customer</label>
          <select className="input" value={form.customer_id} onChange={(event) => setForm({ ...form, customer_id: event.target.value })}>
            <option value="">No customer</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Date</label>
          <input className="input" type="date" required value={form.sale_date} onChange={(event) => setForm({ ...form, sale_date: event.target.value })} />
        </div>
        <div>
          <label className="label">Description</label>
          <input className="input" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        </div>
        <div className="flex flex-wrap items-end gap-4 xl:col-span-5">
          <button type="submit" disabled={saving || !products.length} className="btn-primary w-full sm:w-auto">
            {saving ? 'Saving...' : 'Add sale'}
          </button>
          <span className="pb-3 text-sm font-semibold text-slate-600">Sale total: <span className="text-emerald-700">{formatNaira(saleTotal)}</span></span>
          {!products.length && <span className="pb-3 text-sm text-amber-700">Add products in Inventory before recording sales.</span>}
        </div>
      </form>

      {loading ? (
        <div>Loading sales...</div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:block">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="py-2">Date</th>
                <th>Product</th>
                <th>Qty</th>
                <th>Customer</th>
                <th>Description</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <tr key={sale.id} className="border-b last:border-none">
                  <td className="py-2">{sale.sale_date}</td>
                  <td>{sale.product_name || 'Untracked sale'}</td>
                  <td>{sale.quantity || 1}</td>
                  <td>{customers.find((customer) => customer.id === sale.customer_id)?.name || '—'}</td>
                  <td>{sale.description || '—'}</td>
                  <td className="text-right font-semibold text-emerald-600">{formatNaira(sale.amount)}</td>
                </tr>
              ))}
              {sales.length === 0 && (
                <tr><td colSpan="6" className="py-8 text-center text-slate-400">No sales recorded yet.</td></tr>
              )}
            </tbody>
          </table>
          </div>
          <div className="space-y-3 md:hidden">
            {sales.length === 0 ? (
              <div className="card text-center text-sm text-slate-500">No sales recorded yet.</div>
            ) : sales.map((sale) => (
              <article key={sale.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="break-words font-semibold text-slate-900">{sale.product_name || 'Untracked sale'}</h2>
                    <p className="mt-1 text-xs text-slate-500">{sale.sale_date}</p>
                  </div>
                  <span className="shrink-0 font-bold text-emerald-700">{formatNaira(sale.amount)}</span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-sm">
                  <div><dt className="text-xs text-slate-500">Quantity</dt><dd className="mt-0.5 text-slate-800">{sale.quantity || 1}</dd></div>
                  <div><dt className="text-xs text-slate-500">Customer</dt><dd className="mt-0.5 break-words text-slate-800">{customers.find((customer) => customer.id === sale.customer_id)?.name || '—'}</dd></div>
                  <div className="col-span-2"><dt className="text-xs text-slate-500">Description</dt><dd className="mt-0.5 break-words text-slate-800">{sale.description || '—'}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}