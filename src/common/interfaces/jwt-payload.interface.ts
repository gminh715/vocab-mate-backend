/**
 * Shape of the data we sign into the JWT and receive back when it is verified.
 */
export interface JwtPayload {
  /** Subject — the user's id. */
  sub: string;
  /** The user's email. */
  email: string;
}
