'use client'

export function EmptyCanvas() {
  return (
    <div className="flex items-center justify-center h-full p-6">
      <div className="text-center">
        <div className="w-20 h-20 mx-auto mb-4 rounded-xl bg-slate-100 flex items-center justify-center">
          <svg
            className="w-10 h-10 text-slate-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
            />
          </svg>
        </div>
        <p className="text-slate-500 font-medium text-sm">Visualisations</p>
        <p className="text-xs text-slate-400 mt-1 max-w-[200px] mx-auto">
          Ask a financial question to see projections and charts here
        </p>
      </div>
    </div>
  )
}
