import { useState, type FormEvent } from "react";
import { useAppSession } from "../session/AppSession";

export function UnlockPage() {
  const { completeUnlock } = useAppSession();
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextError = completeUnlock(passphrase);
    if (nextError) {
      setError(nextError);
      return;
    }
    setPassphrase("");
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
          Unlock
        </h1>
        <p className="text-base text-ink/80">
          This does not unlock or encrypt a database. Any passphrase is
          accepted for this practice screen and then discarded.
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
