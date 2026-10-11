import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAppSession } from "../session/AppSession";

type Mode = "sign-in" | "create";

export function LoginPage() {
  const { signIn, createAccount } = useAppSession();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setPassword("");
    setConfirm("");
    setError(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextError =
      mode === "sign-in" ? signIn(email, password) : createAccount(email, password, confirm);
    if (nextError) {
      setError(nextError);
      return;
    }
    setPassword("");
    setConfirm("");
    setError(null);
  }

  const creating = mode === "create";

  return (
    <div className="flex min-h-dvh flex-col bg-paper px-4 py-8 font-sans text-ink">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <div className="flex items-center gap-3">
          <CoveMark />
          <h1 className="text-3xl font-semibold tracking-tight text-cove">Inner Cove</h1>
        </div>
        <p className="mt-4 text-base leading-relaxed text-ink/80">
          Sign in or create an account to explore more features.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl bg-foam p-1" role="tablist" aria-label="Account">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "sign-in"}
            onClick={() => switchMode("sign-in")}
            className={tabClass(mode === "sign-in")}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={creating}
            onClick={() => switchMode("create")}
            className={tabClass(creating)}
          >
            Create account
          </button>
        </div>

        <form onSubmit={handleSubmit} autoComplete="off" className="mt-5 flex flex-col gap-3">
          <label className="flex flex-col gap-2 text-sm text-ink/80">
            Email
            <input
              type="email"
              name="email"
              value={email}
              autoComplete="off"
              onChange={(event) => setEmail(event.target.value)}
              className="h-11 rounded-2xl border border-line bg-white px-4 text-base text-ink outline-none focus:border-cove"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-ink/80">
            Password
            <input
              type="password"
              name="password"
              value={password}
              autoComplete="off"
              onChange={(event) => setPassword(event.target.value)}
              className="h-11 rounded-2xl border border-line bg-white px-4 text-base text-ink outline-none focus:border-cove"
            />
          </label>
          {creating ? (
            <label className="flex flex-col gap-2 text-sm text-ink/80">
              Confirm password
              <input
                type="password"
                name="confirm-password"
                value={confirm}
                autoComplete="off"
                onChange={(event) => setConfirm(event.target.value)}
                className="h-11 rounded-2xl border border-line bg-white px-4 text-base text-ink outline-none focus:border-cove"
              />
            </label>
          ) : null}
          {error ? (
            <p className="text-sm leading-relaxed text-ink" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-cove px-4 text-base font-medium text-white"
          >
            {creating ? "Create account" : "Sign in"}
          </button>
        </form>
      </div>
      <Link
        to="/help"
        className="mx-auto inline-flex h-11 items-center justify-center rounded-2xl border border-cove px-4 text-base font-medium text-cove"
      >
        Get help
      </Link>
    </div>
  );
}

function tabClass(selected: boolean): string {
  return [
    "inline-flex h-11 items-center justify-center rounded-xl text-base",
    selected ? "bg-white font-semibold text-cove shadow-sm" : "text-ink/70",
  ].join(" ");
}

function CoveMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-12 shrink-0" aria-hidden="true">
      <rect width="48" height="48" rx="14" fill="#1e4f4c" />
      <path
        d="M9 31c6.5-11 12-15 15-15s8.5 4 15 15"
        fill="none"
        stroke="#e4efec"
        strokeWidth="2.75"
        strokeLinecap="round"
      />
      <path
        d="M12 35c7 3.5 17 3.5 24 0"
        fill="none"
        stroke="#f3efe6"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
