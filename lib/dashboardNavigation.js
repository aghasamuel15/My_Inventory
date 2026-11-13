const dashboardNavigation = [
  { href: '/dashboard', label: 'Overview', description: 'A snapshot of your business activity.' },
  { href: '/dashboard/sales', label: 'Sales', description: 'Record sales and review transactions.', feature: 'sales' },
  { href: '/dashboard/inventory', label: 'Stock', description: 'Manage products and stock levels.', feature: 'inventory' },
  { href: '/dashboard/expenses', label: 'Expenses', description: 'Track business spending and receipts.', feature: 'expenses' },
  { href: '/dashboard/cashbook', label: 'Cashbook', description: 'Track cash and bank activity and reconcile balances.' },
  { href: '/dashboard/runway', label: 'Cash runway', description: 'See when cash may run short and what could change it.' },
  { href: '/dashboard/customers', label: 'Customers', description: 'Manage customer details and balances.', feature: 'customers' },
  { href: '/dashboard/invoices', label: 'Invoices', description: 'Create and manage invoices and quotes.', feature: 'invoices' },
  { href: '/dashboard/invoices/recurring', label: 'Recurring invoices', description: 'Manage invoice schedules and templates.', feature: 'invoices' },
  { href: '/dashboard/accounting', label: 'Accounting', description: 'Review financial statements, chart of accounts, and journals.' },
  { href: '/dashboard/reports', label: 'Reports', description: 'Review business performance and export data.', feature: 'reports' },
  { href: '/dashboard/settings', label: 'Settings', description: 'Manage your business profile, team, account and preferences.' },
];

export default dashboardNavigation;
