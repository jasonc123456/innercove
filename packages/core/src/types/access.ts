/**
 * The shared privacy/access axis every content-bearing record (diary
 * entries, memories) is tagged with. Deliberately a SEPARATE axis from a
 * memory's approval status or its `useEnabled`/`saved` flags (plan:
 * "Save and Use memories are independent", "Proposed memories are not
 * eligible for AI use") -- accessLevel answers "is this allowed to leave
 * the user's eyes at all", those other flags answer "given that it is
 * allowed, has the user actually turned AI use on for it".
 *
 * Ordered from MOST to LEAST restrictive. `mostRestrictiveAccess` is the
 * one shared primitive for the plan's "derived items inherit the most
 * restrictive source access" rule -- every place that computes a derived
 * item's access (a memory distilled from a diary entry + a message, a
 * future export, ...) must call this instead of re-deriving the ordering
 * locally, so the ordering can only ever be defined once.
 */
import { z } from "zod";

export const ACCESS_LEVELS = ["private", "ai_eligible"] as const;

export const AccessLevelSchema = z.enum(ACCESS_LEVELS);
export type AccessLevel = z.infer<typeof AccessLevelSchema>;

const RESTRICTIVENESS_RANK: Record<AccessLevel, number> = {
  private: 0,
  ai_eligible: 1,
};

/** The most restrictive (lowest-rank) level among `levels`. Throws on an
 * empty array -- a derived item always has at least one source; calling
 * this with zero sources is a caller bug, not a valid "unrestricted"
 * default. */
export function mostRestrictiveAccess(levels: readonly AccessLevel[]): AccessLevel {
  if (levels.length === 0) {
    throw new Error("mostRestrictiveAccess requires at least one source access level");
  }
  return levels.reduce((most, level) =>
    RESTRICTIVENESS_RANK[level] < RESTRICTIVENESS_RANK[most] ? level : most,
  );
}
