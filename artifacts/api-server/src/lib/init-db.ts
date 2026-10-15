import { pool } from "@workspace/db";
import { logger } from "./logger";
import bcrypt from "bcryptjs";

export async function initDb(): Promise<void> {
  const client = await pool.connect();
  try {
    // Create tables if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id"                  SERIAL PRIMARY KEY,
        "username"            TEXT NOT NULL UNIQUE,
        "password_hash"       TEXT NOT NULL,
        "aircraft"            TEXT NOT NULL DEFAULT 'A320',
        "simulator_version"   TEXT NOT NULL DEFAULT 'MSFS2024',
        "simbrief_username"   TEXT,
        "is_admin"            TEXT NOT NULL DEFAULT 'false',
        "has_seen_tutorial"   TEXT NOT NULL DEFAULT 'false',
        "must_change_password" TEXT NOT NULL DEFAULT 'false',
        "sim_hours"           DOUBLE PRECISION NOT NULL DEFAULT 0,
        "created_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sim_hours" DOUBLE PRECISION NOT NULL DEFAULT 0;
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "simbrief_username" TEXT;
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "simulator_version" TEXT NOT NULL DEFAULT 'MSFS2024';
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "has_seen_tutorial" TEXT NOT NULL DEFAULT 'false';
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "must_change_password" TEXT NOT NULL DEFAULT 'false';

      CREATE TABLE IF NOT EXISTS "flights" (
        "id"               SERIAL PRIMARY KEY,
        "flight_number"    TEXT NOT NULL,
        "departure"        TEXT NOT NULL,
        "arrival"          TEXT NOT NULL,
        "aircraft"         TEXT NOT NULL,
        "departure_time"   TEXT NOT NULL,
        "flight_date"      TEXT NOT NULL,
        "duration_minutes" INTEGER NOT NULL,
        "created_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "timetable" (
        "id"                      SERIAL PRIMARY KEY,
        "user_id"                 INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "flight_id"               INTEGER NOT NULL REFERENCES "flights"("id") ON DELETE CASCADE,
        "status"                  TEXT NOT NULL DEFAULT 'pending',
        "started_at"              TIMESTAMPTZ,
        "finished_at"             TIMESTAMPTZ,
        "flight_duration_seconds" INTEGER,
        "flag_reason"             TEXT,
        "approved_by_admin"       BOOLEAN NOT NULL DEFAULT FALSE,
        "created_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE "timetable" ADD COLUMN IF NOT EXISTS "flag_reason" TEXT;
      ALTER TABLE "timetable" ADD COLUMN IF NOT EXISTS "approved_by_admin" BOOLEAN NOT NULL DEFAULT FALSE;

      CREATE TABLE IF NOT EXISTS "session" (
        "sid"    VARCHAR NOT NULL COLLATE "default",
        "sess"   JSON NOT NULL,
        "expire" TIMESTAMP(6) NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
      );

      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
    `);

    // Seed default admin if no users exist
    const { rows } = await client.query(`SELECT id FROM "users" LIMIT 1`);
    if (rows.length === 0) {
      const hash = await bcrypt.hash("admin1234", 12);
      await client.query(
        `INSERT INTO "users" (username, password_hash, aircraft, simulator_version, is_admin, has_seen_tutorial, must_change_password)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (username) DO NOTHING`,
        ["admin", hash, "A320,A20N,A21N,B788", "MSFS2024", "true", "false", "false"]
      );
      logger.info("Default admin created — username: admin / password: admin1234");
    }

    logger.info("Database initialised");
  } finally {
    client.release();
  }
}
