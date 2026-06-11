export type JwtUser = {
  sub: string;
  role: 'USER' | 'ADMIN';
  displayName: string;
};
