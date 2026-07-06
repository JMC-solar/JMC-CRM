import nodemailer from "nodemailer";

// Email configuration - uses environment variables
// For Gmail: SMTP_HOST=smtp.gmail.com, SMTP_PORT=587, SMTP_USER=your@gmail.com, SMTP_PASS=app-password
// For other providers: configure accordingly
function getTransporter() {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = parseInt(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || "";

  if (!user || !pass) {
    console.warn("[Email] SMTP credentials not configured. Email sending will fail.");
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export async function sendPasswordResetEmail(
  toEmail: string,
  resetLink: string,
  userName: string
): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) {
    console.error("[Email] Cannot send email: SMTP not configured");
    return false;
  }

  const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@jmcsolar.com";

  try {
    await transporter.sendMail({
      from: `"JMC Solar CRM" <${fromEmail}>`,
      to: toEmail,
      subject: "Password Reset Request - JMC Solar CRM",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1e40af; margin: 0;">JMC Solar</h1>
            <p style="color: #64748b; margin: 5px 0 0;">Customer Relationship Management</p>
          </div>
          
          <div style="background: #f8fafc; border-radius: 8px; padding: 30px; border: 1px solid #e2e8f0;">
            <h2 style="color: #1e293b; margin-top: 0;">Password Reset Request</h2>
            <p style="color: #475569;">Hello <strong>${userName}</strong>,</p>
            <p style="color: #475569;">We received a request to reset your password for your JMC Solar CRM account. Click the button below to set a new password:</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetLink}" style="background: #2563eb; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">
                Reset Password
              </a>
            </div>
            
            <p style="color: #475569; font-size: 14px;">If the button doesn't work, copy and paste this link into your browser:</p>
            <p style="color: #2563eb; font-size: 13px; word-break: break-all;">${resetLink}</p>
            
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
            
            <p style="color: #94a3b8; font-size: 12px;">
              This link will expire in 1 hour. If you did not request this password reset, please ignore this email.
            </p>
          </div>
          
          <p style="color: #94a3b8; font-size: 12px; text-align: center; margin-top: 20px;">
            &copy; JMC Solar Energy Systems &mdash; All rights reserved
          </p>
        </div>
      `,
    });
    console.log(`[Email] Password reset email sent to ${toEmail}`);
    return true;
  } catch (error) {
    console.error("[Email] Failed to send password reset email:", error);
    return false;
  }
}

export async function send2FACodeEmail(
  toEmail: string,
  code: string,
  userName: string
): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) {
    console.error("[Email] Cannot send 2FA code: SMTP not configured");
    return false;
  }

  const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@jmcsolar.com";

  try {
    await transporter.sendMail({
      from: `"JMC Solar CRM" <${fromEmail}>`,
      to: toEmail,
      subject: "Your Login Verification Code - JMC Solar CRM",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1e40af; margin: 0;">JMC Solar</h1>
            <p style="color: #64748b; margin: 5px 0 0;">Customer Relationship Management</p>
          </div>
          
          <div style="background: #f8fafc; border-radius: 8px; padding: 30px; border: 1px solid #e2e8f0;">
            <h2 style="color: #1e293b; margin-top: 0;">Login Verification Code</h2>
            <p style="color: #475569;">Hello <strong>${userName}</strong>,</p>
            <p style="color: #475569;">Your verification code for logging into JMC Solar CRM is:</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <div style="background: #1e293b; color: #ffffff; padding: 20px 40px; border-radius: 8px; display: inline-block; letter-spacing: 8px; font-size: 32px; font-weight: bold; font-family: 'Courier New', monospace;">
                ${code}
              </div>
            </div>
            
            <p style="color: #475569; text-align: center;">This code will expire in <strong>5 minutes</strong>.</p>
            
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
            
            <p style="color: #94a3b8; font-size: 12px;">
              If you did not attempt to log in, please ignore this email and consider changing your password immediately.
            </p>
          </div>
          
          <p style="color: #94a3b8; font-size: 12px; text-align: center; margin-top: 20px;">
            &copy; JMC Solar Energy Systems &mdash; All rights reserved
          </p>
        </div>
      `,
    });
    console.log(`[Email] 2FA code sent to ${toEmail}`);
    return true;
  } catch (error) {
    console.error("[Email] Failed to send 2FA code email:", error);
    return false;
  }
}
