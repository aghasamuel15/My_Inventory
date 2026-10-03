import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "../../../../lib/supabaseServer";
import PrintButton from "./PrintButton";

function naira(n) {
  return `₦${Number(n || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

export default async function InvoiceDetailPage({ params }) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: invoice } = await supabase
    .from("invoices")
    .select("*, customers(name, phone, email)")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (!invoice) notFound();

  const { data: items } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", invoice.id);

  const { data: profile } = await supabase
    .from("profiles")
    .select("business_name")
    .eq("id", user.id)
    .single();

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex justify-end mb-4 print:hidden">
        <PrintButton />
      </div>

      <div className="card" id="invoice-print">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-2xl font-bold">{profile?.business_name || "My Business"}</h1>
            <p className="text-gray-500 text-sm">Invoice #{invoice.invoice_number}</p>
          </div>
          <span className="px-3 py-1 rounded-full text-xs capitalize bg-brand-50 text-brand-700">{invoice.status}</span>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mb-8 text-sm">
          <div>
            <div className="text-gray-500 mb-1">Billed to</div>
            <div className="font-medium">{invoice.customers?.name || "—"}</div>
            <div className="text-gray-500">{invoice.customers?.phone || "—"}</div>
            <div className="text-gray-500">{invoice.customers?.email || "—"}</div>
          </div>
          <div className="sm:text-right">
            <div><span className="text-gray-500">Issue date:</span> {invoice.issue_date}</div>
            <div><span className="text-gray-500">Due date:</span> {invoice.due_date || "—"}</div>
          </div>
        </div>

        <table className="w-full text-sm mb-6">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="py-2">Description</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Unit price</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(items || []).map((it) => (
              <tr key={it.id} className="border-b last:border-0">
                <td className="py-2">{it.description}</td>
                <td className="text-right">{it.quantity}</td>
                <td className="text-right">{naira(it.unit_price)}</td>
                <td className="text-right">{naira(it.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end">
          <div className="w-56 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{naira(invoice.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Tax</span><span>{naira(invoice.tax)}</span></div>
            <div className="flex justify-between font-bold text-base border-t pt-2"><span>Total</span><span>{naira(invoice.total)}</span></div>
          </div>
        </div>

        {invoice.notes && (
          <div className="mt-8 text-sm text-gray-600">
            <div className="text-gray-500 mb-1">Notes</div>
            {invoice.notes}
          </div>
        )}
      </div>
    </div>
  );
}