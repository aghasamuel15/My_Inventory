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

export async function POST(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'The invitation request must contain valid JSON.' }, { status: 400 });
    }
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const role = body.role;
    if (!email || !['manager', 'staff', 'viewer'].includes(role)) {
      return NextResponse.json({ error: 'Enter an email address and choose Manager, Staff, or Viewer. Admin access cannot be granted by invitation.' }, { status: 400 });
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

    const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!configuredSiteUrl) {
      return NextResponse.json({ error: 'Email invitations require NEXT_PUBLIC_SITE_URL to be configured.' }, { status: 503 });
    }

    let baseUrl;
    try {
      baseUrl = new URL(configuredSiteUrl);
    } catch {
      return NextResponse.json({ error: 'NEXT_PUBLIC_SITE_URL must be a valid URL.' }, { status: 503 });
    }
    if (baseUrl.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Invitation links require an HTTPS NEXT_PUBLIC_SITE_URL.' }, { status: 503 });
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
    const signupUrl = new URL('/signup', baseUrl);
    signupUrl.searchParams.set('email', email);
    const loginUrl = new URL('/login', baseUrl);
    loginUrl.searchParams.set('email', email);
    const recipientName = escapeHtml(email);
    const businessName = escapeHtml(business.name);
    const roleName = escapeHtml(role[0].toUpperCase() + role.slice(1));
    const action = isPending ? 'View invitation and create account' : 'View invitation and sign in';
    const greeting = isPending
      ? `You have been invited to join ${businessName} on SME Tracker as a ${roleName}.`
      : `You have been added to ${businessName} on SME Tracker as a ${roleName}.`;

    try {
      await transporter.sendMail({
        from: invoiceEmailFrom(),
        to: email,
        subject: 'Invitation to join a business on SME Tracker',
        html: `<div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.6"><h2>You're invited to SME Tracker</h2><p>Hello ${recipientName},</p><p>${greeting}</p><p><a href="${escapeHtml(invitationUrl.toString())}" style="display:inline-block;padding:12px 20px;background:#158765;color:#fff;text-decoration:none;border-radius:8px">${action}</a></p><p>If the button does not work, open this link:</p><p><a href="${escapeHtml(invitationUrl.toString())}">${escapeHtml(invitationUrl.toString())}</a></p><p>Use the invited email address to create an account or sign in. You can also use these direct links:</p><p><a href="${escapeHtml(signupUrl.toString())}">Create an account</a> · <a href="${escapeHtml(loginUrl.toString())}">Sign in</a></p><p>If you were not expecting this invitation, you can ignore this email.</p></div>`,
        text: `Hello ${email},\n\n${greeting}\n\nOpen your invitation: ${invitationUrl}\n\nCreate an account: ${signupUrl}\nSign in: ${loginUrl}\n\nUse the invited email address so the business can match your account to its invitation. If you were not expecting this invitation, you can ignore this email.`,
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
