'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '../../../lib/supabaseClient';
import { canWriteBusinessData, getBusinessContext } from '../../../lib/businessContext';

const accountTypes = [
  { value: 'asset', label: 'Asset' },
  { value: 'liability', label: 'Liability' },
  { value: 'equity', label: 'Equity' },
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
];

const initialLines = () => [
  { account_id: '', debit: '', credit: '' },
  { account_id: '', debit: '', credit: '' },
];

function localDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatNaira(value) {
  return `₦${Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
}

function accountBalance(account) {
  const balance = Number(account.balance || 0);
  return ['liability', 'equity', 'income'].includes(account.account_type) ? -balance : balance;
}

export default function AccountingPage() {
  const supabase = useMemo(() => createClient(), []);
  const [accounts, setAccounts] = useState([]);
  const [entries, setEntries] = useState([]);
  const [businessRole, setBusinessRole] = useState('');
  const [startDate, setStartDate] = useState(() => localDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [endDate, setEndDate] = useState(() => localDate(new Date()));
  const [activeTab, setActiveTab] = useState('profit-loss');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [entryDate, setEntryDate] = useState(() => localDate(new Date()));
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState(initialLines);
  const [newAccount, setNewAccount] = useState({ code: '', name: '', account_type: 'asset' });

  async function load() {
    setLoading(true);
    setError('');
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      setError(authError?.message || 'Sign in to view accounting reports.');
      setLoading(false);
      return;
    }

    let context;
    try {
      context = await getBusinessContext(supabase, user.id);
      setBusinessRole(context.role);
    } catch (contextError) {
      setError(contextError.message);
      setLoading(false);
      return;
    }

    const { error: initializeError } = await supabase.rpc('initialize_accounting_chart');
    if (initializeError) {
      setError(initializeError.message);
      setLoading(false);
      return;
    }

    const [balanceResult, accountResult, entryResult] = await Promise.all([
      supabase.rpc('get_accounting_balances', { p_start_date: startDate, p_end_date: endDate }),
      supabase.from('accounting_accounts').select('id, code, name, account_type, is_system, is_active').eq('user_id', context.business_id).eq('is_active', true).order('code'),
      supabase.from('accounting_journal_entries').select('id, entry_date, description, source_type').eq('user_id', context.business_id).order('entry_date', { ascending: false }).order('created_at', { ascending: false }).limit(50),
    ]);
    const failed = balanceResult.error || accountResult.error || entryResult.error;
    if (failed) {
      setError(failed.message || 'Could not load accounting data.');
      setLoading(false);
      return;
    }

    const balances = new Map((balanceResult.data || []).map((account) => [account.account_id, account]));
    setAccounts((accountResult.data || []).map((account) => ({
      ...account,
      ...(balances.get(account.id) || { balance: 0, period_debits: 0, period_credits: 0 }),
    })));
    setEntries(entryResult.data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  async function submitJournal(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    const journalLines = lines
      .filter((line) => line.account_id && (Number(line.debit) > 0 || Number(line.credit) > 0))
      .map((line) => ({
        account_id: line.account_id,
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0),
      }));
    const { error: journalError } = await supabase.rpc('create_accounting_journal', {
      p_entry_date: entryDate,
      p_description: description,
      p_lines: journalLines,
    });
    if (journalError) {
      setError(journalError.message);
      setSaving(false);
      return;
    }
    setDescription('');
    setLines(initialLines());
    setMessage('Journal entry posted.');
    await load();
    setSaving(false);
  }

  async function submitAccount(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    const { error: accountError } = await supabase.rpc('create_accounting_account', {
      p_code: newAccount.code,
      p_name: newAccount.name,
      p_account_type: newAccount.account_type,
    });
    if (accountError) {
      setError(accountError.message);
      setSaving(false);
      return;
    }
    setNewAccount({ code: '', name: '', account_type: 'asset' });
    setMessage('Account added to the chart.');
    await load();
    setSaving(false);
  }

  const periodAccounts = accounts.filter((account) => ['income', 'expense'].includes(account.account_type));
  const incomeAccounts = periodAccounts.filter((account) => account.account_type === 'income');
  const expenseAccounts = periodAccounts.filter((account) => account.account_type === 'expense');
  const incomeTotal = incomeAccounts.reduce((sum, account) => sum + Number(account.period_credits || 0) - Number(account.period_debits || 0), 0);
  const expenseTotal = expenseAccounts.reduce((sum, account) => sum + Number(account.period_debits || 0) - Number(account.period_credits || 0), 0);
  const netIncome = incomeTotal - expenseTotal;
  const assets = accounts.filter((account) => account.account_type === 'asset');
  const liabilities = accounts.filter((account) => account.account_type === 'liability');
  const equity = accounts.filter((account) => account.account_type === 'equity');
  const assetTotal = assets.reduce((sum, account) => sum + accountBalance(account), 0);
  const liabilityTotal = liabilities.reduce((sum, account) => sum + accountBalance(account), 0);
  const lifetimeNetIncome = accounts
    .filter((account) => ['income', 'expense'].includes(account.account_type))
    .reduce((sum, account) => sum - Number(account.balance || 0), 0);
  const equityTotal = equity.reduce((sum, account) => sum + accountBalance(account), 0) + lifetimeNetIncome;
  const cashAccounts = accounts.filter((account) => ['1000', '1010'].includes(account.code));
  const cashInflows = cashAccounts.reduce((sum, account) => sum + Number(account.period_debits || 0), 0);
  const cashOutflows = cashAccounts.reduce((sum, account) => sum + Number(account.period_credits || 0), 0);
  const cashChange = cashInflows - cashOutflows;
  const tabs = [
    { id: 'profit-loss', label: 'Profit & loss' },
    { id: 'balance-sheet', label: 'Balance sheet' },
    { id: 'cash-flow', label: 'Cash flow' },
    { id: 'journals', label: 'Chart & journals' },
  ];

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">Accounting · Accrual basis</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Accounting tools</h1>
        <p className="mt-1 text-sm text-slate-600">Financial statements and a balanced journal ledger. Sales and invoices post when dated; recorded expenses post on their expense date.</p>
        <p className="mt-1 text-xs text-slate-500">Invoice tax entered in your records posts to VAT payable. Confirm opening balances before relying on the balance sheet.</p>
      </div>

      <section className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
          Period from
          <input className="input" type="date" value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
          Period to
          <input className="input" type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} />
        </label>
        <button type="button" className="btn-secondary" onClick={load} disabled={loading}>{loading ? 'Updating...' : 'Refresh reports'}</button>
      </section>

      <div role="tablist" aria-label="Accounting reports" className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`accounting-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`accounting-panel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`${activeTab === tab.id ? 'btn-primary' : 'btn-secondary'} shrink-0 whitespace-nowrap`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {loading ? <p role="status" className="py-10 text-center text-sm text-slate-500">Loading accounting reports...</p> : (
        <>
          {activeTab === 'profit-loss' && (
            <section id="accounting-panel-profit-loss" role="tabpanel" aria-labelledby="accounting-tab-profit-loss" className="grid gap-5 lg:grid-cols-2">
              <StatementSection title="Income" accounts={incomeAccounts} amount={incomeTotal} />
              <StatementSection title="Expenses" accounts={expenseAccounts} amount={expenseTotal} />
              <div className="rounded-2xl bg-brand-900 p-5 text-white lg:col-span-2">
                <p className="text-sm text-white/75">Net income · {startDate} to {endDate}</p>
                <p className="mt-1 text-3xl font-bold">{formatNaira(netIncome)}</p>
              </div>
            </section>
          )}

          {activeTab === 'balance-sheet' && (
            <section id="accounting-panel-balance-sheet" role="tabpanel" aria-labelledby="accounting-tab-balance-sheet" className="space-y-5">
              <p className="text-sm text-slate-600">Balances as of {endDate}. Current and prior income is included in retained earnings.</p>
              <StatementSection title="Assets" accounts={assets} amount={assetTotal} />
              <StatementSection title="Liabilities" accounts={liabilities} amount={liabilityTotal} />
              <StatementSection title="Equity" accounts={equity} amount={equityTotal} extraRow={{ name: 'Retained earnings', amount: lifetimeNetIncome }} />
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex justify-between gap-4 text-sm font-bold text-slate-900">
                  <span>Liabilities and equity</span><span>{formatNaira(liabilityTotal + equityTotal)}</span>
                </div>
                <p className={`mt-2 text-sm ${Math.abs(assetTotal - liabilityTotal - equityTotal) < 0.01 ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {Math.abs(assetTotal - liabilityTotal - equityTotal) < 0.01
                    ? 'The balance sheet is balanced.'
                    : `Difference: ${formatNaira(assetTotal - liabilityTotal - equityTotal)}. Enter any opening balances or missing transactions as a journal entry.`}
                </p>
              </div>
            </section>
          )}

          {activeTab === 'cash-flow' && (
            <section id="accounting-panel-cash-flow" role="tabpanel" aria-labelledby="accounting-tab-cash-flow" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">Cash movement</h2>
              <p className="mt-1 text-sm text-slate-600">{startDate} to {endDate}</p>
              <div className="mt-5 space-y-3">
                <AmountRow label="Cash and bank received" amount={cashInflows} />
                <AmountRow label="Cash and bank paid" amount={-cashOutflows} />
                <AmountRow label="Net change in cash and bank" amount={cashChange} strong />
              </div>
              <p className="mt-4 text-xs text-slate-500">This direct-method report uses transactions categorized to cash or bank. Unassigned receipts are excluded.</p>
            </section>
          )}

          {activeTab === 'journals' && (
            <section id="accounting-panel-journals" role="tabpanel" aria-labelledby="accounting-tab-journals" className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-bold text-slate-900">Chart of accounts</h2>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2">Code</th><th>Name</th><th>Type</th><th className="text-right">Balance</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {accounts.map((account) => (
                        <tr key={account.id}>
                          <td className="py-2 font-mono text-slate-600">{account.code}</td>
                          <td className="font-medium text-slate-800">{account.name}{account.is_system && <span className="ml-2 text-[10px] text-slate-400">SYSTEM</span>}</td>
                          <td className="capitalize text-slate-600">{account.account_type}</td>
                          <td className="text-right tabular-nums">{formatNaira(accountBalance(account))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {canWriteBusinessData(businessRole) && (
                  <form onSubmit={submitAccount} className="mt-5 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[0.7fr_1.5fr_1fr_auto]">
                    <input className="input" aria-label="Account code" placeholder="Code" required value={newAccount.code} onChange={(event) => setNewAccount({ ...newAccount, code: event.target.value })} />
                    <input className="input" aria-label="Account name" placeholder="Account name" required value={newAccount.name} onChange={(event) => setNewAccount({ ...newAccount, name: event.target.value })} />
                    <select className="input" aria-label="Account type" value={newAccount.account_type} onChange={(event) => setNewAccount({ ...newAccount, account_type: event.target.value })}>
                      {accountTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                    </select>
                    <button className="btn-secondary" disabled={saving}>Add account</button>
                  </form>
                )}
              </div>

              {canWriteBusinessData(businessRole) && (
                <form onSubmit={submitJournal} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-bold text-slate-900">Post a journal entry</h2>
                  <p className="mt-1 text-sm text-slate-600">Debits must equal credits. Use journal entries for opening balances and adjustments; post a reversing entry to correct a posted journal.</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">Date<input className="input" type="date" required value={entryDate} onChange={(event) => setEntryDate(event.target.value)} /></label>
                    <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">Description<input className="input" required value={description} onChange={(event) => setDescription(event.target.value)} /></label>
                  </div>
                  <div className="mt-4 space-y-3">
                    {lines.map((line, index) => (
                      <div key={index} className="grid gap-2 sm:grid-cols-[1.5fr_1fr_1fr]">
                        <select className="input" aria-label={`Line ${index + 1} account`} required value={line.account_id} onChange={(event) => setLines((current) => current.map((item, lineIndex) => lineIndex === index ? { ...item, account_id: event.target.value } : item))}>
                          <option value="">Choose account</option>
                          {accounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}
                        </select>
                        <input className="input" aria-label={`Line ${index + 1} debit`} type="number" min="0" step="0.01" placeholder="Debit (₦)" value={line.debit} onChange={(event) => setLines((current) => current.map((item, lineIndex) => lineIndex === index ? { ...item, debit: event.target.value, credit: event.target.value ? '' : item.credit } : item))} />
                        <input className="input" aria-label={`Line ${index + 1} credit`} type="number" min="0" step="0.01" placeholder="Credit (₦)" value={line.credit} onChange={(event) => setLines((current) => current.map((item, lineIndex) => lineIndex === index ? { ...item, credit: event.target.value, debit: event.target.value ? '' : item.debit } : item))} />
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <button type="button" className="btn-secondary" onClick={() => setLines((current) => [...current, { account_id: '', debit: '', credit: '' }])}>Add line</button>
                    <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Posting...' : 'Post journal entry'}</button>
                  </div>
                </form>
              )}

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-bold text-slate-900">Recent journal entries</h2>
                {entries.length ? (
                  <ul className="mt-3 divide-y divide-slate-100">
                    {entries.map((entry) => <li key={entry.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span className="font-medium text-slate-800">{entry.description}</span><span className="text-slate-500">{entry.entry_date} · {entry.source_type === 'manual' ? 'Manual journal' : 'Automatically posted'}</span></li>)}
                  </ul>
                ) : <p className="mt-3 text-sm text-slate-500">No journal entries yet.</p>}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function StatementSection({ title, accounts: rows, amount, extraRow }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      <div className="mt-3 divide-y divide-slate-100">
        {rows.map((account) => {
          const value = account.account_type === 'income'
            ? Number(account.period_credits || 0) - Number(account.period_debits || 0)
            : account.account_type === 'expense'
              ? Number(account.period_debits || 0) - Number(account.period_credits || 0)
              : accountBalance(account);
          return <AmountRow key={account.id} label={`${account.code} · ${account.name}`} amount={value} />;
        })}
        {extraRow && <AmountRow label={extraRow.name} amount={extraRow.amount} />}
        <AmountRow label={`Total ${title.toLowerCase()}`} amount={amount} strong />
      </div>
    </section>
  );
}

function AmountRow({ label, amount, strong = false }) {
  return (
    <div className={`flex justify-between gap-4 py-2 text-sm ${strong ? 'font-bold text-slate-900' : 'text-slate-700'}`}>
      <span>{label}</span><span className="shrink-0 tabular-nums">{formatNaira(amount)}</span>
    </div>
  );
}
