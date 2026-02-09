# Signal - Quick Setup Guide

## Prerequisites

- Node.js 18+ installed
- Supabase account and project created
- npm or pnpm package manager

## Initial Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Ensure your `.env.local` file has the following:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Anthropic
ANTHROPIC_API_KEY=your_anthropic_api_key

# App
NEXT_PUBLIC_APP_NAME=Signal
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Set Up Supabase Database

1. Open your Supabase project dashboard
2. Navigate to SQL Editor
3. Run the migration file: `supabase/migrations/00001_core_schema.sql`
4. Verify all tables are created with RLS enabled

### 4. Configure Supabase Auth

#### Email/Password Settings:
1. Go to Authentication > Settings
2. Enable "Email Confirmations" if desired
3. Configure email templates (optional)

#### Google OAuth (Optional):
1. Go to Authentication > Providers
2. Enable Google provider
3. Add your Google Client ID and Secret
4. Add authorized redirect URI: `https://[your-project].supabase.co/auth/v1/callback`

#### Site URL Configuration:
1. Go to Authentication > URL Configuration
2. Set Site URL: `http://localhost:3000` (development) or your production URL
3. Add Redirect URLs:
   - `http://localhost:3000/auth/callback`
   - `http://localhost:3000/chat`

### 5. Start Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:3000`

## Testing the Authentication System

### 1. Create an Account

1. Navigate to `http://localhost:3000`
2. You'll be redirected to `/login`
3. Click "Sign up"
4. Fill in the form and accept the data processing consent
5. Submit the form

### 2. Verify Email (if enabled)

1. Check your email for verification link
2. Click the link to verify your account
3. You'll be redirected to the login page

### 3. Sign In

1. Enter your email and password
2. Click "Sign in"
3. You'll be redirected to `/chat`

### 4. Enable MFA

1. Click "Settings" in the sidebar
2. Click "Security"
3. Click "Enable MFA"
4. Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.)
5. Enter the 6-digit code
6. Click "Verify and Enable"

### 5. Test MFA Login

1. Sign out
2. Sign in again
3. You'll be prompted for your MFA code
4. Enter the code from your authenticator app
5. You'll be logged in

## Troubleshooting

### "Invalid login credentials" error

- Verify your Supabase credentials in `.env.local`
- Check that the database migration ran successfully
- Ensure the auth.users trigger is active

### "User not found" after signup

- Check if email confirmation is required
- Verify the `handle_new_auth_user()` trigger is working
- Check Supabase logs for errors

### MFA QR code not showing

- Check browser console for errors
- Verify the `qrcode` package is installed
- Ensure Supabase MFA is enabled in your project settings

### OAuth not working

- Verify Google OAuth credentials
- Check redirect URLs are correct
- Ensure callback route exists at `/auth/callback`

### Middleware redirecting incorrectly

- Clear browser cookies
- Check middleware matcher config
- Verify Supabase URL and anon key

## Project Structure

```
signal/
├── src/
│   ├── app/
│   │   ├── (dashboard)/         # Protected routes
│   │   │   ├── chat/           # Main chat interface
│   │   │   ├── profile/        # User profile
│   │   │   └── settings/       # Settings pages
│   │   ├── login/              # Login page
│   │   ├── signup/             # Signup page
│   │   └── auth/callback/      # OAuth callback
│   ├── components/
│   │   ├── sidebar.tsx         # Navigation
│   │   └── ui/                 # shadcn components
│   └── lib/
│       └── supabase/           # Supabase clients
├── middleware.ts               # Auth middleware
├── supabase/
│   └── migrations/             # Database schema
└── .env.local                  # Environment variables
```

## Next Steps

1. **Implement Chat Interface** - Build the AI chat functionality
2. **Add Financial Profiles** - Create profile management UI
3. **Build Goal Tracking** - Implement goal creation and tracking
4. **Add Session Management** - Implement session limits and timeouts
5. **Create Admin Panel** - Build adviser dashboard (V2)

## Documentation

- [AUTH_IMPLEMENTATION.md](./AUTH_IMPLEMENTATION.md) - Detailed auth documentation
- [PRD Requirements](./REQUIREMENTS.md) - Original requirements (if exists)
- [Supabase Docs](https://supabase.com/docs)

## Support

For issues or questions:
- Check Supabase dashboard logs
- Review browser console errors
- Verify environment variables
- Check database RLS policies
