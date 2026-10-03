'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../../lib/supabaseClient';

const formatNaira = (value) => `₦${Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

const emptyProduct = {
  name: '', sku: '', unit: 'unit', cost_price: '', selling_price: '', low_stock_threshold: '5', opening_stock: '0',
};

export default function InventoryPage() {
  const supabase = createClient();
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [form, setForm] = useState(emptyProduct);
  const [adjustment, setAdjustment] = useState({ product_id: '', action: 'add', quantity: '', reason: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const [{ data: productData }, { data: movementData }] = await Promise.all([
      supabase.from('inventory_products').select('*').eq('user_id', user.id).eq('is_active', true).order('name'),
      supabase.from('inventory_movements').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(40),
    ]);
    setProducts(productData || []);
    setMovements(movementData || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(event) {
    event.preventDefault();
    setSaving(true);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      setSaving(false);
      alert('Your session has expired. Please sign in again before adding inventory.');
      return;
    }

    const { data: product, error } = await supabase.from('inventory_products').insert({
      user_id: user.id,
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      unit: form.unit.trim() || 'unit',
      cost_price: Number(form.cost_price || 0),
      selling_price: Number(form.selling_price || 0),
      quantity: 0,
      low_stock_threshold: Number(form.low_stock_threshold || 0),
    }).select().single();

    if (error) {
      setSaving(false);
      alert(error.message);
      return;
    }

    if (Number(form.opening_stock) > 0) {
      const { error: stockError } = await supabase.rpc('adjust_inventory', {
        p_product_id: product.id,
        p_quantity_change: Number(form.opening_stock),
        p_reason: 'Opening stock',
      });
      if (stockError) alert(`Product created, but opening stock was not recorded: ${stockError.message}`);
    }

    setForm(emptyProduct);
    setSaving(false);
    await load();
  }

  async function handleAdjustment(event) {
    event.preventDefault();
    const quantity = Number(adjustment.quantity);
    if (!adjustment.product_id || !quantity || quantity <= 0) return;
    setSaving(true);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      setSaving(false);
      alert('Your session has expired. Please sign in again before adjusting stock.');
      return;
    }

    const { error } = await supabase.rpc('adjust_inventory', {
      p_product_id: adjustment.product_id,
      p_quantity_change: adjustment.action === 'remove' ? -quantity : quantity,
      p_reason: adjustment.reason.trim() || (adjustment.action === 'remove' ? 'Manual stock removal' : 'Restock'),
    });

    setSaving(false);
    if (error) {
      alert(error.message);
      return;
    }
    setAdjustment({ product_id: '', action: 'add', quantity: '', reason: '' });
    await load();
  }

  async function handleArchive(product) {
    if (!confirm(`Stop tracking ${product.name}? Its past sales and stock history will remain.`)) return;
    const { error } = await supabase.from('inventory_products').update({ is_active: false }).eq('id', product.id);
    if (error) alert(error.message);
    else await load();
  }

  const lowStockCount = products.filter((product) => Number(product.quantity) <= Number(product.low_stock_threshold)).length;
  const productName = (productId) => products.find((product) => product.id === productId)?.name || 'Archived product';

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory</h1>
          <p className="mt-1 text-sm text-slate-500">Stock levels update automatically when you record a sale.</p>
        </div>
        <div className={`text-sm font-semibold ${lowStockCount ? 'text-amber-700' : 'text-emerald-700'}`}>
          {lowStockCount ? `${lowStockCount} item${lowStockCount === 1 ? '' : 's'} at or below reorder level` : 'Stock levels healthy'}
        </div>
      </div>

      <form onSubmit={handleCreate} className="card mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <h2 className="text-lg font-bold text-slate-900 sm:col-span-2 xl:col-span-4">Add product</h2>
        <div><label className="label">Product name</label><input className="input" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
        <div><label className="label">SKU / code</label><input className="input" value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} /></div>
        <div><label className="label">Unit</label><input className="input" placeholder="unit, kg, pack" value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} /></div>
        <div><label className="label">Opening stock</label><input className="input" type="number" min="0" step="0.01" required value={form.opening_stock} onChange={(event) => setForm({ ...form, opening_stock: event.target.value })} /></div>
        <div><label className="label">Cost price per unit</label><input className="input" type="number" min="0" step="0.01" required value={form.cost_price} onChange={(event) => setForm({ ...form, cost_price: event.target.value })} /></div>
        <div><label className="label">Selling price per unit</label><input className="input" type="number" min="0" step="0.01" required value={form.selling_price} onChange={(event) => setForm({ ...form, selling_price: event.target.value })} /></div>
        <div><label className="label">Low-stock alert at</label><input className="input" type="number" min="0" step="0.01" required value={form.low_stock_threshold} onChange={(event) => setForm({ ...form, low_stock_threshold: event.target.value })} /></div>
        <div className="flex items-end"><button type="submit" disabled={saving} className="btn-primary w-full">{saving ? 'Saving...' : 'Add product'}</button></div>
      </form>

      <form onSubmit={handleAdjustment} className="card mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <h2 className="text-lg font-bold text-slate-900 sm:col-span-2 xl:col-span-5">Add or remove stock</h2>
        <div>
          <label className="label">Product</label>
          <select className="input" required value={adjustment.product_id} onChange={(event) => setAdjustment({ ...adjustment, product_id: event.target.value })}>
            <option value="">Select product</option>
            {products.map((product) => <option key={product.id} value={product.id}>{product.name} ({product.quantity} {product.unit})</option>)}
          </select>
        </div>
        <div>
          <label className="label">Action</label>
          <select className="input" value={adjustment.action} onChange={(event) => setAdjustment({ ...adjustment, action: event.target.value })}>
            <option value="add">Add stock</option><option value="remove">Remove stock</option>
          </select>
        </div>
        <div><label className="label">Quantity</label><input className="input" type="number" min="0.01" step="0.01" required value={adjustment.quantity} onChange={(event) => setAdjustment({ ...adjustment, quantity: event.target.value })} /></div>
        <div><label className="label">Reason</label><input className="input" placeholder="Restock, damaged, correction" value={adjustment.reason} onChange={(event) => setAdjustment({ ...adjustment, reason: event.target.value })} /></div>
        <div className="flex items-end"><button type="submit" disabled={saving || !products.length} className="btn-secondary w-full">{saving ? 'Saving...' : 'Update stock'}</button></div>
      </form>

      {loading ? <div>Loading inventory...</div> : (
        <>
          <div className="card mb-6 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b text-slate-500"><th className="py-2">Product</th><th>SKU</th><th>Unit</th><th className="text-right">In stock</th><th className="text-right">Cost</th><th className="text-right">Price</th><th className="text-right">Margin</th><th /></tr></thead>
              <tbody>
                {products.map((product) => {
                  const low = Number(product.quantity) <= Number(product.low_stock_threshold);
                  return (
                    <tr key={product.id} className="border-b last:border-none">
                      <td className="py-3 font-medium">{product.name}{low && <span className="ml-2 text-xs font-semibold text-amber-700">Low stock</span>}</td>
                      <td>{product.sku || '—'}</td><td>{product.unit}</td>
                      <td className={`text-right font-semibold ${low ? 'text-amber-700' : ''}`}>{product.quantity}</td>
                      <td className="text-right">{formatNaira(product.cost_price)}</td>
                      <td className="text-right">{formatNaira(product.selling_price)}</td>
                      <td className="text-right text-emerald-700">{formatNaira(Number(product.selling_price) - Number(product.cost_price))}</td>
                      <td className="text-right"><button type="button" disabled={Number(product.quantity) > 0} title={Number(product.quantity) > 0 ? 'Remove remaining stock before archiving' : 'Archive product'} onClick={() => handleArchive(product)} className="text-xs font-semibold text-slate-500 enabled:hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40">Archive</button></td>
                    </tr>
                  );
                })}
                {products.length === 0 && <tr><td colSpan="8" className="py-8 text-center text-slate-400">No products yet. Add your first item above.</td></tr>}
              </tbody>
            </table>
          </div>

          <section className="card overflow-x-auto">
            <h2 className="mb-3 text-lg font-bold text-slate-900">Recent stock movements</h2>
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b text-slate-500"><th className="py-2">When</th><th>Product</th><th>Reason</th><th className="text-right">Change</th></tr></thead>
              <tbody>
                {movements.map((movement) => (
                  <tr key={movement.id} className="border-b last:border-none">
                    <td className="py-2">{new Date(movement.created_at).toLocaleString()}</td>
                    <td>{productName(movement.product_id)}</td><td>{movement.reason}</td>
                    <td className={`text-right font-semibold ${Number(movement.quantity_change) > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {Number(movement.quantity_change) > 0 ? '+' : ''}{movement.quantity_change}
                    </td>
                  </tr>
                ))}
                {movements.length === 0 && <tr><td colSpan="4" className="py-6 text-center text-slate-400">Stock changes will appear here.</td></tr>}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}