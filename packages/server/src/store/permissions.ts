import { and, eq } from "drizzle-orm";
import type { ProvenanceSourceRef, UserId } from "@innercove/core";
import { DatabaseError, type DatabaseLease } from "./db.js";
import { diaryEntries, memories, messages, messageContext, provenance } from "./schema.js";
import { owner, timestamp, tombstone } from "./repos/common.js";

type Kind = "diary_entry" | "memory" | "message";

/** One policy shared by AI read ports, explicit grants and provenance writes.
 * Resolves message sources through their actual context IDs; missing rows,
 * foreign ownership and cycles fail closed. No cached eligibility. */
export class PermissionPolicy {
  constructor(readonly lease: DatabaseLease, readonly userId: UserId) {}
  links(type: "diary_entry" | "memory", id: string) {
    return this.lease.orm.select().from(provenance).where(and(eq(provenance.userId, this.userId),
      eq(provenance.derivedType, type), eq(provenance.derivedId, id))).all();
  }
  eligible(type: Kind, id: string, path = new Set<string>()): boolean {
    const key = `${type}:${id}`;
    if (path.has(key)) return false;
    const next = new Set(path).add(key);
    if (type === "message") {
      if (!this.lease.orm.select({ id: messages.id }).from(messages).where(owner(messages, this.userId, id)).get()) return false;
      return this.lease.orm.select().from(messageContext).where(and(eq(messageContext.userId, this.userId), eq(messageContext.messageId, id))).all()
        .every(source => this.eligible(source.sourceType, source.sourceId, next));
    }
    const table = type === "diary_entry" ? diaryEntries : memories;
    const row = this.lease.orm.select().from(table).where(owner(table, this.userId, id)).get();
    if (!row || row.accessLevel !== "ai_eligible" || ("status" in row && row.status !== "approved")) return false;
    return this.sourcesEligible(this.links(type, id) as ProvenanceSourceRef[], next);
  }
  sourcesEligible(sources: ProvenanceSourceRef[], path = new Set<string>()) {
    return sources.every(source => source.sourceType === "manual" ? source.sourceId === null : this.eligible(source.sourceType, source.sourceId, path));
  }
  assertGrant(type: "diary_entry" | "memory", id: string) {
    // Ignore only the target's present access/status; every source must still
    // resolve, and an edge back to this target is a cycle, not consent.
    if (!this.sourcesEligible(this.links(type, id) as ProvenanceSourceRef[], new Set([`${type}:${id}`]))) {
      throw new DatabaseError("CONFLICT", "Source access must be restored before confirming this item");
    }
  }
}

/** Called in the repository's write transaction before deleting a source or
 * after revoking access/status. Traverse provenance AND message_context so
 * derived-from-reply items also follow D16. Changing accessLevel to private is
 * the durable invalidation flag; restoring a source never silently re-grants
 * its descendants. Existing PATCH accessLevel=ai_eligible is explicit consent. */
export function invalidateDependents(lease: DatabaseLease, userId: UserId, type: Kind, id: string) {
  const queue: { type: Kind; id: string }[] = [{ type, id }];
  const seen = new Set<string>();
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i]!;
    const key = `${node.type}:${node.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (node.type !== "memory") {
      const links = lease.orm.select().from(provenance).where(and(eq(provenance.userId, userId),
        eq(provenance.sourceType, node.type), eq(provenance.sourceId, node.id))).all();
      for (const link of links) {
        const table = link.derivedType === "diary_entry" ? diaryEntries : memories;
        const row = lease.orm.select().from(table).where(owner(table, userId, link.derivedId)).get();
        if (!row) continue;
        if (row.accessLevel !== "private") {
          lease.orm.update(table).set({ accessLevel: "private", updatedAt: timestamp() }).where(owner(table, userId, link.derivedId)).run();
          tombstone(lease, userId, link.derivedType, link.derivedId, "access_revoked");
        }
        queue.push({ type: link.derivedType, id: link.derivedId });
      }
    }
    if (node.type !== "message") {
      for (const context of lease.orm.select().from(messageContext).where(and(eq(messageContext.userId, userId),
        eq(messageContext.sourceType, node.type), eq(messageContext.sourceId, node.id))).all()) {
        queue.push({ type: "message", id: context.messageId });
      }
    }
  }
}
