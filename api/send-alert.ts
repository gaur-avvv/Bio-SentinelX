import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

const resend = new Resend(process.env.RESEND_API_KEY);

// Initialize Supabase client for server-side operations
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

interface AlertPayload {
  userId: string;
  recipientEmail: string;
  subject: string;
  htmlContent: string;
  alertKey: string;
  severity: string;
  totalScore: number;
  city: string;
  eventDate: string;
  primaryFactor: string;
}

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const payload: AlertPayload = await req.json();
    
    const {
      userId,
      recipientEmail,
      subject,
      htmlContent,
      alertKey,
      severity,
      totalScore,
      city,
      eventDate,
      primaryFactor,
    } = payload;

    // Validate required fields
    if (!recipientEmail || !subject || !htmlContent || !alertKey) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check for duplicate alerts if Supabase is configured
    if (supabaseUrl && supabaseServiceKey && userId) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      // Check if this alert was already sent
      const { data: existingAlert } = await supabase
        .from('email_alert_logs')
        .select('id')
        .eq('user_id', userId)
        .eq('alert_key', alertKey)
        .single();

      if (existingAlert) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            message: 'Alert already sent',
            duplicate: true 
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Send email via Resend
    const { data, error } = await resend.emails.send({
      from: 'BioSentinel Alerts <alerts@resend.dev>',
      to: [recipientEmail],
      subject: subject,
      html: htmlContent,
    });

    if (error) {
      console.error('Resend error:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to send email', details: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Log the sent alert to Supabase if configured
    if (supabaseUrl && supabaseServiceKey && userId) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      await supabase.from('email_alert_logs').insert({
        user_id: userId,
        alert_key: alertKey,
        recipient_email: recipientEmail,
        severity: severity || 'unknown',
        total_score: totalScore || 0,
        city: city || 'unknown',
        event_date: eventDate || new Date().toISOString(),
        primary_factor: primaryFactor || 'unknown',
        email_subject: subject,
        status: 'sent',
        resend_message_id: data?.id || null,
      });
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageId: data?.id,
        message: 'Alert sent successfully' 
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Send alert error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
