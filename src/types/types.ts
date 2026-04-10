export type AuthBody = {
  identifier?: string;
  userName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  role?: string;
};

export type AuthTokenPayload = {
  sub: string;
  userName: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
};
