/**
 * The user object attached to the request by the JWT strategy
 * and surfaced through the {@link CurrentUser} decorator.
 */
export interface AuthenticatedUser {
  userId: string;
  email: string;
}
