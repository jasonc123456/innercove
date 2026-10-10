import { useState, type FormEvent } from "react";
import { useAppSession } from "../session/AppSession";

export function SetupPage() {
  const { completeSetup } = useAppSession();
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextError = completeSetup(passphrase, confirm);
    if (nextError) {
      setError(nextError);
      return;
    }
    setPassphrase("");
    setConfirm("");
    setError(null);
  }

  return (
    <form
      onSubmit={handleSubmit}
      autoComplete="off"
      className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4"
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-lg font-semibold leading-tight tracking-tight text-cove">
          Set a passphrase
        </h1>
        <p className="text-base text-ink/80">
          Choose a passphrase for this visit. It is not saved, and this screen
          does not encrypt a diary.
        </p>
        <p className="text-base text-ink/80">
          If you forget a passphrase on the real diary, it cannot be recovered.
        </p>
      </div>
      <label className="flex flex-col gap-2 text-sm text-ink/80">
        Passphrase
        <input
          type="password"
          name="passphrase"
          autoComplete="off"
          spellCheck={false}
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
          className="h-11 rounded-2xl border border-line bg-white px-4 text-base text-ink outline-none focus:border-cove"
        />
      </label>
      <label className="flex flex-col gap-2 text-sm text-ink/80">
        Confirm passphrase
        <input
          type="password"
          name="confirm-passphrase"
          autoComplete="off"
          spellCheck={false}
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          className="h-11 rounded-2xl border border-line bg-white px-4 text-base text-ink outline-none focus:border-cove"
        />
      </label>
      {passphrase.length > 0 && passphrase.length < 8 ? (
        <p className="text-sm text-ink/70" role="status">
          Use at least 8 characters.
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-ink/80" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        className="inline-flex h-11 items-center justify-center rounded-2xl bg-cove px-4 text-base font-medium text-white"
      >
        Continue
      </button>
    </form>
  );
}
