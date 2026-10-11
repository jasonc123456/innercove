import { Link } from "react-router-dom";
import { CrisisResources } from "./CrisisResources";

export function CrisisCard() {
  return (
    <section
      className="mt-3 flex flex-col gap-3 rounded-2xl border border-line bg-paper px-4 py-3"
      aria-label="Crisis help"
    >
      <CrisisResources />
      <Link
        to="/help?note=1"
        className="inline-flex h-11 items-center justify-center rounded-2xl bg-cove px-4 text-base font-medium text-white"
      >
        Save a support note
      </Link>
    </section>
  );
}
