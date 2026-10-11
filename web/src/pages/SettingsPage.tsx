import { useEffect, useState } from "react";
import { Card, PageHeader, Problem, Row, secondaryButton, useHubApi } from "../components/Panel";
import { TwoFactorCard } from "../components/TwoFactorCard";
import { ADMIN_LOGINS, useAppSession } from "../session/AppSession";

type Settings = {
  useMemoriesDefault: boolean;
  diaryDefaultAccessLevel: "private" | "ai_eligible";
};

/** Your account: who you are, how you sign in, your defaults and your data (all per user). */
export function SettingsPage() {
  const { signOut } = useAppSession();
  const [problem, setProblem] = useState<string | null>(null);
  const api = useHubApi(setProblem);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [deleted, setDeleted] = useState<string | null>(null);

  useEffect(() => {
    void api<Settings>("/api/settings").then((s) => s && setSettings(s));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function updateSettings(patch: Partial<Settings>) {
    const next = await api<Settings>("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (next) setSettings(next);
  }

  async function deleteMyData() {
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
    <div className="min-h-0 flex-1 overflow-y-auto page-x px-4 py-5 lg:px-8 lg:py-8">
      <PageHeader title="Settings" subtitle="Your account, your defaults and your data." />
      <Problem text={problem} />

      <Card title="Account">
        <Row label="Signed in as" value="admin" />
        <Row label="Username / email" value={ADMIN_LOGINS.join(" · ")} />
        <Row label="Sign-in" value="Username or email + passphrase" />
        <button type="button" onClick={signOut} className={`${secondaryButton} mt-4`}>Sign out</button>
      </Card>

      <TwoFactorCard />

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

      <Card title="Delete all my data">
        <p className="text-sm leading-relaxed text-ink/75">
          Removes every conversation, diary entry and memory of yours from this hub. Your sign-in and settings stay.
          This can&apos;t be undone.
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
          onClick={() => void deleteMyData()}
          className="mt-3 inline-flex h-11 items-center justify-center rounded-2xl bg-[#8a3b46] px-4 text-base font-medium text-white disabled:opacity-40"
        >
          Delete all my data
        </button>
        {deleted ? <p className="mt-2 text-sm text-ink/75" role="status">{deleted}</p> : null}
      </Card>
    </div>
  );
}
