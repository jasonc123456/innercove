import type { SessionGuard } from "../api/session.js";

/** For route tests that aren't about sign-in: every request counts as signed in. Never used by main.ts. */
export const signedIn: SessionGuard = { isValid: () => true };
