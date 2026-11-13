import { NextResponse } from 'next/server';
import { canManageBusiness, getBusinessContext } from '../../../../lib/businessContext';
import {
  createInvoiceEmailTransporter,
  invoiceEmailErrorMessage,
  invoiceEmailFrom,
} from '../../../../lib/invoiceEmail';
import { createServerSupabaseClient } from '../../../../lib/supabaseServer';

export const runtime = 'nodejs';

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function getInvitationBaseUrl() {
  const candidates = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
  ];

  for (const candidate of candidates) {
    if (!candidate?.trim()) continue;

    let url;
    try {
      const value = candidate.trim();
      url = new URL(value.includes('://') ? value : `https://${value}`);
    } catch {
      continue;
    }

    if (
      !['http:', 'https:'].includes(url.protocol)
      || url.username
      || url.password
      || /your[-.]vercel[-.]domain|your[-.]domain/i.test(url.hostname)
      || (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')
    ) {
      continue;
    }

    return new URL(url.origin);
  }

  throw new Error(
    'No valid app URL is configured for invitation links. Set NEXT_PUBLIC_SITE_URL to your deployed HTTPS app URL in Vercel, then redeploy.'
  );
}

export async function POST(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'The invitation request must contain valid JSON.' }, { status: 400 });
    }
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const role = body.role;
    if (!name || name.length > 120 || !email || !['manager', 'staff', 'viewer'].includes(role)) {
      return NextResponse.json({ error: 'Enter the teammate’s name and email address, and choose Manager, Staff, or Viewer. Admin access cannot be granted by invitation.' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: authError?.message || 'Please sign in again.' }, { status: 401 });
    }

    const { business_id: businessId, role: currentRole } = await getBusinessContext(supabase, user.id);
    if (!canManageBusiness(currentRole)) {
      return NextResponse.json({ error: 'Only the business Admin and managers can invite teammates.' }, { status: 403 });
    }

    let baseUrl;
    try {
      baseUrl = getInvitationBaseUrl();
    } catch (urlError) {
      return NextResponse.json({ error: urlError.message }, { status: 503 });
    }

    let transporter;
    try {
      transporter = createInvoiceEmailTransporter();
    } catch (emailError) {
      return NextResponse.json({ error: invoiceEmailErrorMessage(emailError) }, { status: 503 });
    }

    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('name')
      .eq('id', businessId)
      .single();
    if (businessError) throw new Error(`Could not load business details: ${businessError.message}`);

    const { data: invitationRows, error: inviteError } = await supabase.rpc('invite_business_member', {
      p_email: email,
      p_role: role,
      p_name: name,
    });
    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 400 });
    }

    const invitation = invitationRows?.[0];
    if (!invitation) {
      throw new Error('The invitation was not saved.');
    }

    const isPending = invitation.invitation_status === 'pending';
    const invitationUrl = new URL('/invite', baseUrl);
    invitationUrl.searchParams.set('email', email);
    invitationUrl.searchParams.set('mode', isPending ? 'signup' : 'login');
    const recipientName = escapeHtml(name);
    const businessName = escapeHtml(business.name);
    const roleName = escapeHtml(role[0].toUpperCase() + role.slice(1));
    const greeting = isPending
      ? `You have been invited to join ${businessName} on SME Tracker as a ${roleName}.`
      : `You have been added to ${businessName} on SME Tracker as a ${roleName}.`;

    try {
      await transporter.sendMail({
        from: invoiceEmailFrom(),
        to: email,
        subject: 'Invitation to join a business on SME Tracker',
        html: `<div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.6"><h2>Invitation to join SME Tracker</h2><p>Hello ${recipientName},</p><p>${greeting}</p><p>Your role: <strong>${roleName}</strong></p><p><a href="${escapeHtml(invitationUrl.toString())}" style="display:inline-block;padding:12px 20px;background:#158765;color:#fff;text-decoration:none;border-radius:8px">Review invitation</a></p><p>If the button does not work, copy and open this link:</p><p><a href="${escapeHtml(invitationUrl.toString())}">${escapeHtml(invitationUrl.toString())}</a></p><p>Use the invited email address to create an account or sign in. If you were not expecting this invitation, you can ignore this email.</p></div>`,
        text: `Hello ${name},\n\n${greeting}\nYour role: ${roleName}\n\nReview your invitation: ${invitationUrl}\n\nUse the invited email address to create an account or sign in. If you were not expecting this invitation, you can ignore this email.`,
      });
    } catch (emailError) {
      return NextResponse.json({
        invitationCreated: true,
        error: invoiceEmailErrorMessage(emailError),
      }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      invitationCreated: true,
      invitationStatus: invitation.invitation_status,
      message: `Invitation email sent to ${email}.`,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Could not send the team invitation.' }, { status: 500 });
  }
}
