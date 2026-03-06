# Onboarding API Routes

## `/api/onboarding/chat`

Pre-login conversational onboarding flow.

### Features

- ✅ Unauthenticated (session-based)
- ✅ 5-question hardcoded sequence
- ✅ Claude-powered acknowledgements for goal question
- ✅ Claude-powered final projection
- ✅ Rate limiting (3 sessions/IP/hour)
- ✅ Message limit (20 per session)
- ✅ 7-day TTL for unconverted sessions

### Quick Start

```typescript
// Start new session
const response = await fetch('/api/onboarding/chat', {
  method: 'POST',
  credentials: 'include', // Important: include cookies
})

// Session cookie is automatically set in response

// Submit answer
const response = await fetch('/api/onboarding/chat', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    content: "26–35",
    structured_response: {
      field: "age_range",
      value: "26-35",
      source: "structured_input",
      confidence: 1.0
    }
  })
})

// Check session state
const state = await fetch('/api/onboarding/chat', {
  method: 'GET',
  credentials: 'include',
})
```

### Question Flow

1. **age_range**: How old are you?
2. **employment_type**: What's your work situation?
3. **income_band**: What's your annual income?
4. **super_balance_band**: What's your super balance?
5. **goal_text**: What's your money question? (free text)

### Response Format

**During onboarding**:
```json
{
  "message": {
    "id": "uuid",
    "role": "assistant",
    "content": "Question text",
    "input_request": { ... },
    "created_at": "timestamp"
  }
}
```

**After completion**:
```json
{
  "message": { ... },
  "completed": true
}
```

### Error Codes

- `429`: Rate limited or message limit exceeded
- `404`: Session not found or expired
- `400`: Invalid request (missing content)
- `500`: Server error

### See Also

- [Full Documentation](../../../docs/pre-login-onboarding.md)
- [Conversion Helper](../../../lib/onboarding/conversion.ts)
- [Database Migration](../../../supabase/migrations/00003_pre_login_sessions.sql)
