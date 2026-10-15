import { pgTable, text, serial, timestamp, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  aircraft: text("aircraft").notNull().default("A320"),
  simulatorVersion: text("simulator_version").notNull().default("MSFS2024"),
  simbriefUsername: text("simbrief_username"),
  isAdmin: text("is_admin").notNull().default("false"),
  hasSeenTutorial: text("has_seen_tutorial").notNull().default("false"),
  mustChangePassword: text("must_change_password").notNull().default("false"),
  simHours: doublePrecision("sim_hours").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
