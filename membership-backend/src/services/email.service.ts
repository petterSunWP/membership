import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendVerificationEmail(
  email: string,
  code: string
) {
  if (process.env.EMAIL_MODE === 'development') {
    console.log(`[DEV EMAIL] ${email} verification code: ${code}`);
    return;
  }
  const { data, error } = await resend.emails.send({
    from:
      process.env.EMAIL_FROM ||
      'Membership <onboarding@resend.dev>',

    to: email,

    subject: 'Your membership verification code',

    html: `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto;">
        <h2>Verify your membership</h2>

        <p>
          Thanks for joining our membership programme.
        </p>

        <p>Your verification code is:</p>

        <div style="
          font-size: 32px;
          font-weight: bold;
          letter-spacing: 8px;
          margin: 24px 0;
        ">
          ${code}
        </div>

        <p>
          This code will expire in 10 minutes.
        </p>

        <p>
          If you did not request this code, you can ignore this email.
        </p>
      </div>
    `,
  });

  if (error) {
    console.error('Resend email error:', error);

    throw new Error('EMAIL_SEND_FAILED');
  }

  return data;
}