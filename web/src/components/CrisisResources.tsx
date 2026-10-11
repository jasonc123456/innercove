import { crisisResources } from "../safety/crisisResources";

function phoneHref(phone: string): string | null {
  if (!/^[0-9+\-().\s]+$/.test(phone)) {
    return null;
  }
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export function CrisisResources() {
  const emergencyHref = phoneHref(crisisResources.emergency.phone);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-base leading-relaxed text-ink">
        not monitored; if you&apos;re in danger call 911 or 988
      </p>
      <p className="text-base font-medium text-ink">
        {crisisResources.emergency.label}:{" "}
        {emergencyHref ? (
          <a className="text-cove underline" href={emergencyHref}>
            {crisisResources.emergency.phone}
          </a>
        ) : (
          crisisResources.emergency.phone
        )}
      </p>
      <p className="text-base leading-relaxed text-ink">
        {crisisResources.emergency.guidance}
      </p>
      <ul className="flex flex-col gap-3">
        {crisisResources.resources.map((resource) => {
          const href = phoneHref(resource.phone);
          return (
            <li key={resource.label} className="flex flex-col gap-1">
              <p className="text-base font-medium text-ink">{resource.label}</p>
              <p className="text-base text-ink">
                {href ? (
                  <a className="text-cove underline" href={href}>
                    {resource.phone}
                  </a>
                ) : (
                  resource.phone
                )}
              </p>
              <p className="text-sm leading-relaxed text-ink/80">{resource.guidance}</p>
            </li>
          );
        })}
      </ul>
      <p className="text-sm leading-relaxed text-ink/80">{crisisResources.note}</p>
    </div>
  );
}
