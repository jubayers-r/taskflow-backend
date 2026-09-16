import { GenderEnum } from '@/prisma/generated/enums';
import z from 'zod';

const registerSchema = z.object({
  body: z
    .object({
      email: z.string().email('Invalid email address'),
      password: z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .max(128, 'Password must not exceed 128 characters')
        .regex(
          /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,128}$/,
          'Password requires uppercase, lowercase, number, and special character',
        ),
      firstName: z.string().min(1, 'First name is required'),
      lastName: z.string().min(1).optional(),
      gender: z.enum(GenderEnum),
      profileImage: z.string().optional(),
      agencyId: z.string().optional(),
      isAgreeWithTerms: z.boolean('You must agree with the terms and conditions'),
    })
    .strict(),
});

const loginSchema = z.object({
  body: z
    .object({
      email: z.string().email('Invalid email address'),
      password: z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .max(128, 'Password must not exceed 128 characters')
        .regex(
          /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,128}$/,
          'Password requires uppercase, lowercase, number, and special character',
        ),
      rememberMe: z.boolean().optional(),
      fcmToken: z.string().optional(),
    })
    .strict(),
});

export const AuthSchema = {
  registerSchema,
  loginSchema,
};

export type AuthInputType = {
  registerPayload: z.infer<typeof registerSchema>['body'];
  loginPayload: z.infer<typeof loginSchema>['body'];
};
