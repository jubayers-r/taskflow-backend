import { env } from '@/config';
import { OtpEmailTemplate } from '@/emails/OtpTemplate';
import { redis } from '@/lib/redis';
import { render } from '@react-email/components';
import { Job, Worker } from 'bullmq';
import React from 'react';
import { Resend } from 'resend';

const resend = new Resend(env.RESEND_API_KEY);
const from = env.EMAIL_FROM;

interface OtpEmailJobPayload {
  email: string;
  code: string;
  purpose: 'VERIFY_EMAIL' | 'PASSWORD_RESET' | 'LOGIN';
}

// 1. Converts JSX to raw HTML string at runtime in ~1-2ms
const html = await render(React.createElement(OtpEmailTemplate, { code: '123456' }));

export const emailWorker = new Worker<OtpEmailJobPayload>(
  'email-queue',
  async (job: Job<OtpEmailJobPayload>) => {
    const { email, code, purpose } = job.data;

    const subjectMap = {
      VERIFY_EMAIL: 'Verify your email address',
      PASSWORD_RESET: 'Reset your account password',
      LOGIN: 'Your login verification code',
    };

    await resend.emails.send({
      from,
      to: email,
      subject: subjectMap[purpose],
      html,
    });
  },
  { connection: redis, concurrency: 5 },
);
