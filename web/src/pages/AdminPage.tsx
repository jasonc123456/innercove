import { useEffect, useState } from "react";
import { Card, PageHeader, Problem, Row, secondaryButton, useHubApi } from "../components/Panel";
import { useAppSession } from "../session/AppSession";

type PrivacyStatus = {
  locked: boolean;
  encryption: "sqlcipher" | "off";
  dataPath: string;
  model: { id: string; endpointClass: "loopback" | "lan" | "public" };
  acceleration: "cuda" | "vulkan" | "cpu" | "unknown";
  memoryUsedGb: number | null;
  lastReply: { firstWordMs: number; tokPerS: number } | null;
};

const ENDPOINT_LABEL = { loopback: "This machine only", lan: "Local network", public: "Internet" } as const;

/**
 * Hub-wide administration (D47): who can use this hub and how the hub itself is running.
 * Per-account items live in Settings. Nothing not built yet is faked; it's shown as planned.
 */
export function AdminPage() {
  const { signOut } = useAppSession();
  const [problem, setProblem] = useState<string | null>(null);
  const api = useHubApi(setProblem);
  const [status, setStatus] = useState<PrivacyStatus | null>(null);

  useEffect(() => {
    void api<PrivacyStatus>("/api/privacy-status").then((s) => s && setStatus(s));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function lockHub() {
    await api("/api/lock", { method: "POST" });
    signOut();
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-8 lg:py-8">
      <PageHeader title="Hub admin" subtitle="This hub and who can use it. Everything runs here; nothing leaves it." />
      <Problem text={problem} />

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
          More accounts would be created here by the admin, never by public sign-up (roadmap).
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

      <Card title="Lock the hub">
        <p className="text-sm leading-relaxed text-ink/75">
          Clears the encryption key from memory. Everyone is signed out, and the diary stays unreadable until someone
          signs in again.
        </p>
        <button type="button" onClick={() => void lockHub()} className={`${secondaryButton} mt-3`}>Lock hub now</button>
      </Card>
    </div>
  );
}
