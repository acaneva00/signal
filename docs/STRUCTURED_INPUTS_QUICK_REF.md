# Structured Inputs - Quick Reference

## TL;DR

The `/api/messages` endpoint now supports structured inputs, allowing the agent to request specific data types and automatically store responses in the user's financial profile.

## API Changes

### POST `/api/messages`

**New optional fields:**
- `structured_response` (user messages)
- `input_request` (assistant messages)

**All messages automatically include:**
- `channel: 'web'`

## Common Use Cases

### 1. Agent Requests Structured Input

```typescript
POST /api/messages
{
  "content": "What is your housing situation?",
  "role": "assistant",
  "input_request": {
    "type": "single_select",
    "options": [
      { "label": "Own (outright)", "value": "own_outright" },
      { "label": "Own (with mortgage)", "value": "own_mortgage" },
      { "label": "Rent", "value": "rent" }
    ],
    "field": "housing_status",
    "required": true
  }
}
```

### 2. User Responds with Structured Input

```typescript
POST /api/messages
{
  "content": "Own (with mortgage)",  // Display text
  "role": "user",
  "structured_response": {
    "field": "housing_status",
    "value": "own_mortgage",
    "source": "structured_input",
    "confidence": 1.0
  }
}
```

**Result:** 
- Message stored with display text
- `financial_profiles.profile_data.housing_status` = `"own_mortgage"`

## Input Types

### Single Select
```typescript
{
  "type": "single_select",
  "options": [{ "label": "...", "value": "..." }],
  "field": "field_name",
  "required": true
}
```

### Multi-Select
```typescript
{
  "type": "multi_select",
  "options": [...],
  "field": "field_name",
  "required": false,
  "allow_free_text": true  // Shows "Other" option
}
```

### Numeric Input
```typescript
{
  "type": "numeric_input",
  "range": {
    "min": 0,
    "max": 1000000,
    "step": 1000,
    "default": 50000,
    "format": "currency"  // or "percentage", "number"
  },
  "field": "field_name",
  "required": true
}
```

## Frontend Integration

### Detecting Input Requests

```typescript
// Check last message
const lastMessage = messages[messages.length - 1]
if (lastMessage.role === 'assistant' && lastMessage.input_request) {
  // Render structured input UI
  renderStructuredInput(lastMessage.input_request)
}
```

### Sending Structured Response

```typescript
const sendStructuredResponse = async (
  displayText: string,
  field: string,
  value: any
) => {
  await fetch('/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: displayText,
      role: 'user',
      structured_response: {
        field,
        value,
        source: 'structured_input',
        confidence: 1.0
      }
    })
  })
}
```

## Database Schema

### Migration Applied
```sql
ALTER TABLE messages ADD COLUMN channel TEXT DEFAULT 'web';
ALTER TABLE messages ADD COLUMN structured_response JSONB;
ALTER TABLE messages ADD COLUMN input_request JSONB;
```

### Financial Profile Update
When a structured response is received, the API updates:
```sql
UPDATE financial_profiles 
SET profile_data = profile_data || '{"field_name": "value"}'::jsonb
WHERE user_id = current_user_id;
```

## Type Definitions

Import from `@/types/agent`:

```typescript
import type { 
  InputRequest,
  StructuredResponse,
  AgentOutput
} from '@/types/agent'
```

## Error Codes

- `400`: Missing content or role
- `401`: Not authenticated
- `500`: Database error

## Testing

### Quick Test

```bash
# 1. Send input request
curl -X POST http://localhost:3000/api/messages \
  -H "Content-Type: application/json" \
  -d '{
    "content": "What is your age?",
    "role": "assistant",
    "input_request": {
      "type": "numeric_input",
      "range": {"min": 18, "max": 100, "step": 1, "default": 30, "format": "number"},
      "field": "age",
      "required": true
    }
  }'

# 2. Send structured response
curl -X POST http://localhost:3000/api/messages \
  -H "Content-Type: application/json" \
  -d '{
    "content": "35",
    "role": "user",
    "structured_response": {
      "field": "age",
      "value": 35,
      "source": "structured_input",
      "confidence": 1.0
    }
  }'

# 3. Verify profile updated
# Check Supabase dashboard: financial_profiles.profile_data.age = 35
```

## Best Practices

1. **Always provide display text** - The `content` field should contain human-readable text
2. **Use semantic field names** - `housing_status` not `hs`
3. **Validate on frontend** - Check values before sending
4. **Handle errors gracefully** - Show user-friendly error messages
5. **Test all input types** - Single select, multi-select, numeric
6. **Support skip/other options** - Use `required: false` and `allow_free_text: true`

## Common Patterns

### Optional Field with Skip
```typescript
{
  "type": "single_select",
  "options": [...],
  "field": "optional_field",
  "required": false  // Shows "Skip" button
}
```

### Free Text "Other" Option
```typescript
{
  "type": "single_select",
  "options": [...],
  "field": "field_name",
  "required": true,
  "allow_free_text": true  // Shows "Other" with text input
}
```

### Currency Input
```typescript
{
  "type": "numeric_input",
  "range": {
    "min": 0,
    "max": 10000000,
    "step": 1000,
    "default": 50000,
    "format": "currency"
  },
  "field": "annual_income",
  "required": true
}
```

## Resources

- Full API docs: `API_STRUCTURED_INPUTS.md`
- Examples: `STRUCTURED_INPUTS_EXAMPLES.md`
- Implementation: `STRUCTURED_INPUTS_IMPLEMENTATION.md`
- Types: `src/types/agent.ts`
- Migration: `supabase/migrations/00002_structured_inputs.sql`

## Quick Checklist

Before deploying:
- [ ] Migration applied to database
- [ ] Types imported correctly
- [ ] Frontend handles input_request
- [ ] Frontend sends structured_response
- [ ] Error handling implemented
- [ ] Testing completed
- [ ] Documentation reviewed

## Support

Questions? Check the full documentation or contact the development team.
