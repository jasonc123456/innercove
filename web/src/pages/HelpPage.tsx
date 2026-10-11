import { useSearchParams } from "react-router-dom";
import { CrisisResources } from "../components/CrisisResources";
import { SupportNoteForm } from "../components/SupportNoteForm";

export function HelpPage() {
  const [params, setParams] = useSearchParams();
  const writing = params.get("note") === "1";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
      <h1 className="text-lg font-semibold leading-tight tracking-tight text-cove">
        Get help
      </h1>
      {writing ? (
        <SupportNoteForm
          onClose={() => {
            setParams({});
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setParams({ note: "1" })}
          className="inline-flex h-11 items-center justify-center rounded-2xl bg-cove px-4 text-base font-medium text-white"
        >
          Save a support note
        </button>
      )}
      <CrisisResources />
    </div>
  );
}
