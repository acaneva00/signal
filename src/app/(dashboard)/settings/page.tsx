import Link from 'next/link'
import { Shield, User, Bell } from 'lucide-react'

const settingsLinks = [
  {
    name: 'Security',
    description: 'Manage your password and multi-factor authentication',
    href: '/settings/security',
    icon: Shield,
  },
  {
    name: 'Account',
    description: 'Update your profile and account preferences',
    href: '/settings/account',
    icon: User,
  },
  {
    name: 'Notifications',
    description: 'Configure email and push notifications',
    href: '/settings/notifications',
    icon: Bell,
  },
]

export default function SettingsPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-600">
          Manage your account settings and preferences
        </p>
      </div>
      <div className="p-6">
        <div className="max-w-2xl space-y-4">
          {settingsLinks.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              className="block rounded-lg border border-slate-200 bg-white p-6 transition-colors hover:bg-slate-50"
            >
              <div className="flex items-start">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
                  <link.icon className="h-5 w-5 text-slate-600" />
                </div>
                <div className="ml-4">
                  <h3 className="text-base font-semibold text-slate-900">
                    {link.name}
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {link.description}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
