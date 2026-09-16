import { env } from '@/config';
import { OtpEmailTemplate } from '@/emails/OtpTemplate';
import { redis } from '@/lib/redis';
import { render } from '@react-email/components';
import { Job, Worker } from 'bullmq';
import nodemailer from 'nodemailer';
import React from 'react';

const from = `"Jubayer Shikder" <${env.EMAIL_FROM}>`;
//resend config
// const resend = new Resend(env.RESEND_API_KEY);

// Setup Gmail Transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: env.EMAIL_FROM, // e.g. notifications@myagency.com
    pass: process.env.GMAIL_APP_PASSWORD, // 16-character app password (not regular password)
  },
});

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
    const { email, purpose } = job.data;

    const subjectMap = {
      VERIFY_EMAIL: 'Verify your email address',
      PASSWORD_RESET: 'Reset your account password',
      LOGIN: 'Your login verification code',
    };

    //gmail
    await transporter.sendMail({
      from,
      to: email,
      subject: subjectMap[purpose],
      html,
    });

    //resend
    // await resend.emails.send({
    //   from,
    //   to: email,
    //   subject: subjectMap[purpose],
    //   html,
    // });
  },
  { connection: redis, concurrency: 5 },
);
