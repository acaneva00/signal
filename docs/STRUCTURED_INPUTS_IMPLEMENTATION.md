# Structured Inputs Implementation Summary

## Overview

This document summarizes the implementation of structured inputs support for the `/api/messages` endpoint, enabling the agent to request specific data types and automatically store validated responses in the user's financial profile.

## Changes Made

### 1. Database Migration

**File:** `supabase/migrations/00002_structured_inputs.sql`

Added three new columns to the `messages` table:

```sql
-- Channel identifier (defaults to 'web')
ALTER TABLE public.messages ADD COLUMN channel TEXT DEFAULT 'web';

-- Stores structured input data from user responses
ALTER TABLE public.messages ADD COLUMN structured_response JSONB;

-- Stores structured input requests from assistant messages
ALTER TABLE public.messages ADD COLUMN input_request JSONB;
```

**To apply this migration:**

```bash
# If using Supabase CLI
supabase db push

# Or run the SQL directly in Supabase SQL Editor
```

### 2. Type Definitions

**File:** `src/types/agent.ts`

Created TypeScript interfaces for:
- `InputRequest` - Structure for agent input requests
- `StructuredResponse` - Structure for user structured responses
- `AgentOutput` - Extended agent output schema
- `MessageRequest` - Message request body type
- `UserMessageWithStructuredInput` - Complete user message with structured data

### 3. API Route Updates

**File:** `src/app/api/messages/route.ts`

#### POST Endpoint Changes

1. **Accepts new optional fields:**
   - `structured_response` - For user messages with structured input
   - `input_request` - For assistant messages requesting structured input

2. **Financial Profile Updates:**
   - When `structured_response` is present in a user message:
     - Fetches or creates financial profile for the user
     - Updates `profile_data` JSONB field with the new value
     - Handles both new profile creation and existing profile updates

3. **Message Storage:**
   - All messages include `channel: 'web'`
   - User messages store `structured_response` if present
   - Assistant messages store `input_request` if present

4. **Error Handling:**
   - Validates required fields (`content`, `role`)
   - Handles profile creation/update errors
   - Returns appropriate HTTP status codes

#### GET Endpoint

No changes needed - automatically returns new fields via `SELECT *`

### 4. Documentation

Created comprehensive documentation files:

1. **API_STRUCTURED_INPUTS.md** - Complete API documentation
   - Request/response formats
   - Behavior specifications
   - Error handling
   - Security considerations
   - Type definitions

2. **STRUCTURED_INPUTS_EXAMPLES.md** - Usage examples
   - Single select input example
   - Multi-select with free text example
   - Numeric input with range example
   - Complete chat flow example
   - React component examples
   - Testing checklist

3. **STRUCTURED_INPUTS_IMPLEMENTATION.md** - This file
   - Implementation summary
   - Migration instructions
   - Testing procedures
   - Deployment checklist

## Data Flow

### Incoming Structured Response (User → API)

```
1. User selects "Own (with mortgage)" from UI
   ↓
2. Frontend sends:
   {
     content: "Own (with mortgage)",
     role: "user",
     structured_response: {
       field: "housing_status",
       value: "own_mortgage",
       source: "structured_input",
       confidence: 1.0
     }
   }
   ↓
3. API validates and processes:
   - Authenticates user
   - Gets/creates conversation
   - Updates financial_profiles.profile_data.housing_status = "own_mortgage"
   - Stores message with structured_response
   - Sets channel = "web"
   ↓
4. Returns saved message object
```

### Outgoing Input Request (API → User)

```
1. Agent generates response with input_request
   ↓
2. API receives:
   {
     content: "What is your housing situation?",
     role: "assistant",
     input_request: {
       type: "single_select",
       options: [...],
       field: "housing_status",
       required: true
     }
   }
   ↓
3. API stores message with input_request
   ↓
4. Frontend receives and renders appropriate UI
```

## Testing

### Manual Testing Steps

1. **Test Structured Input Storage**

```bash
# Send user message with structured response
curl -X POST http://localhost:3000/api/messages \
  -H "Content-Type: application/json" \
  -H "Cookie: your-session-cookie" \
  -d '{
    "content": "Own (with mortgage)",
    "role": "user",
    "structured_response": {
      "field": "housing_status",
      "value": "own_mortgage",
      "source": "structured_input",
      "confidence": 1.0
    }
  }'

# Verify financial_profiles was updated
# Check Supabase dashboard or query:
SELECT profile_data FROM financial_profiles WHERE user_id = 'your-user-id';
```

2. **Test Input Request Storage**

```bash
# Send assistant message with input request
curl -X POST http://localhost:3000/api/messages \
  -H "Content-Type: application/json" \
  -H "Cookie: your-session-cookie" \
  -d '{
    "content": "What is your housing situation?",
    "role": "assistant",
    "input_request": {
      "type": "single_select",
      "options": [
        {"label": "Own (outright)", "value": "own_outright"},
        {"label": "Own (with mortgage)", "value": "own_mortgage"}
      ],
      "field": "housing_status",
      "required": true
    }
  }'

# Retrieve messages and verify input_request is present
curl http://localhost:3000/api/messages \
  -H "Cookie: your-session-cookie"
```

3. **Test Channel Field**

```bash
# Send any message and verify channel = 'web'
curl -X POST http://localhost:3000/api/messages \
  -H "Content-Type: application/json" \
  -H "Cookie: your-session-cookie" \
  -d '{
    "content": "Test message",
    "role": "user"
  }'

# Check response includes channel: "web"
```

### Automated Testing

Create test file: `src/app/api/messages/__tests__/route.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { POST, GET } from '../route'

describe('/api/messages', () => {
  describe('POST', () => {
    it('should store structured_response and update financial profile', async () => {
      // Test implementation
    })

    it('should store input_request on assistant messages', async () => {
      // Test implementation
    })

    it('should set channel to "web" on all messages', async () => {
      // Test implementation
    })

    it('should create financial profile if not exists', async () => {
      // Test implementation
    })

    it('should update existing financial profile', async () => {
      // Test implementation
    })

    it('should return 400 if content or role missing', async () => {
      // Test implementation
    })

    it('should return 401 if not authenticated', async () => {
      // Test implementation
    })
  })

  describe('GET', () => {
    it('should return messages with new fields', async () => {
      // Test implementation
    })
  })
})
```

## Deployment Checklist

- [ ] Review and test database migration locally
- [ ] Apply migration to staging database
- [ ] Test API endpoints in staging environment
- [ ] Verify financial profile updates work correctly
- [ ] Test all input types (single_select, multi_select, numeric_input)
- [ ] Verify RLS policies still work correctly
- [ ] Test error handling scenarios
- [ ] Review and update frontend components (if needed)
- [ ] Update API documentation
- [ ] Train team on new features
- [ ] Apply migration to production database
- [ ] Deploy updated API code
- [ ] Monitor for errors in production
- [ ] Verify metrics and logging

## Frontend Integration Requirements

The frontend needs to be updated to:

1. **Detect Input Requests**
   - Check if assistant messages have `input_request` field
   - Render appropriate UI component based on `type`

2. **Send Structured Responses**
   - Capture user selections
   - Format as `structured_response` object
   - Include display text in `content` field

3. **Handle Different Input Types**
   - Single select: Radio buttons or dropdown
   - Multi-select: Checkboxes
   - Numeric input: Slider and/or number input

4. **Support Optional Features**
   - Show "Skip" button if `required: false`
   - Show "Other" text input if `allow_free_text: true`
   - Format numeric values according to `range.format`

See `STRUCTURED_INPUTS_EXAMPLES.md` for complete React component examples.

## Backward Compatibility

All changes are backward compatible:

- Existing messages without new fields will continue to work
- New fields are optional in the API
- GET endpoint returns all fields, including new ones
- Frontend can ignore new fields if not yet updated

## Security Considerations

1. **Authentication:** All endpoints require authenticated user
2. **RLS Policies:** Existing policies enforce data isolation
3. **Profile Access:** Users can only access/update their own profiles
4. **Validation:** API validates message roles and field presence
5. **SQL Injection:** Using Supabase client prevents SQL injection
6. **XSS Protection:** Content is stored as-is; frontend must sanitize for display

## Performance Considerations

1. **Financial Profile Updates:**
   - Single query to check for existing profile
   - Single insert or update operation
   - No additional database round-trips

2. **Message Storage:**
   - Single insert with all fields
   - Indexed by conversation_id and created_at

3. **JSONB Storage:**
   - Efficient storage for structured data
   - Supports indexing for specific fields if needed

## Future Enhancements

Potential improvements for future iterations:

1. **Nested Field Paths:**
   - Support dot notation: `"profile_data.household.income"`
   - Implement deep merge for nested updates

2. **Field Validation:**
   - Add validation rules to `input_request`
   - Validate user responses before storing

3. **Conditional Logic:**
   - Support conditional fields based on previous responses
   - Implement branching logic in input flows

4. **Input Templates:**
   - Create reusable input request templates
   - Store common patterns in database

5. **Analytics:**
   - Track structured input completion rates
   - Monitor field population across user base

6. **Multi-Channel Support:**
   - Extend to support SMS, WhatsApp, etc.
   - Channel-specific input rendering

## Troubleshooting

### Issue: Financial profile not updating

**Check:**
1. Is user authenticated?
2. Does user have permission to update profile?
3. Is `structured_response` properly formatted?
4. Check server logs for errors

### Issue: Input request not appearing in frontend

**Check:**
1. Is message role 'assistant'?
2. Is `input_request` field present in message?
3. Is frontend checking for `input_request`?
4. Check browser console for errors

### Issue: Channel field not set

**Check:**
1. Is migration applied?
2. Is default value set in migration?
3. Check database schema

## Support

For questions or issues:
1. Review documentation in `/docs` folder
2. Check implementation examples
3. Review test cases
4. Contact development team

## Version History

- **v1.0** (2026-02-10): Initial implementation
  - Added structured inputs support
  - Extended agent output schema
  - Created comprehensive documentation
