'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Shield, Key, Smartphone, AlertCircle } from 'lucide-react'

export default function SecuritySettingsPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [mfaEnabled, setMfaEnabled] = useState(false)
  const [showMfaSetup, setShowMfaSetup] = useState(false)
  const [qrCode, setQrCode] = useState('')
  const [secret, setSecret] = useState('')
  const [verifyCode, setVerifyCode] = useState('')

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  useEffect(() => {
    checkMfaStatus()
  }, [])

  const checkMfaStatus = async () => {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      const factors = await supabase.auth.mfa.listFactors()
      setMfaEnabled((factors.data?.totp?.length ?? 0) > 0)
    }
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match')
      return
    }

    if (newPassword.length < 10) {
      setError('Password must be at least 10 characters long')
      return
    }

    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (error) {
      setError(error.message)
    } else {
      setSuccess('Password updated successfully. All sessions have been logged out.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    }

    setLoading(false)
  }

  const startMfaEnrollment = async () => {
    setError('')
    setSuccess('')
    setLoading(true)

    const supabase = createClient()

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setQrCode(data.totp.qr_code)
    setSecret(data.totp.secret)
    setShowMfaSetup(true)
    setLoading(false)
  }

  const verifyMfaEnrollment = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    const supabase = createClient()

    const factors = await supabase.auth.mfa.listFactors()
    const factorId = factors.data?.totp[0]?.id

    if (!factorId) {
      setError('No MFA enrollment found')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: verifyCode,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // Update user profile to reflect MFA is enabled
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      await supabase.from('users').update({ mfa_enabled: true }).eq('id', user.id)
    }

    setSuccess('Multi-factor authentication enabled successfully!')
    setShowMfaSetup(false)
    setMfaEnabled(true)
    setVerifyCode('')
    setLoading(false)
  }

  const disableMfa = async () => {
    if (!confirm('Are you sure you want to disable multi-factor authentication?')) {
      return
    }

    setError('')
    setSuccess('')
    setLoading(true)

    const supabase = createClient()
    const factors = await supabase.auth.mfa.listFactors()
    const factorId = factors.data?.totp[0]?.id

    if (!factorId) {
      setError('No MFA factor found')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.mfa.unenroll({ factorId })

    if (error) {
      setError(error.message)
    } else {
      // Update user profile
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        await supabase.from('users').update({ mfa_enabled: false }).eq('id', user.id)
      }

      setSuccess('Multi-factor authentication disabled')
      setMfaEnabled(false)
    }

    setLoading(false)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <h1 className="text-2xl font-bold text-slate-900">Security Settings</h1>
        <p className="text-sm text-slate-600">
          Manage your password and multi-factor authentication
        </p>
      </div>

      <div className="p-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {error && (
            <div className="flex items-center gap-2 rounded-md bg-red-50 p-4 text-sm text-red-800">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 rounded-md bg-green-50 p-4 text-sm text-green-800">
              <Shield className="h-4 w-4" />
              {success}
            </div>
          )}

          {/* Password Change */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Key className="h-5 w-5 text-slate-600" />
                <CardTitle>Change Password</CardTitle>
              </div>
              <CardDescription>
                Update your password. Minimum 10 characters, no common passwords (NIST 800-63B
                guidance).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={10}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={10}
                    disabled={loading}
                  />
                </div>
                <Button type="submit" disabled={loading}>
                  {loading ? 'Updating...' : 'Update Password'}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Multi-Factor Authentication */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-slate-600" />
                <CardTitle>Multi-Factor Authentication (MFA)</CardTitle>
              </div>
              <CardDescription>
                Add an extra layer of security using an authenticator app (Google Authenticator,
                Authy, etc.)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!mfaEnabled && !showMfaSetup && (
                <div>
                  <p className="mb-4 text-sm text-slate-600">
                    MFA is currently disabled. Enable it to secure your account with a second
                    factor.
                  </p>
                  <Button onClick={startMfaEnrollment} disabled={loading}>
                    Enable MFA
                  </Button>
                </div>
              )}

              {mfaEnabled && !showMfaSetup && (
                <div>
                  <div className="mb-4 flex items-center gap-2 rounded-md bg-green-50 p-3">
                    <Shield className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium text-green-800">MFA is enabled</span>
                  </div>
                  <Button variant="destructive" onClick={disableMfa} disabled={loading}>
                    Disable MFA
                  </Button>
                </div>
              )}

              {showMfaSetup && (
                <div className="space-y-4">
                  <div className="rounded-md border border-slate-200 p-4">
                    <h3 className="mb-3 font-semibold text-slate-900">Step 1: Scan QR Code</h3>
                    <p className="mb-4 text-sm text-slate-600">
                      Open your authenticator app and scan this QR code:
                    </p>
                    {qrCode && (
                      <div className="mb-4 flex justify-center">
                        <img src={qrCode} alt="MFA QR Code" className="h-48 w-48" />
                      </div>
                    )}
                    <div className="rounded-md bg-slate-50 p-3">
                      <p className="mb-1 text-xs font-medium text-slate-700">
                        Or enter this code manually:
                      </p>
                      <code className="text-sm font-mono text-slate-900">{secret}</code>
                    </div>
                  </div>

                  <form onSubmit={verifyMfaEnrollment} className="space-y-4">
                    <div className="rounded-md border border-slate-200 p-4">
                      <h3 className="mb-3 font-semibold text-slate-900">
                        Step 2: Verify Setup
                      </h3>
                      <p className="mb-4 text-sm text-slate-600">
                        Enter the 6-digit code from your authenticator app:
                      </p>
                      <div className="space-y-2">
                        <Label htmlFor="verifyCode">Verification Code</Label>
                        <Input
                          id="verifyCode"
                          type="text"
                          value={verifyCode}
                          onChange={(e) => setVerifyCode(e.target.value)}
                          placeholder="000000"
                          maxLength={6}
                          pattern="[0-9]{6}"
                          required
                          disabled={loading}
                          className="font-mono text-lg tracking-wider"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" disabled={loading}>
                        {loading ? 'Verifying...' : 'Verify and Enable'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowMfaSetup(false)}
                        disabled={loading}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Security Tips */}
          <Card>
            <CardHeader>
              <CardTitle>Security Best Practices</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-slate-600">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-slate-400">•</span>
                  <span>Use a unique password that you don't use on other websites</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-slate-400">•</span>
                  <span>Enable multi-factor authentication for enhanced security</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-slate-400">•</span>
                  <span>
                    Sessions expire after 24 hours, or 30 minutes of inactivity on Restricted data
                    screens
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-slate-400">•</span>
                  <span>Maximum 3 active sessions allowed per account</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-slate-400">•</span>
                  <span>All sessions are logged out when you change your password</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
