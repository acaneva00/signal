# Structured Inputs API Documentation

## Overview

The `/api/messages` endpoint now supports structured inputs and outputs, enabling the agent to request specific data types and receive validated responses that are automatically stored in the user's financial profile.

## Database Schema Changes

### Migration: `00002_structured_inputs.sql`

Added three new columns to the `messages` table:

- `channel` (TEXT, default: 'web'): Communication channel identifier
- `structured_response` (JSONB): Stores structured input data from user responses
- `input_request` (JSONB): Stores structured input requests from assistant messages

## API Endpoints

### POST `/api/messages`

#### Request Body

```typescript
{
  content: string                    // Message text (required)
  role: 'user' | 'assistant'        // Message role (required)
  structured_response?: {            // Optional: structured input from user
    field: string                    // Field path in financial_profiles
    value: any                       // The value to store
    source: 'structured_input'       // Always 'structured_input'
    confidence: 1.0                  // Always 1.0 for structured inputs
  }
  input_request?: {                  // Optional: structured input request (assistant only)
    type: 'single_select' | 'multi_select' | 'numeric_input'
    options?: Array<{
      label: string
      value: string
      icon?: string
    }>
    range?: {
      min: number
      max: number
      step: number
      default: number
      format: string
    }
    field: string                    // Maps to financial_profiles field path
    required: boolean                // If false, show skip option
    allow_free_text?: boolean        // If true, show 'Other' option
  }
}
```

#### Behavior

##### User Messages with Structured Response

When a user message includes `structured_response`:

1. **Validate**: Check that role is 'user'
2. **Update Profile**: Write value to `financial_profiles.profile_data[field]`
   - Creates profile if it doesn't exist
   - Merges with existing profile data if it does
3. **Store in Message**: Save `structured_response` in the message row
4. **Use Display Text**: The `content` field contains the display text shown in chat history

**Example Request:**

```json
{
  "content": "Own (with mortgage)",
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
- Message stored with content: "Own (with mortgage)"
- `financial_profiles.profile_data.housing_status` set to `"own_mortgage"`
- `structured_response` stored in message row
- `channel` set to 'web'

##### Assistant Messages with Input Request

When an assistant message includes `input_request`:

1. **Validate**: Check that role is 'assistant'
2. **Store in Message**: Save `input_request` in the message row
3. **Return to Frontend**: Pass through unchanged in response

**Example Request:**

```json
{
  "content": "What is your current housing situation?",
  "role": "assistant",
  "input_request": {
    "type": "single_select",
    "options": [
      { "label": "Own (outright)", "value": "own_outright" },
      { "label": "Own (with mortgage)", "value": "own_mortgage" },
      { "label": "Rent", "value": "rent" }
    ],
    "field": "housing_status",
    "required": true,
    "allow_free_text": false
  }
}
```

**Result:**
- Message stored with `input_request` object
- Frontend receives `input_request` and renders appropriate UI component
- `channel` set to 'web'

#### Response

```typescript
{
  message: {
    id: string
    conversation_id: string
    role: 'user' | 'assistant'
    content: string
    channel: 'web'
    structured_response?: StructuredResponse  // Present on user messages
    input_request?: InputRequest              // Present on assistant messages
    agent_used: string | null
    intent_classified: string | null
    canvas_state: object | null
    enrichment_extracted: object | null
    created_at: string
  }
}
```

### GET `/api/messages`

Retrieves all messages for the user's current conversation.

#### Response

```typescript
{
  messages: Array<{
    id: string
    conversation_id: string
    role: 'user' | 'assistant'
    content: string
    channel: string
    structured_response?: StructuredResponse
    input_request?: InputRequest
    agent_used: string | null
    intent_classified: string | null
    canvas_state: object | null
    enrichment_extracted: object | null
    created_at: string
  }>
}
```

## Agent Output Schema

The standard agent output schema has been extended with an optional `input_request` field:

```typescript
{
  message: string                    // Agent's text response
  projection_result?: ProjectionResult
  canvas_config?: CanvasConfig
  assumptions?: string[]
  disclaimers?: string[]
  input_request?: InputRequest       // NEW: Request for structured input
}
```

## Frontend Integration

### Sending Structured Responses

When the user responds to a structured input request, the frontend sends:

```typescript
{
  content: displayText,              // Human-readable text for chat history
  role: 'user',
  structured_response: {
    field: 'housing_status',
    value: 'own_mortgage',
    source: 'structured_input',
    confidence: 1.0
  }
}
```

### Rendering Input Requests

When receiving an assistant message with `input_request`:

1. Display the message text
2. Render appropriate input component based on `type`:
   - `single_select`: Radio buttons or dropdown
   - `multi_select`: Checkboxes
   - `numeric_input`: Number input with range validation
3. If `required: false`, show a "Skip" option
4. If `allow_free_text: true`, show "Other" with text input

### Example Flow

1. **Agent asks question:**
   ```json
   {
     "message": "What is your current housing situation?",
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

2. **Frontend renders:**
   - Message: "What is your current housing situation?"
   - Radio buttons with three options

3. **User selects "Own (with mortgage)"**

4. **Frontend sends:**
   ```json
   {
     "content": "Own (with mortgage)",
     "role": "user",
     "structured_response": {
       "field": "housing_status",
       "value": "own_mortgage",
       "source": "structured_input",
       "confidence": 1.0
     }
   }
   ```

5. **Backend:**
   - Stores message with display text
   - Updates `financial_profiles.profile_data.housing_status = "own_mortgage"`
   - Returns confirmation

6. **Chat history shows:** "Own (with mortgage)"

## Error Handling

### 400 Bad Request
- Missing required fields (`content` or `role`)

### 401 Unauthorized
- User not authenticated

### 500 Internal Server Error
- Failed to create/update conversation
- Failed to fetch/create/update financial profile
- Failed to save message

## Type Definitions

See `src/types/agent.ts` for full TypeScript type definitions:
- `StructuredResponse`
- `InputRequest`
- `AgentOutput`
- `MessageRequest`
- `UserMessageWithStructuredInput`

## Security Considerations

1. **Authentication**: All endpoints require authenticated user via Supabase auth
2. **RLS Policies**: Row-level security ensures users can only access their own data
3. **Validation**: Role validation ensures structured inputs match expected message types
4. **Profile Isolation**: Financial profiles are strictly scoped to the authenticated user

## Future Enhancements

Potential improvements for future iterations:

- Nested field path support (e.g., `"profile_data.household.income"`)
- Field validation rules in `input_request`
- Conditional input requests based on previous responses
- Multi-step structured input flows
- Input request templates/presets
