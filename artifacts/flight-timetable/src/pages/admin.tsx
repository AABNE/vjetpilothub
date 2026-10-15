import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth-provider";
import { getGetAdminFlightsQueryKey, getGetAdminUsersQueryKey, useGetAdminFlights, useGetAdminUsers, useCreateAdminUser, useUpdateAdminUser, useDeleteAdminUser } from "@workspace/api-client-react";
import { AlertTriangle, Check, Clock3, Plane, Plus, ShieldCheck, Trash2, Users, X } from "lucide-react";

type AircraftType = "A320" | "A20N" | "A21N" | "B788";
const fleetOptions: { code: AircraftType; label: string }[] = [
  { code: "A320", label: "A320-200" }, { code: "A20N", label: "A320neo" },
  { code: "A21N", label: "A321neo LR" }, { code: "B788", label: "787-8" },
];

function JetstarStar({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <polygon points="50,5 61,35 95,35 68,57 79,91 50,70 21,91 32,57 5,35 39,35" fill="currentColor" />
    </svg>
  );
}

export default function Admin() {
  const { user: currentUser } = useAuth();
  const qc = useQueryClient();
  const usersQ = useGetAdminUsers({ query: { queryKey: getGetAdminUsersQueryKey(), refetchOnMount: "always" } });
  const flightsQ = useGetAdminFlights({ query: { queryKey: getGetAdminFlightsQueryKey(), refetchOnMount: "always", refetchInterval: 30_000 } });

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");  // blank = use default Vjet1234
  const [aircraft, setAircraft] = useState<AircraftType[]>(["A320"]);
  const [simulatorVersion, setVersion] = useState<"MSFS2020" | "MSFS2024">("MSFS2024");
  const [isAdmin, setIsAdmin] = useState(false);

  const refresh = () => { qc.invalidateQueries({ queryKey: getGetAdminUsersQueryKey() }); qc.invalidateQueries({ queryKey: getGetAdminFlightsQueryKey() }); };
  const create = useCreateAdminUser({ mutation: { onSuccess: () => { refresh(); setUsername(""); setPassword(""); setAircraft(["A320"]); setIsAdmin(false); } } });
  const update = useUpdateAdminUser({ mutation: { onSuccess: refresh } });
  const remove = useDeleteAdminUser({ mutation: { onSuccess: refresh } });
  const toggle = (code: AircraftType) => setAircraft(prev => prev.includes(code) ? (prev.length > 1 ? prev.filter(a => a !== code) : prev) : [...prev, code]);
  const pilots = (usersQ.data || []) as any[];
  const live = flightsQ.data || [];

  // Flagged flights
  const [flagged, setFlagged] = useState<any[]>([]);
  const [flagLoading, setFlagLoading] = useState(true);
  const [flagAction, setFlagAction] = useState<number | null>(null);

  const loadFlagged = async () => {
    setFlagLoading(true);
    try {
      const res = await fetch("/api/admin/flagged", { credentials: "include" });
      if (res.ok) setFlagged(await res.json());
    } finally { setFlagLoading(false); }
  };

  const approveFlight = async (id: number) => {
    setFlagAction(id);
    await fetch(\`/api/admin/flagged/\${id}/approve\`, { method: "POST", credentials: "include" });
    setFlagged(prev => prev.filter(f => f.id !== id));
    setFlagAction(null);
  };

  const rejectFlight = async (id: number) => {
    if (!window.confirm("Reject and permanently delete this flight log?")) return;
    setFlagAction(id);
    await fetch(\`/api/admin/flagged/\${id}/reject\`, { method: "POST", credentials: "include" });
    setFlagged(prev => prev.filter(f => f.id !== id));
    setFlagAction(null);
  };

  // Load flagged on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadFlagged(); }, []);

  if (!currentUser?.isAdmin) return (
    <section className="mx-auto max-w-xl rounded-2xl border border-[#e5e7eb] bg-white p-8 text-center" data-testid="status-admin-restricted">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fb5713] text-white">
        <ShieldCheck className="h-6 w-6" />
      </div>
      <h1 className="mt-4 text-3xl font-black uppercase text-[#1a1a1a]">Tower access only</h1>
      <p className="mt-2 text-sm text-[#6b7280]">This workspace is reserved for administrators.</p>
    </section>
  );

  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[.2em] text-[#fb5713]">Operations control · restricted</p>
          <h1 className="mt-2 text-5xl font-black uppercase leading-none tracking-tight text-[#1a1a1a] md:text-6xl">Control tower</h1>
          <p className="mt-3 text-sm text-[#6b7280]">Manage pilot accounts and monitor active dispatch.</p>
        </div>
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fb5713] text-white">
          <JetstarStar size={22} />
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-[#1a1a1a] p-5 text-white">
          <div className="font-mono text-[9px] uppercase tracking-widest text-white/50">Pilot accounts</div>
          <div className="mt-2 text-4xl font-black" data-testid="value-admin-user-count">{pilots.length}</div>
        </div>
        <div className="rounded-2xl bg-[#fb5713] p-5 text-white">
          <div className="font-mono text-[9px] uppercase tracking-widest text-white/70">Active sectors</div>
          <div className="mt-2 text-4xl font-black" data-testid="value-admin-active-count">{live.filter(e => e.status.toLowerCase() === "active").length}</div>
        </div>
        <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
          <div className="font-mono text-[9px] uppercase tracking-widest text-[#9ca3af]">Awaiting dispatch</div>
          <div className="mt-2 text-4xl font-black text-[#1a1a1a]">{live.filter(e => e.status.toLowerCase() !== "active").length}</div>
        </div>
        <div className={`rounded-2xl border p-5 ${flagged.length > 0 ? "border-yellow-300 bg-yellow-50" : "border-[#e5e7eb] bg-white"}`}>
          <div className="flex items-center gap-2">
            <AlertTriangle className={`h-4 w-4 ${flagged.length > 0 ? "text-yellow-500" : "text-[#9ca3af]"}`} />
            <div className={`font-mono text-[9px] uppercase tracking-widest ${flagged.length > 0 ? "text-yellow-600" : "text-[#9ca3af]"}`}>Flagged flights</div>
          </div>
          <div className={`mt-2 text-4xl font-black ${flagged.length > 0 ? "text-yellow-700" : "text-[#1a1a1a]"}`}>{flagged.length}</div>
        </div>
      </div>

      {/* Flagged flights review */}
      {(flagged.length > 0 || flagLoading) && (
        <section className="mt-7 overflow-hidden rounded-2xl border border-yellow-300 bg-yellow-50">
          <div className="flex items-center justify-between border-b border-yellow-200 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-400 text-white">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-bold uppercase tracking-tight text-yellow-900">Flagged flights</h2>
                <p className="text-[10px] text-yellow-600">Suspicious duration — approve to credit hours, reject to discard.</p>
              </div>
            </div>
            <button onClick={loadFlagged} className="rounded-lg border border-yellow-300 bg-white px-3 py-1.5 text-[10px] font-bold uppercase text-yellow-700 hover:bg-yellow-100">
              Refresh
            </button>
          </div>

          {flagLoading ? (
            <div className="space-y-2 p-6">{[1,2].map(i => <div key={i} className="h-16 animate-pulse rounded-xl bg-yellow-100" />)}</div>
          ) : (
            <div className="divide-y divide-yellow-200">
              {flagged.map(entry => {
                const mins = Math.floor((entry.flightDurationSeconds ?? 0) / 60);
                const secs = (entry.flightDurationSeconds ?? 0) % 60;
                const durationStr = mins > 0 ? \`\${mins}m \${secs}s\` : \`\${secs}s\`;
                return (
                  <div key={entry.id} className="flex flex-wrap items-start justify-between gap-4 px-6 py-5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-black text-yellow-800">{entry.flight.flightNumber}</span>
                        <span className="rounded-full bg-yellow-200 px-2 py-0.5 font-mono text-[9px] font-bold uppercase text-yellow-700">Flagged</span>
                      </div>
                      <div className="mt-1 font-mono text-xs text-yellow-700">
                        {entry.flight.departure} → {entry.flight.arrival} · {entry.flight.aircraft}
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] text-yellow-600">
                        Pilot: <span className="font-bold">{entry.pilotUsername}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-yellow-600">
                        <Clock3 className="h-3 w-3" />
                        Logged <span className="font-bold text-yellow-800">{durationStr}</span>
                        &nbsp;·&nbsp;scheduled <span className="font-bold">{entry.flight.durationMinutes} min</span>
                      </div>
                      {entry.flagReason && (
                        <p className="mt-1.5 max-w-sm text-[10px] italic text-yellow-600">{entry.flagReason}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => approveFlight(entry.id)} disabled={flagAction === entry.id}
                        className="flex items-center gap-1.5 rounded-xl bg-green-600 px-4 py-2 text-[10px] font-bold uppercase text-white transition hover:bg-green-700 disabled:opacity-50">
                        <Check className="h-3.5 w-3.5" />Approve
                      </button>
                      <button onClick={() => rejectFlight(entry.id)} disabled={flagAction === entry.id}
                        className="flex items-center gap-1.5 rounded-xl border border-red-300 bg-white px-4 py-2 text-[10px] font-bold uppercase text-red-600 transition hover:bg-red-50 disabled:opacity-50">
                        <X className="h-3.5 w-3.5" />Reject
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Pilot accounts */}
      <section className="mt-7 overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white">
        <div className="flex items-center gap-3 border-b border-[#f3f4f6] px-6 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f3f4f6]">
            <Users className="h-5 w-5 text-[#6b7280]" />
          </div>
          <div>
            <h2 className="font-bold uppercase tracking-tight text-[#1a1a1a]">Pilot accounts</h2>
            <p className="text-[10px] text-[#9ca3af]">Assignments control each pilot's available routes.</p>
          </div>
        </div>

        {/* Create form */}
        <form onSubmit={e => { e.preventDefault(); create.mutate({ data: { username: username.trim(), password, aircraft, simulatorVersion, isAdmin } as any }); }}
          className="grid gap-3 border-b border-[#f3f4f6] bg-[#f9fafb] p-5 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
          <label className="block">
            <span className="mb-1.5 block font-mono text-[10px] font-bold uppercase tracking-widest text-[#6b7280]">Username</span>
            <input data-testid="input-new-pilot-username" required minLength={3} maxLength={32} value={username} onChange={e => setUsername(e.target.value)}
              className="h-10 w-full rounded-xl border border-[#e5e7eb] bg-white px-3 text-sm text-[#1a1a1a] outline-none focus:border-[#fb5713]" />
          </label>
          <label className="block">
            <span className="mb-1.5 block font-mono text-[10px] font-bold uppercase tracking-widest text-[#6b7280]">Password <span className="text-[9px] font-normal normal-case text-[#9ca3af]">(optional)</span></span>
            <input data-testid="input-new-pilot-password" type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Leave blank to use default: Vjet1234"
              className="h-10 w-full rounded-xl border border-[#e5e7eb] bg-white px-3 text-sm text-[#1a1a1a] outline-none placeholder:text-[#9ca3af] focus:border-[#fb5713]" />
            <span className="mt-1 block text-[9px] text-[#9ca3af]">If blank, pilot logs in with Vjet1234 and must change it immediately.</span>
          </label>
          <label className="block">
            <span className="mb-1.5 block font-mono text-[10px] font-bold uppercase tracking-widest text-[#6b7280]">Simulator</span>
            <select data-testid="select-new-pilot-simulator" value={simulatorVersion} onChange={e => setVersion(e.target.value as typeof simulatorVersion)}
              className="h-10 w-full rounded-xl border border-[#e5e7eb] bg-white px-3 text-sm text-[#1a1a1a] outline-none focus:border-[#fb5713]">
              <option value="MSFS2020">MSFS 2020</option>
              <option value="MSFS2024">MSFS 2024</option>
            </select>
          </label>
          <button data-testid="button-create-pilot" disabled={create.isPending || !aircraft.length}
            className="flex h-10 items-center justify-center gap-2 rounded-xl bg-[#fb5713] px-4 text-[10px] font-bold uppercase tracking-wider text-white transition hover:bg-[#e04d0e] disabled:opacity-50">
            <Plus className="h-4 w-4" />Create pilot
          </button>
          <div className="md:col-span-4">
            <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-widest text-[#6b7280]">Fleet assignment</div>
            <div className="flex flex-wrap gap-2">
              {fleetOptions.map(opt => (
                <label key={opt.code} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-semibold transition ${aircraft.includes(opt.code) ? "border-[#fb5713] bg-[#fff5f2] text-[#fb5713]" : "border-[#e5e7eb] bg-white text-[#6b7280]"}`}>
                  <input data-testid={`checkbox-new-pilot-${opt.code.toLowerCase()}`} type="checkbox" checked={aircraft.includes(opt.code)} onChange={() => toggle(opt.code)} className="accent-[#fb5713]" />
                  {opt.code} · {opt.label}
                </label>
              ))}
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#e5e7eb] bg-white px-3 py-2 text-[10px] font-semibold text-[#6b7280]">
                <input data-testid="checkbox-new-pilot-admin" type="checkbox" checked={isAdmin} onChange={e => setIsAdmin(e.target.checked)} className="accent-[#fb5713]" />
                Admin access
              </label>
            </div>
          </div>
        </form>

        {(create.error || update.error || remove.error) && (
          <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert" data-testid="status-admin-error">
            {((create.error || update.error || remove.error) as any)?.message || "Account action failed."}
          </div>
        )}

        {usersQ.isLoading ? (
          <div className="space-y-2 p-5">{[1,2].map(x => <div key={x} className="h-16 animate-pulse rounded-xl bg-[#f3f4f6]" />)}</div>
        ) : usersQ.isError ? (
          <div className="p-6 text-sm text-red-600" data-testid="status-admin-users-error">
            Pilot accounts unavailable. <button data-testid="button-retry-admin-users" onClick={() => usersQ.refetch()} className="font-bold underline">Retry</button>
          </div>
        ) : pilots.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#6b7280]">No pilot accounts yet.</div>
        ) : pilots.map(p => (
          <PilotRow key={p.id} pilot={p}
            onSave={(id, data) => update.mutate({ id, data })}
            onDelete={id => { if (window.confirm(`Remove pilot ${p.username}?`)) remove.mutate({ id }); }}
            busy={update.isPending || remove.isPending} />
        ))}
      </section>

      {/* Live dispatch */}
      <section className="mt-7 overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white">
        <div className="flex items-center justify-between border-b border-[#f3f4f6] px-6 py-5">
          <div>
            <h2 className="font-bold uppercase tracking-tight text-[#1a1a1a]">Live dispatch board</h2>
            <p className="text-[10px] text-[#9ca3af]">All pilots · auto-refresh 30s</p>
          </div>
          <Plane className="h-5 w-5 text-[#fb5713]" />
        </div>
        {flightsQ.isLoading ? (
          <div className="space-y-2 p-5">{[1,2,3].map(x => <div key={x} className="h-14 animate-pulse rounded-xl bg-[#f3f4f6]" />)}</div>
        ) : flightsQ.isError ? (
          <div className="p-6 text-sm text-red-600" data-testid="status-admin-flights-error">
            Dispatch board unavailable. <button data-testid="button-retry-admin-flights" onClick={() => flightsQ.refetch()} className="font-bold underline">Retry</button>
          </div>
        ) : live.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#6b7280]">No scheduled or active flights at the moment.</div>
        ) : (
          <div>
            {live.map(e => (
              <div key={e.id} data-testid={`row-admin-flight-${e.id}`}
                className="grid gap-2 border-b border-[#f3f4f6] px-6 py-4 last:border-0 sm:grid-cols-[1fr_1fr_1.5fr_1fr_auto] sm:items-center">
                <span className="font-mono text-xs font-bold text-[#fb5713]">{e.flight.flightNumber}</span>
                <span className="text-sm font-semibold text-[#1a1a1a]">{e.pilotUsername}</span>
                <span className="text-lg font-black uppercase tracking-tight text-[#1a1a1a]">{e.flight.departure} <span className="text-[#d1d5db]">→</span> {e.flight.arrival}</span>
                <span className="font-mono text-[10px] text-[#6b7280]">{e.pilotAircraft} / {e.flight.aircraft}</span>
                <span className={`w-fit rounded-full px-2.5 py-1 text-[9px] font-bold uppercase ${e.status.toLowerCase() === "active" ? "bg-green-100 text-green-700" : "bg-[#fff7ed] text-[#fb5713]"}`}>{e.status}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PilotRow({ pilot, onSave, onDelete, busy }: { pilot: any; onSave: (id: number, data: any) => void; onDelete: (id: number) => void; busy: boolean }) {
  const [selected, setSelected] = useState<AircraftType[]>(pilot.aircraft);
  const [version, setVersion] = useState<"MSFS2020" | "MSFS2024">(pilot.simulatorVersion);
  const change = (c: AircraftType) => setSelected(prev => prev.includes(c) ? (prev.length > 1 ? prev.filter(v => v !== c) : prev) : [...prev, c]);
  const dirty = selected.join(",") !== pilot.aircraft.join(",") || version !== pilot.simulatorVersion;

  return (
    <div data-testid={`row-pilot-${pilot.id}`} className="border-b border-[#f3f4f6] p-5 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-semibold text-[#1a1a1a]" data-testid={`text-pilot-name-${pilot.id}`}>
            {pilot.username}
            {pilot.isAdmin && <span className="rounded-full bg-[#fb5713] px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-white">Admin</span>}
          </div>
          <div className="mt-1 font-mono text-[9px] uppercase text-[#9ca3af]">ID {pilot.id} · SimBrief: {pilot.simbriefUsername || "not set"}</div>
        </div>
        <button data-testid={`button-delete-pilot-${pilot.id}`} onClick={() => onDelete(pilot.id)} disabled={busy}
          className="flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-[9px] font-bold uppercase text-red-600 transition hover:bg-red-50 disabled:opacity-50">
          <Trash2 className="h-3 w-3" />Remove
        </button>
      </div>
      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="flex flex-1 flex-wrap gap-2">
          {fleetOptions.map(opt => (
            <label key={opt.code} className={`flex cursor-pointer items-center gap-1.5 rounded-xl border px-2.5 py-2 text-[9px] font-semibold transition ${selected.includes(opt.code) ? "border-[#fb5713] bg-[#fff5f2] text-[#fb5713]" : "border-[#e5e7eb] bg-[#f9fafb] text-[#6b7280]"}`}>
              <input data-testid={`checkbox-pilot-${pilot.id}-${opt.code.toLowerCase()}`} type="checkbox" checked={selected.includes(opt.code)} onChange={() => change(opt.code)} className="accent-[#fb5713]" />
              {opt.code}
            </label>
          ))}
        </div>
        <select data-testid={`select-pilot-simulator-${pilot.id}`} value={version} onChange={e => setVersion(e.target.value as typeof version)}
          className="h-9 rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-3 text-[10px] font-semibold text-[#1a1a1a] outline-none focus:border-[#fb5713]">
          <option value="MSFS2020">MSFS 2020</option>
          <option value="MSFS2024">MSFS 2024</option>
        </select>
        <button data-testid={`button-save-pilot-${pilot.id}`} disabled={busy || !selected.length || !dirty}
          onClick={() => onSave(pilot.id, { aircraft: selected, simulatorVersion: version })}
          className="rounded-xl bg-[#1a1a1a] px-4 py-2.5 text-[9px] font-bold uppercase tracking-wider text-white transition hover:bg-[#333] disabled:opacity-40">
          Save assignment
        </button>
      </div>
    </div>
  );
}
