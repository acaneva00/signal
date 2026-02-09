'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [consentAccepted, setConsentAccepted] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!consentAccepted) {
      setError('You must accept the data processing consent to continue.')
      return
    }

    if (password.length < 10) {
      setError('Password must be at least 10 characters long.')
      return
    }

    setLoading(true)

    const supabase = createClient()

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
        },
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // Redirect to login or show success message
    router.push('/login?message=Please check your email to verify your account')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Create an account</CardTitle>
          <CardDescription>
            Enter your details to get started with Signal
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                type="text"
                placeholder="John Doe"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                minLength={10}
              />
              <p className="text-xs text-slate-500">
                Minimum 10 characters. No common passwords.
              </p>
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-900">
                Data Processing Consent
              </h3>
              <p className="mb-3 text-xs text-slate-600">
                By creating an account, you consent to Signal processing your personal and
                financial information to provide financial coaching services. Your data will be:
              </p>
              <ul className="mb-3 space-y-1 text-xs text-slate-600">
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>Encrypted at rest and in transit</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>Used only for providing and improving our services</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>Never shared with third parties without your explicit consent</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>Stored in Australia in compliance with Australian privacy laws</span>
                </li>
              </ul>
              <div className="flex items-start space-x-2">
                <input
                  type="checkbox"
                  id="consent"
                  checked={consentAccepted}
                  onChange={(e) => setConsentAccepted(e.target.checked)}
                  disabled={loading}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="consent" className="text-xs text-slate-700">
                  I consent to Signal processing my personal and financial data as described
                  above.
                </label>
              </div>
            </div>

            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading || !consentAccepted}>
              {loading ? 'Creating account...' : 'Create account'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex justify-center">
          <p className="text-sm text-slate-600">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-blue-600 hover:text-blue-500">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}
