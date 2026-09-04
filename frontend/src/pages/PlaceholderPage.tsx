interface PlaceholderPageProps {
  title: string
  note?: string
}

/** Temporary stand-in for pages built in later phases. */
export function PlaceholderPage({ title, note }: PlaceholderPageProps) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
      <p className="mt-2 max-w-prose text-sm text-slate-500">
        {note ?? 'Wired up in an upcoming phase — the page spec lives in frontend.md.'}
      </p>
    </div>
  )
}
