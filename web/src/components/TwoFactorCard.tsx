import { useEffect, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { Card, Row, secondaryButton } from "./Panel";

type Status = { enabled: boolean; recoveryCodesLeft: number };
type Enrollment = { otpauthUri: string; secret: string; qr: string };

const primaryButton =
  "inline-flex h-11 items-center justify-center rounded-2xl bg-cove px-4 text-sm font-medium text-white disabled:opacity-50";
const codeInput =
  "h-11 w-40 rounded-2xl border border-line bg-white px-4 text-base tracking-widest text-ink outline-none focus:border-cove";

/**
 * Two-factor (D47) for this account: codes from an authenticator app, plus 10 recovery codes
 * shown once. The QR code is drawn here in the browser (nothing leaves the hub).
 */
export function TwoFactorCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function call<T>(path: string, init?: RequestInit): Promise<T | null> {
    setProblem(null);
    setBusy(true);
    try {
      const res = await fetch(path, init);
      if (res.ok) return (await res.json()) as T;
      const body = await res.json().catch(() => null);
      setProblem(res.status === 400 && body?.error?.message === "That code didn't match"
        ? "That code didn't match. Check the app and try the newest code."
        : "Something went wrong. Try again.");
      return null;
    } catch {
      setProblem("The hub isn't reachable right now.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    const next = await call<Status>("/api/two-factor");
    if (next) setStatus(next);
  }

  useEffect(() => {
    void refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function start() {
    const result = await call<{ otpauthUri: string; secret: string }>("/api/two-factor/enroll", { method: "POST" });
    if (!result) return;
    const svg = await QRCode.toString(result.otpauthUri, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
    setEnrollment({ ...result, qr: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` });
    setCode("");
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    const result = await call<{ recoveryCodes: string[] }>("/api/two-factor/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim() }),
    });
    if (!result) return;
    setEnrollment(null);
    setRecoveryCodes(result.recoveryCodes);
    setCode("");
    await refresh();
  }

  async function turnOff(event: FormEvent) {
    event.preventDefault();
    const result = await call<{ enabled: false }>("/api/two-factor", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim() }),
    });
    if (!result) return;
    setCode("");
    await refresh();
  }

  const problemLine = problem ? (
    <p className="mt-3 text-sm text-ink" role="alert">{problem}</p>
  ) : null;

  if (recoveryCodes) {
    return (
      <Card title="Security">
        <Row label="Two-factor" value="On" />
        <p className="mt-3 text-sm leading-relaxed text-ink/80">
          Save these recovery codes somewhere safe, away from your phone. Each one signs you in once if you lose
          your authenticator app. <strong>They won&apos;t be shown again.</strong>
        </p>
        <ul className="mt-3 grid grid-cols-2 gap-2 rounded-2xl border border-line bg-white/80 p-4 font-mono text-sm text-ink">
          {recoveryCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <button type="button" onClick={() => setRecoveryCodes(null)} className={`${primaryButton} mt-4`}>
          I&apos;ve saved them
        </button>
      </Card>
    );
  }

  if (enrollment) {
    return (
      <Card title="Security">
        <p className="text-sm leading-relaxed text-ink/80">
          Scan this with an authenticator app (for example Google Authenticator, Microsoft Authenticator or
          1Password), then enter the 6-digit code it shows.
        </p>
        <img src={enrollment.qr} alt="QR code for your authenticator app" className="mt-3 size-48 rounded-2xl bg-white p-2" />
        <p className="mt-2 text-xs text-ink/60">Can&apos;t scan? Enter this key instead:</p>
        <p className="mt-1 break-all font-mono text-sm text-ink">{enrollment.secret.match(/.{1,4}/g)?.join(" ")}</p>
        <form onSubmit={(e) => void confirm(e)} className="mt-4 flex flex-wrap items-center gap-3">
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label="6-digit code"
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className={codeInput}
          />
          <button type="submit" disabled={busy || code.length !== 6} className={primaryButton}>
            Turn on
          </button>
          <button type="button" onClick={() => setEnrollment(null)} className={secondaryButton}>
            Cancel
          </button>
        </form>
        {problemLine}
      </Card>
    );
  }

  return (
    <Card title="Security">
      <Row label="Two-factor" value={status === null ? "…" : status.enabled ? "On" : "Off"} />
      {status?.enabled ? (
        <>
          <Row label="Recovery codes left" value={String(status.recoveryCodesLeft)} />
          <form onSubmit={(e) => void turnOff(e)} className="mt-3 flex flex-wrap items-center gap-3">
            <input
              autoComplete="one-time-code"
              aria-label="Code or recovery code"
              placeholder="Code"
              value={code}
              onChange={(e) => setCode(e.target.value.slice(0, 16))}
              className={codeInput}
            />
            <button type="submit" disabled={busy || code.trim().length < 6} className={secondaryButton}>
              Turn off two-factor
            </button>
          </form>
          <p className="mt-2 text-xs text-ink/55">
            Turning it off needs a current code or a recovery code. Lost both? Reset it from a shell on the hub.
          </p>
        </>
      ) : (
        <>
          <button type="button" onClick={() => void start()} disabled={busy || status === null} className={`${secondaryButton} mt-3`}>
            Set up two-factor
          </button>
          <p className="mt-2 text-xs text-ink/55">
            Sign-in will also ask for a code from an authenticator app. Strongly recommended before the hub is ever
            reachable from outside your home network.
          </p>
        </>
      )}
      {problemLine}
    </Card>
  );
}
