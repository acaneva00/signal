# Signal Authentication Implementation

## Overview

This document describes the authentication system implemented for Signal using Supabase Auth with Next.js App Router and `@supabase/ssr`.

## Implementation Status

✅ **Completed V1 Features:**

1. **Email/Password Authentication** - Supabase Auth with bcrypt password hashing
2. **Multi-Factor Authentication (MFA)** - TOTP (Time-based One-Time Password) using authenticator apps
3. **OAuth (Google)** - Optional convenience login via Google provider
4. **Session Management** - Automatic session handling via Supabase Auth
5. **Password Policy** - Minimum 10 characters (NIST 800-63B guidance)
6. **Protected Routes** - Middleware-based authentication protection
7. **Data Processing Consent** - Explicit consent notice during signup

## Project Structure

```
src/
├── app/
│   ├── (dashboard)/              # Protected routes group
│   │   ├── layout.tsx            # Dashboard layout with sidebar
│   │   ├── chat/                 # Chat interface (placeholder)
│   │   ├── profile/              # User profile page
│   │   └── settings/
│   │       ├── page.tsx          # Settings menu
│   │       └── security/         # Security settings (MFA, password)
│   ├── login/                    # Login page
│   ├── signup/                   # Signup page with consent
│   ├── auth/
│   │   └── callback/             # OAuth callback handler
│   └── page.tsx                  # Root redirect
├── components/
│   ├── sidebar.tsx               # Navigation sidebar
│   └── ui/                       # shadcn/ui components
├── lib/
│   └── supabase/
│       ├── client.ts             # Browser client
│       ├── server.ts             # Server client
│       └── middleware.ts         # Middleware client
└── middleware.ts                 # Auth protection middleware
```

## Key Features

### 1. Authentication Pages

#### Login (`/login`)
- Email/password authentication
- Google OAuth sign-in
- Error handling and loading states
- Link to signup page

#### Signup (`/signup`)
- Email/password registration
- Display name collection
- Data processing consent checkbox with detailed privacy notice
- Password policy enforcement (minimum 10 characters)
- Email verification flow

#### OAuth Callback (`/auth/callback`)
- Handles OAuth provider callbacks (Google)
- Session exchange
- Redirect to intended destination

### 2. Protected Dashboard

All routes under `(dashboard)` are automatically protected by middleware:
- `/chat` - Main chat interface
- `/profile` - User profile and account information
- `/settings` - Settings menu
- `/settings/security` - Security settings with MFA

### 3. Multi-Factor Authentication

Implemented in `/settings/security`:
- **Enrollment Flow:**
  1. User clicks "Enable MFA"
  2. QR code generated for scanning with authenticator app
  3. Manual secret key provided as backup
  4. 6-digit verification code required to complete enrollment
  5. Profile updated with `mfa_enabled: true`

- **Supported Apps:**
  - Google Authenticator
  - Authy
  - Microsoft Authenticator
  - Any TOTP-compatible app

- **Unenrollment:**
  - Confirmation dialog required
  - All TOTP factors removed
  - Profile updated with `mfa_enabled: false`

### 4. Security Settings

Located at `/settings/security`:
- Password change form with validation
- MFA enrollment/unenrollment
- Security best practices display
- Session information

**Password Requirements:**
- Minimum 10 characters
- No common passwords (handled by Supabase)
- No complexity requirements (NIST 800-63B guidance)
- All sessions invalidated on password change

### 5. Middleware Protection

The `middleware.ts` file:
- Intercepts all requests
- Verifies user authentication status
- Refreshes sessions automatically
- Redirects unauthenticated users to `/login`
- Excludes public routes: `/login`, `/signup`, static assets

### 6. Supabase Integration

Three client configurations:
1. **Server Client** (`lib/supabase/server.ts`) - For Server Components and Route Handlers
2. **Browser Client** (`lib/supabase/client.ts`) - For Client Components
3. **Middleware Client** (`lib/supabase/middleware.ts`) - For middleware session handling

## Environment Variables

Required in `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Database Schema

The auth system uses the following tables:

### `auth.users` (Supabase managed)
- Handles authentication credentials
- Email verification
- Password hashing with bcrypt
- MFA factors (TOTP)

### `public.users` (Application table)
```sql
- id (UUID, references auth.users.id)
- email (TEXT)
- display_name (TEXT)
- subscription_tier (TEXT)
- profile_completeness (NUMERIC)
- mfa_enabled (BOOLEAN)
- created_at (TIMESTAMPTZ)
- updated_at (TIMESTAMPTZ)
```

**Row Level Security (RLS):**
- Users can only access their own records
- Automatic sync from auth.users via trigger

## OAuth Configuration

### Google OAuth Setup

1. **Supabase Dashboard:**
   - Navigate to Authentication > Providers
   - Enable Google provider
   - Add Google Client ID and Secret

2. **Google Cloud Console:**
   - Create OAuth 2.0 credentials
   - Add authorized redirect URI: `https://[your-project].supabase.co/auth/v1/callback`

3. **Callback URL:**
   - After OAuth: `[your-app]/auth/callback`
   - Success redirect: `/chat`

## Session Management

### Current Implementation:
- Session handling via Supabase Auth
- Automatic refresh via middleware
- Cookie-based session storage

### To Be Implemented (V1 Requirements):
- [ ] 24-hour session lifetime enforcement
- [ ] 30-minute idle timeout for Restricted data screens
- [ ] Maximum 3 concurrent sessions per user
- [ ] New session invalidates oldest
- [ ] Account lockout after 5 failed attempts (15-minute lockout)
- [ ] Exponential backoff on repeated lockouts

## Testing Checklist

### Authentication Flow:
- [ ] Signup with email/password
- [ ] Email verification
- [ ] Login with credentials
- [ ] Login with Google OAuth
- [ ] Logout functionality
- [ ] Protected route redirection
- [ ] Session persistence across page refreshes

### MFA Flow:
- [ ] Enroll MFA with QR code
- [ ] Enroll MFA with manual secret
- [ ] Verify MFA code
- [ ] Login with MFA enabled
- [ ] Unenroll MFA
- [ ] Profile reflects MFA status

### Security:
- [ ] Password minimum length enforcement
- [ ] Invalid credentials error handling
- [ ] Rate limiting (Supabase default)
- [ ] CSRF protection (automatic via cookies)

## Known Limitations & Next Steps

### V1 Remaining Work:
1. **Session Management:**
   - Implement session lifetime limits
   - Add idle timeout detection
   - Enforce concurrent session limits
   - Build session management UI

2. **Account Lockout:**
   - Track failed login attempts
   - Implement lockout logic
   - Add exponential backoff

3. **Password Policy:**
   - Add common password checking
   - Integrate with password breach database (e.g., HaveIBeenPwned)

### V2 Features (Adviser Launch):
- [ ] Adviser role designation
- [ ] MFA mandatory for adviser accounts
- [ ] Email verification requirement for advisers
- [ ] ASIC register check integration
- [ ] Escalated permissions for client data access

## Deployment Notes

1. **Environment Variables:**
   - Set all Supabase credentials in production
   - Update `NEXT_PUBLIC_APP_URL` for OAuth callbacks

2. **Supabase Configuration:**
   - Configure email templates
   - Set up email provider (SMTP)
   - Enable required auth providers
   - Configure redirect URLs

3. **Database Migrations:**
   - Run `00001_core_schema.sql` in Supabase SQL Editor
   - Verify RLS policies are active
   - Test auth.users → public.users trigger

## Support & Troubleshooting

### Common Issues:

**"User not found" after signup:**
- Check email verification settings
- Verify auth.users trigger is working
- Confirm public.users table has RLS policies

**MFA enrollment fails:**
- Ensure time is synchronized on server and client
- Verify TOTP codes are generated with correct timestamp
- Check Supabase auth settings allow MFA

**OAuth redirect fails:**
- Verify callback URL matches Supabase configuration
- Check OAuth provider credentials
- Ensure redirect URL is whitelisted

## References

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [@supabase/ssr Documentation](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [NIST 800-63B Digital Identity Guidelines](https://pages.nist.gov/800-63-3/sp800-63b.html)
- [Next.js Middleware](https://nextjs.org/docs/app/building-your-application/routing/middleware)
