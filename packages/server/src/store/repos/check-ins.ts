import { checkInDay, treeStage, CheckInsResponseSchema, type SaveCheckInRequest, type UserId, type TreeStage } from "@innercove/core";
import { DatabaseError, type DatabaseLease } from "../db.js";

/** Daily snapshots are unique; the append-only mood history is never counted as leaves.
 * Immediate SQLite transactions serialize both connections and concurrent requests. */
export class CheckInRepository {
  constructor(readonly lease: DatabaseLease, readonly now: () => Date = () => new Date()) {}

  private reconcile(userId: UserId) {
    // Preserve repeated/historical moods. Rebuild one latest-color leaf per day,
    // including imported history, without deleting events or rebucketing their dates.
    this.lease.db.prepare(`INSERT INTO daily_check_ins(user_id,day,mood,time_zone,created_at,updated_at,last_sequence)
      SELECT user_id,day,mood,time_zone,first_at,recorded_at,sequence FROM (
        SELECT *, MIN(recorded_at) OVER (PARTITION BY user_id,day) first_at,
          ROW_NUMBER() OVER (PARTITION BY user_id,day ORDER BY sequence DESC) position
        FROM check_in_events WHERE user_id=?
      ) WHERE position=1
      ON CONFLICT(user_id,day) DO UPDATE SET mood=excluded.mood,time_zone=excluded.time_zone,
        updated_at=excluded.updated_at,last_sequence=excluded.last_sequence
      WHERE excluded.last_sequence>daily_check_ins.last_sequence`).run(userId);
  }
  private count(userId: UserId): number {
    return (this.lease.db.prepare("SELECT count(*) n FROM daily_check_ins WHERE user_id=?").get(userId) as { n: number }).n;
  }
  private initialize(userId: UserId) {
    // First use adopts existing progress, so historical stages aren't replayed.
    this.lease.db.prepare("INSERT INTO tree_progress(user_id,acknowledged_stage) VALUES (?,?) ON CONFLICT(user_id) DO NOTHING").run(userId, treeStage(this.count(userId)));
  }
  private response(userId: UserId, timeZone: string) {
    const days = this.lease.db.prepare(`SELECT day,mood,time_zone timeZone,created_at createdAt,updated_at updatedAt
      FROM daily_check_ins WHERE user_id=? ORDER BY day`).all(userId);
    const stage = treeStage(days.length);
    const { acknowledgedStage } = this.lease.db.prepare("SELECT acknowledged_stage acknowledgedStage FROM tree_progress WHERE user_id=?").get(userId) as { acknowledgedStage: number };
    return CheckInsResponseSchema.parse({ days, today: checkInDay(this.now(), timeZone), stage, acknowledgedStage, pendingStage: stage > acknowledgedStage ? stage : null });
  }
  list(userId: UserId, timeZone: string) {
    return this.lease.db.transaction(() => {
      this.reconcile(userId); this.initialize(userId);
      return this.response(userId, timeZone);
    }).immediate();
  }
  save(userId: UserId, input: SaveCheckInRequest) {
    return this.lease.db.transaction(() => {
      this.reconcile(userId); this.initialize(userId);
      const previous = this.lease.db.prepare("SELECT mood,time_zone timeZone FROM check_in_events WHERE user_id=? AND event_id=?").get(userId, input.eventId) as { mood: string; timeZone: string } | undefined;
      if (previous) {
        if (previous.mood !== input.mood || previous.timeZone !== input.timeZone) throw new DatabaseError("CONFLICT", "Check-in retry does not match");
      } else {
        const at = this.now();
        this.lease.db.prepare("INSERT INTO check_in_events(user_id,event_id,day,mood,time_zone,recorded_at) VALUES (?,?,?,?,?,?)").run(userId, input.eventId, checkInDay(at, input.timeZone), input.mood, input.timeZone, at.toISOString());
        this.reconcile(userId);
      }
      return this.response(userId, input.timeZone);
    }).immediate();
  }
  acknowledge(userId: UserId, stage: TreeStage, timeZone: string) {
    return this.lease.db.transaction(() => {
      this.reconcile(userId); this.initialize(userId);
      if (stage > treeStage(this.count(userId))) throw new DatabaseError("VALIDATION_ERROR", "Tree stage not reached");
      this.lease.db.prepare("UPDATE tree_progress SET acknowledged_stage=MAX(acknowledged_stage,?) WHERE user_id=?").run(stage, userId);
      return this.response(userId, timeZone);
    }).immediate();
  }
}
