'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../../lib/supabaseClient';

const formatNaira = (value) => `₦${Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
const today = () => new Date().toLocaleDateString('en-CA');

export default function SalesPage() {
  const supabase = createClient();
  const [sales, setSales] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
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
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.product_id) {
      alert('Add an inventory product before recording a sale.');
      return;
    }
    setSaving(true);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      setSaving(false);
      alert('Your session has expired. Please sign in again before recording a sale.');
      return;
    }

    const { error } = await supabase.rpc('record_product_sale', {
      p_product_id: form.product_id,
      p_customer_id: form.customer_id || null,
      p_quantity: Number(form.quantity),
      p_sale_date: form.sale_date,
      p_description: form.description || null,
    });

    setSaving(false);
    if (error) {
      alert(error.message);
      return;
    }

    setForm({ customer_id: '', product_id: '', quantity: '1', sale_date: today(), description: '' });
    await load();
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Sales</h1>

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
          <button type="submit" disabled={saving || !products.length} className="btn-primary">
            {saving ? 'Saving...' : 'Add sale'}
          </button>
          <span className="pb-3 text-sm font-semibold text-slate-600">Sale total: <span className="text-emerald-700">{formatNaira(saleTotal)}</span></span>
          {!products.length && <span className="pb-3 text-sm text-amber-700">Add products in Inventory before recording sales.</span>}
        </div>
      </form>

      {loading ? (
        <div>Loading sales...</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
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
      )}
    </div>
  );
}