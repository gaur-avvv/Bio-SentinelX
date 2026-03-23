import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

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
    const { recipientEmail } = await req.json();

    if (!recipientEmail) {
      return new Response(
        JSON.stringify({ error: 'Recipient email is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipientEmail)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const testHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>BioSentinel Test Email</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px;">BioSentinel Alerts</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 14px;">Space Weather Monitoring System</p>
        </div>
        
        <div style="background: white; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 25px;">
            <div style="display: inline-block; background: #10b981; color: white; padding: 8px 16px; border-radius: 20px; font-size: 14px; font-weight: 600;">
              Test Successful
            </div>
          </div>
          
          <h2 style="color: #1a1a2e; margin: 0 0 15px 0; font-size: 22px;">Email Configuration Working!</h2>
          
          <p style="color: #666; margin: 0 0 20px 0;">
            Congratulations! Your BioSentinel email alerts are properly configured. 
            You will now receive notifications when significant space weather events are detected.
          </p>
          
          <div style="background: #f0f9ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0;">
            <strong style="color: #1e40af;">What to expect:</strong>
            <ul style="color: #666; margin: 10px 0 0 0; padding-left: 20px;">
              <li>Alerts for geomagnetic storms (Kp index spikes)</li>
              <li>Solar flare warnings (X-class and M-class events)</li>
              <li>Solar wind speed anomalies</li>
              <li>Customizable severity thresholds</li>
            </ul>
          </div>
          
          <p style="color: #999; font-size: 12px; margin: 25px 0 0 0; text-align: center;">
            Sent at ${new Date().toLocaleString()} via BioSentinel Alert System
          </p>
        </div>
        
        <p style="color: #999; font-size: 11px; text-align: center; margin-top: 20px;">
          BioSentinel - Monitoring space weather for human health and safety
        </p>
      </body>
      </html>
    `;

    const { data, error } = await resend.emails.send({
      from: 'BioSentinel Alerts <alerts@resend.dev>',
      to: [recipientEmail],
      subject: 'BioSentinel Email Test - Configuration Successful',
      html: testHtml,
    });

    if (error) {
      console.error('Resend test email error:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to send test email', details: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageId: data?.id,
        message: 'Test email sent successfully' 
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Test email error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
