// auth.serializer.ts
// Output shaping. Whitelists exactly what the API exposes for auth-related
// user payloads — never trust a raw Prisma row/UsersService result to be safe
// to send to the client.

const serializeAuthUser = (user: {
  id: string;
  email: string;
  role: string;
  agencyId: string | null;
}) => ({
  id: user.id,
  email: user.email,
  role: user.role,
  agencyId: user.agencyId,
});

const serializeCurrentUser = (user: {
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

export const AuthSerializer = {
  authUser: serializeAuthUser,
  currentUser: serializeCurrentUser,
};
