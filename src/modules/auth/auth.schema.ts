import { GenderEnum } from '@/prisma/generated/enums';
import { z } from 'zod';

const passwordComplexityRegex =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,128}$/;

const registerSchema = z
  .object({
    email: z.email('Email is required').trim().toLowerCase(),
    password: z
      .string('Password is required')
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password must not exceed 128 characters')
      .regex(
        passwordComplexityRegex,
        'Password requires uppercase, lowercase, number, and special character',
      ),
    firstName: z.string('First name is required').trim().min(1, 'First name cannot be empty'),
    lastName: z.string().trim().min(1, 'Last name cannot be empty').optional(),
    gender: z.enum(GenderEnum, 'Invalid gender value'),
    profileImage: z.url('Profile image must be a valid URL').optional(),
    agencyId: z.string().trim().min(1).optional(),
    isAgreeWithTerms: z.literal(true, 'You must agree with the terms and conditions'),
  })
  .strict();

const loginSchema = z
  .object({
    email: z.email('Email is required').trim().toLowerCase(),
    password: z.string('Password is required').min(1, 'Password is required'),
    rememberMe: z.boolean().default(false),
    fcmToken: z.string().trim().min(1).optional(),
  })
  .strict();

const verifyOtpSchema = z
  .object({
    email: z.email('Email is required').trim().toLowerCase(),
    code: z.string('Code is required').trim().min(1),
    purpose: z.enum(['VERIFY_EMAIL', 'PASSWORD_RESET', 'LOGIN']),
  })
  .strict();

const forgotPasswordSchema = z
  .object({
    email: z.email('Email is required').trim().toLowerCase(),
  })
  .strict();

const resetPasswordSchema = z
  .object({
    token: z.string('Token is required').trim(),
    newPassword: z
      .string('New password is required')
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password must not exceed 128 characters')
      .regex(
        passwordComplexityRegex,
        'Password requires uppercase, lowercase, number, and special character',
      ),
  })
  .strict();

const sessionIdParamSchema = z
  .object({
    id: z.uuid('Invalid session id'),
  })
  .strict();

export const AuthSchema = {
  registerSchema,
  loginSchema,
  verifyOtpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  sessionIdParamSchema,
};

export type AuthInputType = {
  registerPayload: z.infer<typeof registerSchema>;
  loginPayload: z.infer<typeof loginSchema>;
  verifyOtpPayload: z.infer<typeof verifyOtpSchema>;
  forgotPasswordPayload: z.infer<typeof forgotPasswordSchema>;
  resetPasswordPayload: z.infer<typeof resetPasswordSchema>;
  sessionIdParams: z.infer<typeof sessionIdParamSchema>;
};
