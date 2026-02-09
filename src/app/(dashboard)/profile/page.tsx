import { createClient } from '@/lib/supabase/server'

export default async function ProfilePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Fetch user profile from public.users table
  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user?.id)
    .single()

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <h1 className="text-2xl font-bold text-slate-900">Profile</h1>
        <p className="text-sm text-slate-600">
          Manage your personal information
        </p>
      </div>
      <div className="p-6">
        <div className="max-w-2xl space-y-6">
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              Account Information
            </h2>
            <dl className="space-y-4">
              <div>
                <dt className="text-sm font-medium text-slate-500">Email</dt>
                <dd className="mt-1 text-sm text-slate-900">{user?.email}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-slate-500">Display Name</dt>
                <dd className="mt-1 text-sm text-slate-900">
                  {profile?.display_name || 'Not set'}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-slate-500">
                  Multi-Factor Authentication
                </dt>
                <dd className="mt-1 text-sm text-slate-900">
                  {profile?.mfa_enabled ? (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                      Enabled
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
                      Not enabled
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-slate-500">Subscription Tier</dt>
                <dd className="mt-1 text-sm text-slate-900">
                  {profile?.subscription_tier || 'Free'}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}
