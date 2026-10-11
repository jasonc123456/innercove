import { useEffect, useState, type ReactNode } from "react";
import { ADMIN_LOGINS, useAppSession } from "../session/AppSession";

type PrivacyStatus = {
  locked: boolean;
  encryption: "sqlcipher" | "off";
  dataPath: string;
  model: { id: string; endpointClass: "loopback" | "lan" | "public" };
  acceleration: "cuda" | "vulkan" | "cpu" | "unknown";
  memoryUsedGb: number | null;
  lastReply: { firstWordMs: number; tokPerS: number } | null;
};

type Settings = {
  useMemoriesDefault: boolean;
  diaryDefaultAccessLevel: "private" | "ai_eligible";
};

const ENDPOINT_LABEL = { loopback: "This machine only", lan: "Local network", public: "Internet" } as const;

/**
 * Hub admin (D47: one account per hub, its owner). Reads live hub state; anything not
 * built yet (two-factor, more users) is shown as planned, never faked.
 */
export function AdminPage() {
  const { signOut } = useAppSession();
  const [status, setStatus] = useState<PrivacyStatus | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [deleted, setDeleted] = useState<string | null>(null);

  async function api<T>(path: string, init?: RequestInit): Promise<T | null> {
    const res = await fetch(path, init).catch(() => null);
    if (!res) {
      setProblem("The hub isn't reachable right now.");
      return null;
    }
    if (res.status === 423) {
      signOut(); // the hub restarted and locked; sign in again to unlock it
      return null;
    }
    if (!res.ok) {
      setProblem("Something went wrong. Try again.");
      return null;
    }
    return (await res.json()) as T;
  }

  useEffect(() => {
    void api<PrivacyStatus>("/api/privacy-status").then((s) => s && setStatus(s));
    void api<Settings>("/api/settings").then((s) => s && setSettings(s));
  }, []);

  async function updateSettings(patch: Partial<Settings>) {
    const next = await api<Settings>("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (next) setSettings(next);
  }

  async function lockHub() {
    await api("/api/lock", { method: "POST" });
    signOut();
  }

  async function deleteEverything() {
    const result = await api<{ deleted: { conversations: number; diaryEntries: number; memories: number } }>(
      "/api/delete-all",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "DELETE" }) },
    );
    setConfirmText("");
    if (result) {
      const d = result.deleted;
      setDeleted(`Deleted ${d.conversations} conversations, ${d.diaryEntries} diary entries and ${d.memories} memories.`);
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-8 lg:py-8">
      <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink lg:text-3xl">Hub admin</h1>
      <p className="mt-1 text-sm text-ink/65">Everything here runs on this hub. Nothing leaves it.</p>
      {problem ? (
        <p className="mt-3 rounded-2xl bg-white/80 px-4 py-3 text-sm text-ink" role="alert">{problem}</p>
      ) : null}

      <Card title="Account">
        <Row label="Signed in as" value="admin (hub owner)" />
        <Row label="Username / email" value={ADMIN_LOGINS.join(" · ")} />
        <Row label="Sign-in" value="Username or email + hub passphrase" />
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={signOut} className={secondaryButton}>Sign out</button>
          <button type="button" onClick={() => void lockHub()} className={secondaryButton}>Lock hub now</button>
        </div>
        <p className="mt-2 text-xs text-ink/55">Locking clears the key from memory; anyone must sign in again to open the diary.</p>
      </Card>

      <Card title="Security">
        <Row label="Two-factor" value="Not set up" />
        <button type="button" disabled className={`${secondaryButton} mt-3`} title="Planned: P1 #2 (D47)">
          Set up two-factor
        </button>
        <p className="mt-2 text-xs text-ink/55">
          Authenticator-app codes with recovery codes. Planned next (D47); needed before the hub is ever reachable
          from outside your home network.
        </p>
      </Card>

      <Card title="Users">
        <ul className="divide-y divide-line rounded-2xl border border-line bg-white/70">
          <li className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="font-medium text-ink">admin</span>
            <span className="rounded-full bg-foam px-2.5 py-0.5 text-xs font-medium text-cove">Owner</span>
          </li>
        </ul>
        <button type="button" disabled className={`${secondaryButton} mt-3`} title="Roadmap (D47)">
          Add user
        </button>
        <p className="mt-2 text-xs text-ink/55">
          One hub, one person. More accounts would be created here by the admin, never by public sign-up (roadmap).
        </p>
      </Card>

      <Card title="Hub status">
        {status ? (
          <>
            <Row label="Model" value={status.model.id} />
            <Row label="Model runs on" value={ENDPOINT_LABEL[status.model.endpointClass]} />
            <Row label="Acceleration" value={status.acceleration === "unknown" ? "Unknown" : status.acceleration.toUpperCase()} />
            <Row label="Memory in use" value={status.memoryUsedGb === null ? "Unknown" : `${status.memoryUsedGb} GB`} />
            <Row
              label="Last reply"
              value={status.lastReply ? `first word ${(status.lastReply.firstWordMs / 1000).toFixed(1)} s · ${status.lastReply.tokPerS} tok/s` : "No reply yet"}
            />
            <Row label="Encryption" value={status.encryption === "sqlcipher" ? "On (SQLCipher)" : "OFF"} />
            <Row label="Data file" value={status.dataPath} mono />
          </>
        ) : (
          <p className="text-sm text-ink/60">Loading…</p>
        )}
      </Card>

      <Card title="Defaults">
        {settings ? (
          <>
            <label className="flex min-h-11 items-center justify-between gap-4 text-sm text-ink">
              Use memories in new saved chats
              <input
                type="checkbox"
                className="size-5"
                checked={settings.useMemoriesDefault}
                onChange={(e) => void updateSettings({ useMemoriesDefault: e.target.checked })}
              />
            </label>
            <label className="flex min-h-11 items-center justify-between gap-4 text-sm text-ink">
              New diary entries are
              <select
                className="h-10 rounded-xl border border-line bg-white px-3 text-sm"
                value={settings.diaryDefaultAccessLevel}
                onChange={(e) => void updateSettings({ diaryDefaultAccessLevel: e.target.value as Settings["diaryDefaultAccessLevel"] })}
              >
                <option value="private">Private</option>
                <option value="ai_eligible">Shared with the AI</option>
              </select>
            </label>
          </>
        ) : (
          <p className="text-sm text-ink/60">Loading…</p>
        )}
      </Card>

      <Card title="Delete everything">
        <p className="text-sm leading-relaxed text-ink/75">
          Removes every conversation, diary entry and memory from this hub. The passphrase and settings stay. This
          can&apos;t be undone.
        </p>
        <label className="mt-3 flex flex-col gap-2 text-sm text-ink/80">
          Type DELETE to confirm
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="h-11 rounded-2xl border border-line bg-white px-4 text-base text-ink outline-none focus:border-cove"
          />
        </label>
        <button
          type="button"
          disabled={confirmText !== "DELETE"}
          onClick={() => void deleteEverything()}
          className="mt-3 inline-flex h-11 items-center justify-center rounded-2xl bg-[#8a3b46] px-4 text-base font-medium text-white disabled:opacity-40"
        >
          Delete everything
        </button>
        {deleted ? <p className="mt-2 text-sm text-ink/75" role="status">{deleted}</p> : null}
      </Card>
    </div>
  );
}

const secondaryButton =
  "inline-flex h-11 items-center justify-center rounded-2xl border border-cove/70 bg-white/70 px-4 text-sm font-medium text-cove disabled:cursor-not-allowed disabled:opacity-45";

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5 rounded-[1.5rem] border border-line bg-white/70 p-5 lg:border-white/70">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-cove">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex min-h-9 items-baseline justify-between gap-4 text-sm">
      <span className="text-ink/60">{label}</span>
      <span className={`text-right text-ink ${mono ? "break-all font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}
