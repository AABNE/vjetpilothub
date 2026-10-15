import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey, useUpdatePilotProfile } from "@workspace/api-client-react";
import { useAuth } from "@/components/auth-provider";
import { ArrowRight, Check, KeyRound, MonitorCog, ExternalLink, Plane } from "lucide-react";

type AircraftType = "A320" | "A20N" | "A21N" | "B788";
const fleetOptions: { code: AircraftType; label: string }[] = [
  { code: "A320", label: "A320-200" },
  { code: "A20N", label: "A320neo" },
  { code: "A21N", label: "A321neo LR" },
  { code: "B788", label: "787-8" },
];

function JetstarStar({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <polygon points="50,5 61,35 95,35 68,57 79,91 50,70 21,91 32,57 5,35 39,35" fill="currentColor" />
    </svg>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const pilot = user as any;

  const [simulatorVersion, setSimulatorVersion] = useState<"MSFS2020" | "MSFS2024">(pilot?.simulatorVersion || "MSFS2024");
  const [aircraft, setAircraft] = useState<AircraftType[]>(
    Array.isArray(pilot?.aircraft) ? pilot.aircraft : ["A320"]
  );
  const [simbriefUsername, setSimbriefUsername] = useState(pilot?.simbriefUsername || "");

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwPending, setPwPending] = useState(false);

  useEffect(() => {
    if (pilot) {
      setSimulatorVersion(pilot.simulatorVersion);
      setSimbriefUsername(pilot.simbriefUsername || "");
      setAircraft(Array.isArray(pilot.aircraft) ? pilot.aircraft : ["A320"]);
    }
  }, [user?.id]);

  const save = useUpdatePilotProfile({
    mutation: {
      onSuccess: (updated: any) => {
        qc.setQueryData(getGetMeQueryKey(), updated);
      },
    },
  });

  const toggleAircraft = (code: AircraftType) => {
    setAircraft(prev =>
      prev.includes(code)
        ? prev.length > 1 ? prev.filter(a => a !== code) : prev
        : [...prev, code]
    );
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError("");
    setPwSuccess(false);
    if (newPassword.length < 8) { setPwError("New password must be at least 8 characters."); return; }
    if (newPassword !== confirmPassword) { setPwError("New passwords do not match."); return; }
    setPwPending(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPwError(data.error || "Failed to change password.");
      } else {
        setPwSuccess(true);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      setPwError("Network error. Please try again.");
    } finally {
      setPwPending(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[.2em] text-[#fb5713]">Pilot profile · preferences</p>
        <h1 className="mt-2 text-5xl font-black uppercase leading-none tracking-tight text-[#1a1a1a] md:text-6xl">Pilot settings</h1>
        <p className="mt-3 text-sm text-[#6b7280]">Configure your simulator, aircraft, and SimBrief dispatch integration.</p>
      </div>

      <form
        className="space-y-4"
        onSubmit={e => {
          e.preventDefault();
          save.mutate({ data: { simulatorVersion, aircraft, simbriefUsername: simbriefUsername.trim() || null } as any });
        }}
      >
        {/* Simulator */}
        <section className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white">
          <div className="flex items-center gap-3 border-b border-[#f3f4f6] px-6 py-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fb5713] text-white">
              <MonitorCog className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-bold uppercase tracking-tight text-[#1a1a1a]">Simulator version</h2>
              <p className="text-xs text-[#6b7280]">Used to tailor your virtual operations profile.</p>
            </div>
          </div>
          <div className="grid gap-3 p-6 sm:grid-cols-2">
            {(["MSFS2020", "MSFS2024"] as const).map(version => (
              <button type="button" key={version}
                onClick={() => setSimulatorVersion(version)}
                className={`flex items-center justify-between rounded-xl border p-4 text-left transition ${simulatorVersion === version ? "border-[#fb5713] bg-[#fff5f2]" : "border-[#e5e7eb] bg-[#f9fafb] hover:border-[#fb5713]/40"}`}>
                <div>
                  <div className="font-bold text-[#1a1a1a]">{version === "MSFS2020" ? "MSFS 2020" : "MSFS 2024"}</div>
                  <div className="mt-1 font-mono text-[9px] uppercase tracking-wider text-[#9ca3af]">Active platform</div>
                </div>
                <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${simulatorVersion === version ? "border-[#fb5713] bg-[#fb5713] text-white" : "border-[#d1d5db]"}`}>
                  {simulatorVersion === version && <Check className="h-3 w-3" />}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Aircraft */}
        <section className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white">
          <div className="flex items-center gap-3 border-b border-[#f3f4f6] px-6 py-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1a1a1a] text-white">
              <Plane className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-bold uppercase tracking-tight text-[#1a1a1a]">Fleet assignment</h2>
              <p className="text-xs text-[#6b7280]">Select all aircraft types you fly. Determines available routes.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 p-6">
            {fleetOptions.map(opt => (
              <button type="button" key={opt.code}
                onClick={() => toggleAircraft(opt.code)}
                className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition ${aircraft.includes(opt.code) ? "border-[#fb5713] bg-[#fff5f2] text-[#fb5713]" : "border-[#e5e7eb] bg-[#f9fafb] text-[#6b7280] hover:border-[#fb5713]/40"}`}>
                <span className={`flex h-4 w-4 items-center justify-center rounded border-2 ${aircraft.includes(opt.code) ? "border-[#fb5713] bg-[#fb5713] text-white" : "border-[#d1d5db]"}`}>
                  {aircraft.includes(opt.code) && <Check className="h-2.5 w-2.5" />}
                </span>
                <span className="font-mono text-[10px] font-bold uppercase">{opt.code}</span>
                <span className="text-[10px]">· {opt.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* SimBrief */}
        <section className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white">
          <div className="flex items-center gap-3 border-b border-[#f3f4f6] px-6 py-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1a1a1a] text-[#fb5713]">
              <JetstarStar size={18} />
            </div>
            <div>
              <h2 className="font-bold uppercase tracking-tight text-[#1a1a1a]">SimBrief dispatch</h2>
              <p className="text-xs text-[#6b7280]">Link your SimBrief account to dispatch flights with one click.</p>
            </div>
          </div>
          <div className="p-6">
            <label className="block">
              <span className="mb-2 block font-mono text-[10px] font-bold uppercase tracking-[.16em] text-[#6b7280]">SimBrief Pilot ID</span>
              <input
                data-testid="input-simbrief-username"
                maxLength={80}
                value={simbriefUsername}
                onChange={e => setSimbriefUsername(e.target.value)}
                placeholder="Your SimBrief numeric pilot ID"
                className="h-12 w-full rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-4 text-sm text-[#1a1a1a] outline-none transition focus:border-[#fb5713] focus:ring-2 focus:ring-[#fb5713]/20 md:max-w-md"
              />
              <span className="mt-2 block text-[11px] text-[#9ca3af]">
                Your SimBrief Pilot ID (numeric) — find it under SimBrief → Account settings.{" "}
                <a href="https://www.simbrief.com/system/profile.php" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[#fb5713] hover:underline">
                  Open SimBrief <ExternalLink className="h-3 w-3" />
                </a>
              </span>
            </label>
          </div>
        </section>

        {save.error && (
          <div role="alert" data-testid="status-settings-error" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
            {(save.error as any).message || "Could not save your settings."}
          </div>
        )}
        {save.isSuccess && (
          <div role="status" data-testid="status-settings-saved" className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-xs font-semibold text-green-700">
            <Check className="h-4 w-4" /> Pilot settings saved.
          </div>
        )}

        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#9ca3af]">
            Account: {user?.username} · Fleet: {Array.isArray(pilot?.aircraft) ? pilot.aircraft.join(" / ") : pilot?.aircraft}
          </p>
          <button data-testid="button-save-settings" disabled={save.isPending}
            className="flex items-center gap-2 rounded-xl bg-[#fb5713] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#e04d0e] disabled:opacity-50">
            {save.isPending ? "Saving…" : "Save settings"}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </form>

      {/* Password change */}
      <section className="mt-4 overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white">
        <div className="flex items-center gap-3 border-b border-[#f3f4f6] px-6 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f3f4f6]">
            <KeyRound className="h-5 w-5 text-[#6b7280]" />
          </div>
          <div>
            <h2 className="font-bold uppercase tracking-tight text-[#1a1a1a]">Change password</h2>
            <p className="text-xs text-[#6b7280]">Update your account password. Minimum 8 characters.</p>
          </div>
        </div>
        <form onSubmit={handlePasswordChange} className="space-y-4 p-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="mb-2 block font-mono text-[10px] font-bold uppercase tracking-[.16em] text-[#6b7280]">Current password</span>
              <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required
                className="h-10 w-full rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-3 text-sm text-[#1a1a1a] outline-none focus:border-[#fb5713]" />
            </label>
            <label className="block">
              <span className="mb-2 block font-mono text-[10px] font-bold uppercase tracking-[.16em] text-[#6b7280]">New password</span>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={8}
                className="h-10 w-full rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-3 text-sm text-[#1a1a1a] outline-none focus:border-[#fb5713]" />
            </label>
            <label className="block">
              <span className="mb-2 block font-mono text-[10px] font-bold uppercase tracking-[.16em] text-[#6b7280]">Confirm new password</span>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={8}
                className="h-10 w-full rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-3 text-sm text-[#1a1a1a] outline-none focus:border-[#fb5713]" />
            </label>
          </div>
          {pwError && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{pwError}</div>
          )}
          {pwSuccess && (
            <div role="status" className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-xs font-semibold text-green-700">
              <Check className="h-4 w-4" /> Password updated successfully.
            </div>
          )}
          <button type="submit" disabled={pwPending}
            className="flex items-center gap-2 rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-[#1a1a1a] transition hover:bg-[#f3f4f6] disabled:opacity-50">
            {pwPending ? "Updating…" : "Update password"}
            <KeyRound className="h-3.5 w-3.5" />
          </button>
        </form>
      </section>
    </div>
  );
}
