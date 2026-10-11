import { eq } from "drizzle-orm";
import { UserSettingsRecordSchema, UserSettingsUpdateInputSchema, type UserId, type UserSettingsUpdateInput } from "@innercove/core";
import type { DatabaseLease } from "../db.js";
import { settings } from "../schema.js";
import { requireRow, timestamp } from "./common.js";

export class SettingsRepository {
  constructor(readonly lease: DatabaseLease) {}
  get(userId: UserId) {
    return UserSettingsRecordSchema.parse(requireRow(this.lease.orm.select().from(settings).where(eq(settings.userId, userId)).get()));
  }
  update(userId: UserId, input: UserSettingsUpdateInput) {
    const data = UserSettingsUpdateInputSchema.parse(input);
    return this.lease.db.transaction(() => {
      this.get(userId);
      if (Object.keys(data).length) this.lease.orm.update(settings).set({ ...data, updatedAt: timestamp() }).where(eq(settings.userId, userId)).run();
      return this.get(userId);
    })();
  }
}
