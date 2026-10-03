export const ACCESS_PAYMENT_PURPOSE = 'sme_tracker_access';

export function getAccessFeeKobo() {
  const amount = Number(process.env.ACCESS_FEE_KOBO || 500000);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error('The configured access fee must be a positive whole number of kobo.');
  }
  return amount;
}

export async function activateAccessPayment(supabase, transaction) {
  const amountKobo = getAccessFeeKobo();
  const metadata = transaction?.metadata;
  const userId = metadata?.user_id;
  const reference = transaction?.reference;

  if (
    transaction?.status !== 'success'
    || transaction.currency !== 'NGN'
    || !Number.isSafeInteger(transaction.amount)
    || transaction.amount !== amountKobo
    || metadata?.purpose !== ACCESS_PAYMENT_PURPOSE
    || typeof userId !== 'string'
    || typeof reference !== 'string'
  ) {
    throw new Error('Payment details could not be validated.');
  }

  const { data: payment, error: paymentError } = await supabase
    .from('access_payments')
    .select('id, user_id, amount, status')
    .eq('reference', reference)
    .eq('user_id', userId)
    .maybeSingle();
  if (paymentError) throw new Error(`Could not validate the access payment record: ${paymentError.message}`);
  if (
    !payment
    || !['pending', 'success'].includes(payment.status)
    || Math.round(Number(payment.amount) * 100) !== amountKobo
  ) {
    throw new Error('No matching pending access payment was found.');
  }

  const { data: updatedPayment, error: updatePaymentError } = await supabase
    .from('access_payments')
    .update({ status: 'success' })
    .eq('id', payment.id)
    .in('status', ['pending', 'success'])
    .select('id')
    .maybeSingle();
  if (updatePaymentError) throw new Error(`Could not record the verified access payment: ${updatePaymentError.message}`);
  if (!updatedPayment) throw new Error('The access payment is no longer eligible for activation.');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .update({ subscription_status: 'active' })
    .eq('id', userId)
    .select('id')
    .maybeSingle();
  if (profileError) throw new Error(`Payment was recorded, but account access could not be activated: ${profileError.message}`);
  if (!profile) throw new Error('Payment was recorded, but the account profile is missing.');

  return userId;
}
