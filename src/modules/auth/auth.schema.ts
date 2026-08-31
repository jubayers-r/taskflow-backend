import z from 'zod';

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
  loginSchema,
};

export type AuthInputType = {
  loginPayload: z.infer<typeof loginSchema>['body'];
};
