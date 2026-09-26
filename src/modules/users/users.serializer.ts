// users.serializer.ts
// Output shaping for the users domain. The users module owns the shape of every
// user payload the API returns, so auth re-exports nothing and no caller has to
// trust that a raw Prisma row (or a service result) is safe to send.

/** Compact user shape for auth-adjacent payloads (token subject, listings). */
export const serializeUserSummary = (user: {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role: string;
  agencyId: string | null;
  profileImage?: string | null;
}) => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName ?? null,
  lastName: user.lastName ?? null,
  role: user.role,
  agencyId: user.agencyId,
  profileImage: user.profileImage ?? null,
});

/** Full self-service profile for the authenticated user. */
export const serializeCurrentUser = (user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string | null;
  role: string;
  agencyId: string | null;
  profileImage: string | null;
  emailVerifiedAt: Date | null;
  createdAt: Date;
}) => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  role: user.role,
  agencyId: user.agencyId,
  profileImage: user.profileImage,
  emailVerifiedAt: user.emailVerifiedAt,
  createdAt: user.createdAt,
});

export const UsersSerializer = {
  userSummary: serializeUserSummary,
  currentUser: serializeCurrentUser,
};
