import { createClient } from '@/lib/supabase/server'

export default async function ChatPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <h1 className="text-2xl font-bold text-slate-900">Chat</h1>
        <p className="text-sm text-slate-600">
          Welcome back, {user?.email}
        </p>
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="text-center">
          <h2 className="text-lg font-medium text-slate-900">
            Chat interface coming soon
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            This is where you'll interact with Signal's AI financial coach
          </p>
        </div>
      </div>
    </div>
  )
}
