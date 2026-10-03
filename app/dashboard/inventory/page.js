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
  const [recentSalesByProduct, setRecentSalesByProduct] = useState({});
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

    const date30DaysAgo = new Date();
    date30DaysAgo.setDate(date30DaysAgo.getDate() - 30);
    const salesStartDate = date30DaysAgo.toLocaleDateString('en-CA');
    const [{ data: productData }, { data: movementData }, { data: salesData }] = await Promise.all([
      supabase.from('inventory_products').select('*').eq('user_id', user.id).eq('is_active', true).order('name'),
      supabase.from('inventory_movements').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(40),
      supabase.from('sales').select('product_id, quantity').eq('user_id', user.id).gte('sale_date', salesStartDate),
    ]);
    setProducts(productData || []);
    setMovements(movementData || []);
    setRecentSalesByProduct((salesData || []).reduce((totals, sale) => {
      if (sale.product_id) totals[sale.product_id] = (totals[sale.product_id] || 0) + Number(sale.quantity || 0);
      return totals;
    }, {}));
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
  const suggestedRestock = (product) => {
    const targetStock = Number(product.low_stock_threshold) + Number(recentSalesByProduct[product.id] || 0);
    return Math.max(0, Math.ceil((targetStock - Number(product.quantity)) * 100) / 100);
  };

  function useRestockSuggestion(product) {
    const quantity = suggestedRestock(product);
    if (!quantity) return;
    setAdjustment({ product_id: product.id, action: 'add', quantity: String(quantity), reason: 'Suggested restock' });
    document.getElementById('stock-adjustment-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

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

      <form id="stock-adjustment-form" onSubmit={handleAdjustment} className="card mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
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
          <div className="mb-6 hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:block">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead><tr className="border-b text-slate-500"><th className="py-2">Product</th><th>SKU</th><th>Unit</th><th className="text-right">In stock</th><th className="text-right">Cost</th><th className="text-right">Price</th><th className="text-right">Margin</th><th>Restock suggestion</th><th /></tr></thead>
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
                      <td>{suggestedRestock(product) > 0 ? <button type="button" onClick={() => useRestockSuggestion(product)} className="font-semibold text-amber-800 hover:underline">{suggestedRestock(product)} {product.unit} · Use</button> : '—'}</td>
                      <td className="text-right"><button type="button" disabled={Number(product.quantity) > 0} title={Number(product.quantity) > 0 ? 'Remove remaining stock before archiving' : 'Archive product'} onClick={() => handleArchive(product)} className="text-xs font-semibold text-slate-500 enabled:hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40">Archive</button></td>
                    </tr>
                  );
                })}
                {products.length === 0 && <tr><td colSpan="9" className="py-8 text-center text-slate-400">No products yet. Add your first item above.</td></tr>}
              </tbody>
            </table>
          </div>

          <section className="mb-6 space-y-3 md:hidden">
            {products.length === 0 ? (
              <div className="card text-center text-sm text-slate-500">No products yet. Add your first item above.</div>
            ) : products.map((product) => {
              const low = Number(product.quantity) <= Number(product.low_stock_threshold);
              return (
                <article key={product.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="break-words font-bold text-slate-900">{product.name}</h2>
                      <p className="mt-1 text-xs text-slate-500">{product.sku ? `SKU ${product.sku} · ` : ''}{product.unit}</p>
                    </div>
                    {low && <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">Low stock</span>}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-100 pt-3">
                    <div>
                      <div className="text-xs text-slate-500">In stock</div>
                      <div className={`mt-0.5 font-bold ${low ? 'text-amber-700' : 'text-slate-900'}`}>{product.quantity} {product.unit}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Selling price</div>
                      <div className="mt-0.5 font-semibold text-slate-900">{formatNaira(product.selling_price)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Cost price</div>
                      <div className="mt-0.5 text-slate-700">{formatNaira(product.cost_price)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Margin per unit</div>
                      <div className="mt-0.5 font-semibold text-emerald-700">{formatNaira(Number(product.selling_price) - Number(product.cost_price))}</div>
                    </div>
                  </div>
                  {suggestedRestock(product) > 0 && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2">
                      <p className="text-xs font-medium text-amber-900">Suggested restock: {suggestedRestock(product)} {product.unit}</p>
                      <button type="button" onClick={() => useRestockSuggestion(product)} className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-amber-900 shadow-sm">Use suggestion</button>
                    </div>
                  )}
                  <div className="mt-3 border-t border-slate-100 pt-3 text-right">
                    <button type="button" disabled={Number(product.quantity) > 0} title={Number(product.quantity) > 0 ? 'Remove remaining stock before archiving' : 'Archive product'} onClick={() => handleArchive(product)} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 enabled:hover:bg-red-50 enabled:hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40">Archive product</button>
                  </div>
                </article>
              );
            })}
          </section>

          <section className="mb-6 hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:block">
            <h2 className="mb-3 text-lg font-bold text-slate-900">Recent stock movements</h2>
            <table className="w-full min-w-[520px] text-left text-sm">
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

          <section className="space-y-3 md:hidden">
            <h2 className="px-1 text-lg font-bold text-slate-900">Recent stock movements</h2>
            {movements.length === 0 ? (
              <div className="card text-sm text-slate-500">Stock changes will appear here.</div>
            ) : movements.map((movement) => {
              const added = Number(movement.quantity_change) > 0;
              return (
                <article key={movement.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words font-semibold text-slate-900">{productName(movement.product_id)}</h3>
                      <p className="mt-1 break-words text-sm text-slate-600">{movement.reason}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-bold ${added ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                      {added ? '+' : ''}{movement.quantity_change}
                    </span>
                  </div>
                  <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
                    {new Date(movement.created_at).toLocaleString()}
                  </p>
                </article>
              );
            })}
          </section>
        </>
      )}
    </div>
  );
}