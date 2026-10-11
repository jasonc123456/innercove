import type { ReactNode } from "react";
import { useAppSession } from "../session/AppSession";

/** Shared pieces for the Settings and Admin pages. */
export const secondaryButton =
  "inline-flex h-11 items-center justify-center rounded-2xl border border-cove/70 bg-white/70 px-4 text-sm font-medium text-cove disabled:cursor-not-allowed disabled:opacity-45";

export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink lg:text-3xl">{title}</h1>
      <p className="mt-1 text-sm text-ink/65">{subtitle}</p>
    </>
  );
}

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5 rounded-[1.5rem] border border-line bg-white/70 p-5 lg:border-white/70">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-cove">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex min-h-9 items-baseline justify-between gap-4 text-sm">
      <span className="text-ink/60">{label}</span>
      <span className={`text-right text-ink ${mono ? "break-all font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}

export function Problem({ text }: { text: string | null }) {
  return text ? (
    <p className="mt-3 rounded-2xl bg-white/80 px-4 py-3 text-sm text-ink" role="alert">{text}</p>
  ) : null;
}

/** JSON calls to the hub. A 401 or 423 (signed out, or the hub restarted and locked) returns to sign-in. */
export function useHubApi(setProblem: (text: string) => void) {
  const { signOut } = useAppSession();
  return async function api<T>(path: string, init?: RequestInit): Promise<T | null> {
    const res = await fetch(path, init).catch(() => null);
    if (!res) {
      setProblem("The hub isn't reachable right now.");
      return null;
    }
    if (res.status === 401 || res.status === 423) {
      signOut();
      return null;
    }
    if (!res.ok) {
      setProblem("Something went wrong. Try again.");
      return null;
    }
    return (await res.json()) as T;
  };
}
