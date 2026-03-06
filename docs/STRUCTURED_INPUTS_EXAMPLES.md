# Structured Inputs - Usage Examples

## Example 1: Basic Single Select

### Agent Response

```typescript
const agentResponse = {
  message: "What is your current housing situation?",
  input_request: {
    type: "single_select",
    options: [
      { label: "Own (outright)", value: "own_outright" },
      { label: "Own (with mortgage)", value: "own_mortgage" },
      { label: "Rent", value: "rent" },
      { label: "Living with family", value: "living_with_family" }
    ],
    field: "housing_status",
    required: true,
    allow_free_text: false
  }
}
```

### Frontend Rendering (React Example)

```tsx
import { useState } from 'react'

interface StructuredInputProps {
  inputRequest: InputRequest
  onSubmit: (displayText: string, value: any) => void
}

function StructuredInput({ inputRequest, onSubmit }: StructuredInputProps) {
  const [selectedValue, setSelectedValue] = useState<string>('')

  const handleSubmit = () => {
    const selectedOption = inputRequest.options?.find(
      opt => opt.value === selectedValue
    )
    if (selectedOption) {
      onSubmit(selectedOption.label, selectedOption.value)
    }
  }

  return (
    <div className="structured-input">
      {inputRequest.options?.map((option) => (
        <label key={option.value}>
          <input
            type="radio"
            name={inputRequest.field}
            value={option.value}
            checked={selectedValue === option.value}
            onChange={(e) => setSelectedValue(e.target.value)}
          />
          {option.label}
        </label>
      ))}
      <button onClick={handleSubmit} disabled={!selectedValue}>
        Submit
      </button>
    </div>
  )
}
```

### User Response Sent to API

```typescript
const response = await fetch('/api/messages', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    content: "Own (with mortgage)",  // Display text
    role: "user",
    structured_response: {
      field: "housing_status",
      value: "own_mortgage",
      source: "structured_input",
      confidence: 1.0
    }
  })
})
```

## Example 2: Multi-Select with Free Text

### Agent Response

```typescript
const agentResponse = {
  message: "Which financial goals are you working towards? (Select all that apply)",
  input_request: {
    type: "multi_select",
    options: [
      { label: "Buying a home", value: "home_purchase" },
      { label: "Retirement planning", value: "retirement" },
      { label: "Education savings", value: "education" },
      { label: "Debt reduction", value: "debt_reduction" },
      { label: "Building emergency fund", value: "emergency_fund" }
    ],
    field: "financial_goals",
    required: false,  // User can skip
    allow_free_text: true  // Show "Other" option
  }
}
```

### Frontend Rendering

```tsx
function MultiSelectInput({ inputRequest, onSubmit }: StructuredInputProps) {
  const [selectedValues, setSelectedValues] = useState<string[]>([])
  const [customValue, setCustomValue] = useState<string>('')

  const handleCheckboxChange = (value: string) => {
    setSelectedValues(prev => 
      prev.includes(value) 
        ? prev.filter(v => v !== value)
        : [...prev, value]
    )
  }

  const handleSubmit = () => {
    let finalValues = [...selectedValues]
    if (customValue) {
      finalValues.push(customValue)
    }
    
    const displayText = finalValues
      .map(v => {
        const option = inputRequest.options?.find(opt => opt.value === v)
        return option ? option.label : v
      })
      .join(', ')
    
    onSubmit(displayText || 'Skipped', finalValues)
  }

  return (
    <div className="structured-input">
      {inputRequest.options?.map((option) => (
        <label key={option.value}>
          <input
            type="checkbox"
            value={option.value}
            checked={selectedValues.includes(option.value)}
            onChange={() => handleCheckboxChange(option.value)}
          />
          {option.label}
        </label>
      ))}
      
      {inputRequest.allow_free_text && (
        <label>
          <input
            type="text"
            placeholder="Other (please specify)"
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
          />
        </label>
      )}
      
      <button onClick={handleSubmit}>Submit</button>
      
      {!inputRequest.required && (
        <button onClick={() => onSubmit('Skipped', [])}>
          Skip
        </button>
      )}
    </div>
  )
}
```

### User Response

```typescript
const response = await fetch('/api/messages', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    content: "Buying a home, Retirement planning, Starting a business",
    role: "user",
    structured_response: {
      field: "financial_goals",
      value: ["home_purchase", "retirement", "Starting a business"],
      source: "structured_input",
      confidence: 1.0
    }
  })
})
```

## Example 3: Numeric Input with Range

### Agent Response

```typescript
const agentResponse = {
  message: "What is your current annual income before tax?",
  input_request: {
    type: "numeric_input",
    range: {
      min: 0,
      max: 10000000,
      step: 1000,
      default: 50000,
      format: "currency"  // or "percentage", "number"
    },
    field: "annual_income",
    required: true,
    allow_free_text: false
  }
}
```

### Frontend Rendering

```tsx
function NumericInput({ inputRequest, onSubmit }: StructuredInputProps) {
  const [value, setValue] = useState<number>(
    inputRequest.range?.default || 0
  )

  const formatValue = (val: number) => {
    if (inputRequest.range?.format === 'currency') {
      return new Intl.NumberFormat('en-AU', {
        style: 'currency',
        currency: 'AUD',
        minimumFractionDigits: 0
      }).format(val)
    }
    return val.toString()
  }

  const handleSubmit = () => {
    onSubmit(formatValue(value), value)
  }

  return (
    <div className="structured-input">
      <input
        type="range"
        min={inputRequest.range?.min}
        max={inputRequest.range?.max}
        step={inputRequest.range?.step}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
      />
      <input
        type="number"
        min={inputRequest.range?.min}
        max={inputRequest.range?.max}
        step={inputRequest.range?.step}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
      />
      <div className="value-display">{formatValue(value)}</div>
      <button onClick={handleSubmit}>Submit</button>
    </div>
  )
}
```

### User Response

```typescript
const response = await fetch('/api/messages', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    content: "$85,000",  // Formatted display text
    role: "user",
    structured_response: {
      field: "annual_income",
      value: 85000,
      source: "structured_input",
      confidence: 1.0
    }
  })
})
```

## Example 4: Complete Chat Flow

### Initial Message

```typescript
// User starts conversation
await fetch('/api/messages', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    content: "I need help planning for retirement",
    role: "user"
  })
})
```

### Agent Response with Input Request

```typescript
// Agent responds with structured input request
await fetch('/api/messages', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    content: "Great! Let's start by understanding your current age.",
    role: "assistant",
    input_request: {
      type: "numeric_input",
      range: {
        min: 18,
        max: 100,
        step: 1,
        default: 30,
        format: "number"
      },
      field: "age",
      required: true
    }
  })
})
```

### User Provides Structured Response

```typescript
// User responds with age
await fetch('/api/messages', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    content: "45",
    role: "user",
    structured_response: {
      field: "age",
      value: 45,
      source: "structured_input",
      confidence: 1.0
    }
  })
})
```

### Retrieving Conversation History

```typescript
// Get all messages
const response = await fetch('/api/messages')
const { messages } = await response.json()

// messages array will contain:
// [
//   { role: 'user', content: 'I need help planning for retirement', ... },
//   { role: 'assistant', content: 'Great! Let\'s start...', input_request: {...} },
//   { role: 'user', content: '45', structured_response: {...} }
// ]
```

## Example 5: Complete React Component

```tsx
import { useState, useEffect } from 'react'
import type { InputRequest, StructuredResponse } from '@/types/agent'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  input_request?: InputRequest
  created_at: string
}

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  const [pendingInputRequest, setPendingInputRequest] = useState<InputRequest | null>(null)

  useEffect(() => {
    loadMessages()
  }, [])

  const loadMessages = async () => {
    const response = await fetch('/api/messages')
    const { messages } = await response.json()
    setMessages(messages)
    
    // Check if last message has input_request
    const lastMessage = messages[messages.length - 1]
    if (lastMessage?.role === 'assistant' && lastMessage.input_request) {
      setPendingInputRequest(lastMessage.input_request)
    }
  }

  const sendMessage = async (
    content: string,
    role: 'user' | 'assistant' = 'user',
    structuredResponse?: StructuredResponse,
    inputRequest?: InputRequest
  ) => {
    const payload: any = { content, role }
    if (structuredResponse) payload.structured_response = structuredResponse
    if (inputRequest) payload.input_request = inputRequest

    const response = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    const { message } = await response.json()
    setMessages(prev => [...prev, message])
    
    // Check if response has input_request
    if (message.role === 'assistant' && message.input_request) {
      setPendingInputRequest(message.input_request)
    } else {
      setPendingInputRequest(null)
    }
  }

  const handleStructuredResponse = (displayText: string, value: any, field: string) => {
    sendMessage(displayText, 'user', {
      field,
      value,
      source: 'structured_input',
      confidence: 1.0
    })
    setPendingInputRequest(null)
  }

  const handleTextMessage = () => {
    if (!inputText.trim()) return
    sendMessage(inputText)
    setInputText('')
  }

  return (
    <div className="chat-interface">
      <div className="messages">
        {messages.map((message) => (
          <div key={message.id} className={`message ${message.role}`}>
            <div className="content">{message.content}</div>
          </div>
        ))}
      </div>

      {pendingInputRequest ? (
        <StructuredInput
          inputRequest={pendingInputRequest}
          onSubmit={(displayText, value) =>
            handleStructuredResponse(displayText, value, pendingInputRequest.field)
          }
        />
      ) : (
        <div className="input-area">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleTextMessage()}
            placeholder="Type your message..."
          />
          <button onClick={handleTextMessage}>Send</button>
        </div>
      )}
    </div>
  )
}
```

## Testing Checklist

- [ ] Single select input stores correct value in financial_profiles
- [ ] Multi-select input handles multiple selections
- [ ] Numeric input validates range constraints
- [ ] Free text option works with multi-select
- [ ] Skip button appears when required: false
- [ ] Display text shown in chat history matches user selection
- [ ] Structured values stored correctly in database
- [ ] Channel field set to 'web' on all messages
- [ ] Input request passed through to frontend unchanged
- [ ] Financial profile created if doesn't exist
- [ ] Financial profile updated if exists
- [ ] RLS policies prevent unauthorized access
