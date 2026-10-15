import { Router, type IRouter } from "express";
import { db, timetableTable, flightsTable, usersTable, eq, and } from "@workspace/db";

import {
  AddToTimetableBody,
  StartFlightParams,
  StartFlightResponse,
  FinishFlightParams,
  FinishFlightResponse,
  GetTimetableResponse,
  RemoveFromTimetableParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

// A flight is suspicious if it finishes in under 10% of the scheduled duration
// (e.g. a 120-min flight done in under 12 mins = almost certainly a spam click)
const SUSPICIOUS_THRESHOLD = 0.10;

async function getTimetableWithFlights(userId: number) {
  const entries = await db
    .select()
    .from(timetableTable)
    .where(eq(timetableTable.userId, userId))
    .orderBy(timetableTable.createdAt);

  const result = [];
  for (const entry of entries) {
    const [flight] = await db
      .select()
      .from(flightsTable)
      .where(eq(flightsTable.id, entry.flightId));

    if (flight) {
      result.push({
        id: entry.id,
        userId: entry.userId,
        flightId: entry.flightId,
        status: entry.status,
        startedAt: entry.startedAt ? entry.startedAt.toISOString() : null,
        finishedAt: entry.finishedAt ? entry.finishedAt.toISOString() : null,
        flightDurationSeconds: entry.flightDurationSeconds,
        flagReason: entry.flagReason ?? null,
        approvedByAdmin: entry.approvedByAdmin,
        flight: {
          id: flight.id,
          flightNumber: flight.flightNumber,
          departure: flight.departure,
          arrival: flight.arrival,
          aircraft: flight.aircraft,
          departureTime: flight.departureTime,
          flightDate: flight.flightDate,
          durationMinutes: flight.durationMinutes,
        },
      });
    }
  }
  return result;
}

router.get("/timetable", async (req, res): Promise<void> => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const entries = await getTimetableWithFlights(req.session.userId);
  res.json(GetTimetableResponse.parse(entries));
});

router.post("/timetable", async (req, res): Promise<void> => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const parsed = AddToTimetableBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { flightId } = parsed.data;

  const [flight] = await db
    .select()
    .from(flightsTable)
    .where(eq(flightsTable.id, flightId));

  if (!flight) {
    res.status(400).json({ error: "Flight not found" });
    return;
  }

  const existing = await db
    .select()
    .from(timetableTable)
    .where(
      and(
        eq(timetableTable.userId, req.session.userId),
        eq(timetableTable.flightId, flightId),
      ),
    );

  const nonCompleted = existing.filter((e) => e.status !== "completed" && e.status !== "flagged");
  if (nonCompleted.length > 0) {
    res.status(409).json({ error: "Flight already in your timetable" });
    return;
  }

  const [entry] = await db
    .insert(timetableTable)
    .values({
      userId: req.session.userId,
      flightId,
      status: "pending",
    })
    .returning();

  const entries = await getTimetableWithFlights(req.session.userId);
  const created = entries.find((e) => e.id === entry.id);

  res.status(201).json(created);
});

router.post("/timetable/:id/start", async (req, res): Promise<void> => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = StartFlightParams.safeParse({ id: parseInt(rawId, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [entry] = await db
    .select()
    .from(timetableTable)
    .where(
      and(
        eq(timetableTable.id, params.data.id),
        eq(timetableTable.userId, req.session.userId),
      ),
    );

  if (!entry) {
    res.status(404).json({ error: "Timetable entry not found" });
    return;
  }

  if (entry.status !== "pending") {
    res.status(409).json({ error: "Flight has already been started" });
    return;
  }

  const [updated] = await db
    .update(timetableTable)
    .set({ status: "active", startedAt: new Date() })
    .where(eq(timetableTable.id, entry.id))
    .returning();

  const entries = await getTimetableWithFlights(req.session.userId);
  const result = entries.find((e) => e.id === updated.id);

  res.json(StartFlightResponse.parse(result));
});

router.post("/timetable/:id/finish", async (req, res): Promise<void> => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = FinishFlightParams.safeParse({ id: parseInt(rawId, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [entry] = await db
    .select()
    .from(timetableTable)
    .where(
      and(
        eq(timetableTable.id, params.data.id),
        eq(timetableTable.userId, req.session.userId),
      ),
    );

  if (!entry) {
    res.status(404).json({ error: "Timetable entry not found" });
    return;
  }

  if (entry.status !== "active") {
    res.status(409).json({ error: "Flight is not currently active" });
    return;
  }

  const [flight] = await db
    .select()
    .from(flightsTable)
    .where(eq(flightsTable.id, entry.flightId));

  const finishedAt = new Date();
  const startedAt = entry.startedAt ?? finishedAt;
  const durationSeconds = Math.floor((finishedAt.getTime() - startedAt.getTime()) / 1000);

  const scheduledSeconds = (flight?.durationMinutes ?? 0) * 60;
  const minimumSeconds = Math.floor(scheduledSeconds * SUSPICIOUS_THRESHOLD);

  // Flag if finished way too fast relative to scheduled duration.
  // Also flag if it somehow finished in under 60 seconds regardless of flight length.
  const isSuspicious =
    scheduledSeconds > 0 &&
    (durationSeconds < minimumSeconds || durationSeconds < 60);

  let flagReason: string | null = null;
  if (isSuspicious) {
    const minutes = Math.floor(durationSeconds / 60);
    const seconds = durationSeconds % 60;
    const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    flagReason = `Completed in ${timeStr} — scheduled duration is ${flight?.durationMinutes ?? "?"} min. Requires admin review.`;
  }

  const newStatus = isSuspicious ? "flagged" : "completed";

  const [updated] = await db
    .update(timetableTable)
    .set({
      status: newStatus,
      finishedAt,
      flightDurationSeconds: durationSeconds,
      flagReason,
      approvedByAdmin: false,
    })
    .where(eq(timetableTable.id, entry.id))
    .returning();

  // Only add sim hours if not flagged
  if (!isSuspicious) {
    const user = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId));
    if (user[0]) {
      const addHours = durationSeconds / 3600;
      await db
        .update(usersTable)
        .set({ simHours: (user[0].simHours ?? 0) + addHours })
        .where(eq(usersTable.id, req.session.userId));
    }
  }

  const entries = await getTimetableWithFlights(req.session.userId);
  const result = entries.find((e) => e.id === updated.id);

  res.json(FinishFlightResponse.parse(result));
});

router.delete("/timetable/:id", async (req, res): Promise<void> => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = RemoveFromTimetableParams.safeParse({ id: parseInt(rawId, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [currentUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.session.userId));
  const isAdmin = currentUser?.isAdmin === "true";

  const [entry] = await db
    .select()
    .from(timetableTable)
    .where(
      isAdmin
        ? eq(timetableTable.id, params.data.id)
        : and(
            eq(timetableTable.id, params.data.id),
            eq(timetableTable.userId, req.session.userId),
          ),
    );

  if (!entry) {
    res.status(404).json({ error: "Timetable entry not found" });
    return;
  }

  if ((entry.status === "completed" || entry.status === "flagged") && !isAdmin) {
    res.status(403).json({ error: "Only admins can remove completed or flagged flight logs" });
    return;
  }

  await db.delete(timetableTable).where(eq(timetableTable.id, entry.id));
  res.sendStatus(204);
});

export default router;
