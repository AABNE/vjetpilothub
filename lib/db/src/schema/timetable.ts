import { pgTable, integer, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { flightsTable } from "./flights";

export const timetableTable = pgTable("timetable", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  flightId: integer("flight_id").notNull().references(() => flightsTable.id),
  // "pending" | "active" | "completed" | "flagged"
  status: text("status").notNull().default("pending"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  flightDurationSeconds: integer("flight_duration_seconds"),
  // flagging
  flagReason: text("flag_reason"),
  approvedByAdmin: boolean("approved_by_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTimetableSchema = createInsertSchema(timetableTable).omit({ id: true, createdAt: true });
export type InsertTimetable = z.infer<typeof insertTimetableSchema>;
export type Timetable = typeof timetableTable.$inferSelect;
