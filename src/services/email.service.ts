import { env } from '@/config';
import { OtpEmailTemplate } from '@/emails/OtpTemplate';
import { PasswordResetEmailTemplate } from '@/emails/PasswordResetTemplate';
import { render } from '@react-email/components';
import nodemailer from 'nodemailer';
import React from 'react';
import { Resend } from 'resend';

import type { EmailJob, OtpEmailPayload } from '@/lib/queue';

const EMAIL_FROM = `"${env.PROJECT_NAME}" <${env.EMAIL_FROM}>`;

// Lazy-create the mail provider once at boot based on EMAIL_PROVIDER.
const gmailTransporter =
  env.EMAIL_PROVIDER === 'gmail'
    ? nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: env.EMAIL_FROM,
          pass: env.GMAIL_APP_PASSWORD!,
        },
      })
    : null;

const resendClient = env.EMAIL_PROVIDER === 'resend' ? new Resend(env.RESEND_API_KEY!) : null;

interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
}

const send = async ({ to, subject, html }: SendEmailArgs): Promise<void> => {
  if (env.EMAIL_PROVIDER === 'resend') {
    if (!resendClient) throw new Error('Resend client is not configured');
    const { error } = await resendClient.emails.send({ from: EMAIL_FROM, to, subject, html });
    if (error) throw new Error(`Resend delivery failed: ${error.message}`);
    return;
  }

  if (!gmailTransporter) throw new Error('Gmail transporter is not configured');
  await gmailTransporter.sendMail({ from: EMAIL_FROM, to, subject, html });
};

const OTP_SUBJECTS: Record<OtpEmailPayload['purpose'], string> = {
  VERIFY_EMAIL: 'Verify your email address',
  PASSWORD_RESET: 'Reset your account password',
  LOGIN: 'Your login verification code',
};

export const processEmailJob = async (job: EmailJob): Promise<void> => {
  switch (job.name) {
    case 'send-otp': {
      const { email, code, purpose } = job.data;
      const html = await render(React.createElement(OtpEmailTemplate, { code }));
      await send({ to: email, subject: OTP_SUBJECTS[purpose], html });
      return;
    }

    case 'send-password-reset': {
      const { email, resetToken } = job.data;
      const html = await render(React.createElement(PasswordResetEmailTemplate, { resetToken }));
      await send({ to: email, subject: 'Reset your account password', html });
      return;
    }
  }
};
