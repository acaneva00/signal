# Pre-Login Onboarding Flow

## Overview

The pre-login onboarding flow allows users to interact with Signal and get a personalized financial projection **before** creating an account. This reduces friction in the signup process and provides immediate value.

## Architecture

### API Route: `/api/onboarding/chat`

**Authentication**: Unauthenticated (uses session cookies)

**Methods**:
- `POST`: Send messages and receive responses
- `GET`: Retrieve current session state

### Database Table: `pre_login_sessions`

Stores temporary session data for unauthenticated users:

```sql
CREATE TABLE public.pre_login_sessions (
  id UUID PRIMARY KEY,
  session_data JSONB,           -- Collected onboarding answers
  message_count INTEGER,         -- Tracks messages (max 20)
  ip_address TEXT,               -- For rate limiting
  converted_to_user_id UUID,     -- Set when user signs up
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ         -- 7 days TTL
);
```

## Question Sequence

The onboarding flow asks 5 questions in a fixed order:

| # | Field | Question | Input Type | Options |
|---|-------|----------|------------|---------|
| 1 | `age_range` | "Hey! I'm Signal — your financial companion. To get started, how old are you?" | Single select | 18–25, 26–35, 36–45, 46–55, 56–65, 65+ |
| 2 | `employment_type` | "Nice. And what's your work situation?" | Single select | Full-time, Part-time, Self-employed, Not working, Retired |
| 3 | `income_band` | "Roughly what's your annual income before tax?" | Single select | Under $45K, $45K–$90K, $90K–$135K, $135K–$200K, $200K+ |
| 4 | `super_balance_band` | "Do you know roughly what your super balance is?" | Single select | Under $50K, $50K–$150K, $150K–$400K, $400K–$800K, $800K+, No idea |
| 5 | `goal_text` | "Last one — what's the money question that's on your mind?" | Free text | Open input |

### Transition Messages

Between each question, Signal provides a brief acknowledgement:

- **After Q1 (age)**: "Great — that helps me calibrate things for you."
- **After Q2 (employment)**: "Got it. That affects a few things like super contributions and tax offsets."
- **After Q3 (income)**: "Thanks — that's one of the most important inputs for projections."
- **After Q4 (super)**: 
  - Normal: "Perfect. Even a rough number is really useful."
  - If "No idea": "No worries — lots of people don't. I'll use some reasonable estimates and we can refine later."
- **After Q5 (goal)**: Uses Claude to generate a personalized acknowledgement

### Final Response

After all 5 questions are answered, Signal:
1. Uses Claude to generate a personalized projection based on the user's inputs
2. Includes a clear call-to-action to sign up
3. Returns `completed: true` in the response

## Rate Limiting

**Sessions**: 3 new sessions per IP per hour
- Enforced via Supabase RPC function: `check_session_rate_limit(ip TEXT)`
- Returns HTTP 429 if limit exceeded

**Messages**: Max 20 messages per session
- Enforced in the API route
- Returns HTTP 429 if limit exceeded

## Session Management

### Cookie: `pre_login_session_id`

- **Type**: httpOnly
- **Secure**: true in production
- **SameSite**: lax
- **Max Age**: 7 days
- **Path**: /

### Session Lifecycle

1. **Creation**: First request without cookie → new session created
2. **Active**: Subsequent requests update session_data
3. **Conversion**: When user signs up → data migrated to user account
4. **Expiry**: After 7 days (unless converted)

## Conversion Flow (User Signup)

When a user signs up after completing onboarding, use the `convertPreLoginSession` helper:

```typescript
import { convertPreLoginSession } from '@/lib/onboarding/conversion'

// In your signup route
const sessionId = getPreLoginSessionId(request.headers.get('cookie'))

if (sessionId) {
  await convertPreLoginSession(userId, sessionId)
}
```

### What Happens During Conversion:

1. **Financial Profile**: Created with band midpoints
   - `age_range` → numeric age (midpoint)
   - `income_band` → annual_income (midpoint)
   - `super_balance_band` → super_balance (midpoint or estimate)
   - `employment_type` → mapped to full text
   - Confidence: 0.6
   - Source: 'pre_login_onboarding'

2. **Goal**: Saved to goals table with status 'active'

3. **Session**: Marked as converted (prevents TTL deletion)

4. **Conversation History**: (Future) Copy to user's messages table with channel='pre_login'

### Band Midpoints

```typescript
const BAND_MIDPOINTS = {
  age_range: {
    '18-25': 21.5,
    '26-35': 30.5,
    '36-45': 40.5,
    '46-55': 50.5,
    '56-65': 60.5,
    '65+': 70,
  },
  income_band: {
    'under_45k': 30000,
    '45k_90k': 67500,
    '90k_135k': 112500,
    '135k_200k': 167500,
    '200k_plus': 250000,
  },
  super_balance_band: {
    'under_50k': 25000,
    '50k_150k': 100000,
    '150k_400k': 275000,
    '400k_800k': 600000,
    '800k_plus': 1000000,
    'no_idea': null, // Uses age-based estimate
  },
}
```

## API Usage

### Create New Session (First Request)

**Request**:
```http
POST /api/onboarding/chat
Content-Type: application/json

(No body or cookie required)
```

**Response**:
```json
{
  "message": {
    "id": "uuid",
    "role": "assistant",
    "content": "Hey! I'm Signal — your financial companion. To get started, how old are you?",
    "input_request": {
      "type": "single_select",
      "field": "age_range",
      "required": true,
      "options": [
        { "label": "18–25", "value": "18-25" },
        ...
      ]
    },
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

**Headers**:
```http
Set-Cookie: pre_login_session_id=<uuid>; HttpOnly; Secure; SameSite=Lax; Max-Age=604800; Path=/
```

### Submit Answer

**Request**:
```http
POST /api/onboarding/chat
Cookie: pre_login_session_id=<uuid>
Content-Type: application/json

{
  "content": "26–35",
  "structured_response": {
    "field": "age_range",
    "value": "26-35",
    "source": "structured_input",
    "confidence": 1.0
  }
}
```

**Response**:
```json
{
  "message": {
    "id": "uuid",
    "role": "assistant",
    "content": "Great — that helps me calibrate things for you.\n\nNice. And what's your work situation?",
    "input_request": {
      "type": "single_select",
      "field": "employment_type",
      ...
    },
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

### Final Response (All Questions Answered)

**Response**:
```json
{
  "message": {
    "id": "uuid",
    "role": "assistant",
    "content": "<Claude-generated projection with signup CTA>",
    "created_at": "2024-01-01T00:00:00Z"
  },
  "completed": true
}
```

### Check Session State

**Request**:
```http
GET /api/onboarding/chat
Cookie: pre_login_session_id=<uuid>
```

**Response**:
```json
{
  "session_data": {
    "age_range": "26-35",
    "employment_type": "full_time",
    "income_band": "90k_135k"
  },
  "message_count": 6,
  "next_question": "super_balance_band",
  "completed": false
}
```

## Error Responses

### 429 Too Many Requests (Rate Limited)
```json
{
  "error": "Too many sessions created. Please try again later."
}
```

### 429 Too Many Requests (Message Limit)
```json
{
  "error": "Message limit reached for this session"
}
```

### 404 Not Found (Invalid Session)
```json
{
  "error": "Session not found or expired"
}
```

### 400 Bad Request (Missing Content)
```json
{
  "error": "Content is required"
}
```

## Maintenance

### Cleanup Expired Sessions

Run periodically via cron or manual trigger:

```sql
SELECT public.cleanup_expired_pre_login_sessions();
```

This removes sessions that:
- Have expired (> 7 days old)
- Have NOT been converted to user accounts

### Monitoring

Key metrics to track:
- Sessions created per day
- Completion rate (% reaching question 5)
- Conversion rate (% signing up after completion)
- Average time to complete
- Rate limit hits

### Testing

```typescript
// Test rate limiting
// Create 3 sessions from same IP - 4th should fail

// Test message limit
// Send 20 messages - 21st should fail

// Test session expiry
// Create session, wait 7 days, attempt to use - should fail

// Test conversion
// Complete onboarding, sign up, verify data migrated
```

## Security Considerations

1. **No PII in sessions**: Only band/range data, not exact values
2. **httpOnly cookies**: Cannot be accessed by JavaScript
3. **Rate limiting**: Prevents abuse
4. **TTL cleanup**: Removes stale data automatically
5. **IP tracking**: For rate limiting only, not stored with user account

## Frontend Integration

The frontend should:

1. **Check for existing session** on page load (GET request)
2. **Display appropriate UI** based on session state
3. **Handle structured responses** correctly
4. **Show completion state** when all questions answered
5. **Preserve session** through signup flow
6. **Call conversion helper** after successful signup

Example React hook:

```typescript
function useOnboardingSession() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    fetch('/api/onboarding/chat')
      .then(res => res.json())
      .then(data => {
        setSession(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])
  
  const sendMessage = async (content, structuredResponse) => {
    const res = await fetch('/api/onboarding/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, structured_response: structuredResponse }),
    })
    
    return res.json()
  }
  
  return { session, loading, sendMessage }
}
```

## Future Enhancements

- [ ] Store conversation history in messages table with channel='pre_login'
- [ ] Allow users to resume onboarding after signing up
- [ ] Add analytics tracking for each step
- [ ] A/B test different question ordering
- [ ] Add optional questions based on answers (branching logic)
- [ ] Support multiple onboarding flows (investor vs saver)
