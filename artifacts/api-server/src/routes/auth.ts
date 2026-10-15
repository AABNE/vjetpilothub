import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, eq, sql } from "@workspace/db";


import {
  BootstrapAdminBody,
  ChangePasswordBody,
  ChangePasswordResponse,
  GetBootstrapStatusResponse,
  GetMeResponse,
  LoginBody,
  LoginResponse,
  LogoutResponse,
  UpdatePilotProfileBody,
  UpdatePilotProfileResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function publicUser(user: any) {
  return {
    id: user.id,
    username: user.username,
    aircraft: user.aircraft.split(",").map((type: string) => type.trim()).filter(Boolean),
    simulatorVersion: user.simulatorVersion,
    simbriefUsername: user.simbriefUsername,
    isAdmin: user.isAdmin === "true",
    mustChangePassword: user.mustChangePassword === "true",
    hasSeenTutorial: user.hasSeenTutorial === "true",
    simHours: user.simHours ?? 0,
  };
}

router.get("/auth/bootstrap-status", async (_req, res): Promise<void> => {
  const [user] = await db.select({ id: usersTable.id }).from(usersTable).limit(1);
  res.json(GetBootstrapStatusResponse.parse({ required: !user }));
});

router.post("/auth/bootstrap", async (req, res): Promise<void> => {
  const parsed = BootstrapAdminBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username, password, aircraft, simulatorVersion } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 12);
  const createdUser = await db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: usersTable.id }).from(usersTable).limit(1);
    if (existing) return null;

    const [user] = await tx.insert(usersTable).values({
      username: username.trim(),
      passwordHash,
      aircraft: aircraft.join(","),
      simulatorVersion,
      isAdmin: "true",
      hasSeenTutorial: "false",
      mustChangePassword: "false",
    }).returning();
    return user;
  });

  if (!createdUser) {
    res.status(409).json({ error: "An administrator has already been created" });
    return;
  }

  req.session.userId = createdUser.id;
  req.session.save((err) => {
    if (err) {
      res.status(500).json({ error: "Account created, but the sign-in session could not be saved" });
      return;
    }
    res.status(201).json(LoginResponse.parse(publicUser(createdUser)));
  });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username, password } = parsed.data;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, username));

  if (!user) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  req.session.userId = user.id;

  req.session.save((err) => {
    if (err) {
      res.status(500).json({ error: "Failed to save session" });
      return;
    }
    res.json(
      LoginResponse.parse(publicUser(user)),
    );
  });
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  req.session.destroy(() => {});
  res.json(LogoutResponse.parse({ message: "Logged out successfully" }));
});

router.get("/auth/me", async (req, res): Promise<void> => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.session.userId));

  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  res.json(GetMeResponse.parse(publicUser(user)));
});

router.patch("/auth/profile", async (req, res): Promise<void> => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const parsed = UpdatePilotProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({
      simulatorVersion: parsed.data.simulatorVersion,
      aircraft: parsed.data.aircraft.join(","),
      simbriefUsername: parsed.data.simbriefUsername?.trim() || null,
    })
    .where(eq(usersTable.id, req.session.userId))
    .returning();

  if (!updated) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  res.json(UpdatePilotProfileResponse.parse(publicUser(updated)));
});

router.post("/auth/change-password", async (req, res): Promise<void> => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const parsed = ChangePasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.session.userId));

  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }

  const newHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await db
    .update(usersTable)
    .set({ passwordHash: newHash, mustChangePassword: "false" })
    .where(eq(usersTable.id, req.session.userId));

  res.json(ChangePasswordResponse.parse({ ok: true }));
});

router.patch("/auth/tutorial-seen", async (req, res): Promise<void> => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  await db
    .update(usersTable)
    .set({ hasSeenTutorial: "true" })
    .where(eq(usersTable.id, req.session.userId));

  res.json({ ok: true });
});

export default router;
