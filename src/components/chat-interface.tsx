'use client'

import { useState, useEffect, useRef } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ArrowUp, Plus, RotateCcw } from 'lucide-react'
import { StructuredInput } from '@/components/chat/StructuredInput'
import { Canvas } from '@/components/canvas/Canvas'
import type { InputRequest, StructuredResponse, ProjectionSummary, ComparisonResult } from '@/types/agent'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
  input_request?: InputRequest
}

interface CanvasData {
  projectionSummary: ProjectionSummary | null
  comparisonResult: ComparisonResult | null
  intent: string | null
  assumptions: string[]
  disclaimers: string[]
}

const EMPTY_CANVAS: CanvasData = {
  projectionSummary: null,
  comparisonResult: null,
  intent: null,
  assumptions: [],
  disclaimers: [],
}

const PROFILE_FIELDS = [
  'date_of_birth_year', 'income', 'super_balance', 'intended_retirement_age',
  'expenses', 'relationship_status', 'is_homeowner', 'has_hecs_help_debt',
  'hecs_help_balance', 'mortgage_balance', 'mortgage_rate', 'mortgage_repayment',
  'assets', 'liabilities', 'super_fees',
]

const WELCOME_MESSAGE: Message = {
  id: 'welcome',
  role: 'assistant',
  content: `Hi, I'm Signal.\n\nThink of me as a financial expert who's always in your corner — one that actually knows Australian tax, super, and Centrelink inside out, and has all the time in the world for your questions.\n\nNo judgement about where you're starting from. No forms before you can ask anything. The more we talk, the sharper your picture gets — but you'll get a real answer from the very first question.\n\nWhat's on your mind?`,
  created_at: new Date().toISOString(),
  input_request: {
    type: 'chips',
    field: 'welcome_intent',
    required: false,
    options: [
      { label: '💰 How much super will I have when I retire?', value: 'How much super will I have when I retire?' },
      { label: '📊 Will my super last through retirement?', value: 'Will my super last through retirement?' },
      { label: '🏠 Am I on track given where I\'m at?', value: 'Am I on track given where I\'m at?' },
      { label: '💸 What\'s my actual take-home pay after tax?', value: 'What\'s my actual take-home pay after tax?' },
    ],
  },
}

function SignalMark() {
  return (
    <div
      style={{
        width: 4,
        height: 16,
        borderRadius: 2,
        background: 'linear-gradient(180deg, #4F8EF7, #7C6AF7)',
        flexShrink: 0,
        marginRight: 8,
        marginTop: 2,
      }}
    />
  )
}

function renderMessageContent(content: string) {
  const parts = content.split(/(\*\*[^*]+\*\*)/)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <span key={i} style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
          {part.slice(2, -2)}
        </span>
      )
    }
    return <span key={i}>{part}</span>
  })
}

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [answeredInputs, setAnsweredInputs] = useState<Set<string>>(new Set())
  const [canvasData, setCanvasData] = useState<CanvasData>(EMPTY_CANVAS)
  const [profileFieldCount, setProfileFieldCount] = useState(0)
  const [isResetting, setIsResetting] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const isSubmittingRef = useRef(false)

  useEffect(() => {
    loadMessages()
  }, [])

  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]')
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
      }
    }
  }, [messages])

  const loadMessages = async () => {
    try {
      const response = await fetch('/api/messages')
      if (response.ok) {
        const data = await response.json()
        const msgs: Message[] = data.messages || []

        if (msgs.length > 0) {
          setMessages(msgs)

          const answered = new Set<string>()
          for (let i = 0; i < msgs.length - 1; i++) {
            if (msgs[i].role === 'assistant' && msgs[i].input_request && msgs[i + 1].role === 'user') {
              answered.add(msgs[i].id)
            }
          }
          setAnsweredInputs(answered)
        }
      }
    } catch (error) {
      console.error('Failed to load messages:', error)
    }
  }

  const sendMessage = async () => {
    if (!input.trim() || isLoading || isSubmittingRef.current) return
    isSubmittingRef.current = true

    const userMessage = input.trim()
    setInput('')
    setIsLoading(true)

    const optimisticMsg: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: userMessage,
      created_at: new Date().toISOString(),
    }
    setAnsweredInputs((prev) => new Set(prev).add('welcome'))
    setMessages((prev) => [...prev, optimisticMsg])

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage }),
      })

      if (response.ok) {
        const data = await response.json()
        handleChatResponse(data)
      } else {
        const errorMsg: Message = {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: 'Sorry, something went wrong. Please try again.',
          created_at: new Date().toISOString(),
        }
        setMessages((prev) => [...prev, errorMsg])
      }
    } catch (error) {
      console.error('Error sending message:', error)
    } finally {
      setIsLoading(false)
      isSubmittingRef.current = false
    }
  }

  const handleStructuredInput = async (
    messageId: string,
    displayText: string,
    structuredValue: StructuredResponse
  ) => {
    if (isSubmittingRef.current) return
    isSubmittingRef.current = true

    if (messageId === 'welcome') {
      const userMessage = structuredValue.value as string
      setIsLoading(true)

      const optimisticMsg: Message = {
        id: `temp-${Date.now()}`,
        role: 'user',
        content: userMessage,
        created_at: new Date().toISOString(),
      }
      setAnsweredInputs((prev) => new Set(prev).add('welcome'))
      setMessages((prev) => [...prev, optimisticMsg])

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: userMessage }),
        })

        if (response.ok) {
          const data = await response.json()
          handleChatResponse(data)
        } else {
          const errorMsg: Message = {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: 'Sorry, something went wrong. Please try again.',
            created_at: new Date().toISOString(),
          }
          setMessages((prev) => [...prev, errorMsg])
        }
      } catch (error) {
        console.error('Error sending message:', error)
      } finally {
        setIsLoading(false)
        isSubmittingRef.current = false
      }
      return
    }

    setAnsweredInputs((prev) => new Set(prev).add(messageId))
    setIsLoading(true)

    const optimisticMessage: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: displayText,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimisticMessage])

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: displayText,
          structured_response: structuredValue,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setProfileFieldCount((prev) => prev + 1)
        handleChatResponse(data)
      } else {
        console.error('Failed to send structured input')
      }
    } catch (error) {
      console.error('Error sending structured input:', error)
    } finally {
      setIsLoading(false)
      isSubmittingRef.current = false
    }
  }

  const handleChatResponse = (data: {
    message: string
    intent_classified?: string | null
    projection_summary?: ProjectionSummary | null
    comparison_result?: ComparisonResult | null
    assumptions?: string[]
    disclaimers?: string[]
    input_request?: InputRequest | null
  }) => {
    const assistantMsg: Message = {
      id: `ast-${Date.now()}`,
      role: 'assistant',
      content: data.message,
      created_at: new Date().toISOString(),
      input_request: data.input_request ?? undefined,
    }
    setMessages((prev) => [...prev, assistantMsg])

    if (data.projection_summary || data.comparison_result) {
      setCanvasData({
        projectionSummary: data.projection_summary ?? null,
        comparisonResult: data.comparison_result ?? null,
        intent: data.intent_classified ?? null,
        assumptions: data.assumptions ?? [],
        disclaimers: data.disclaimers ?? [],
      })
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleReset = async () => {
    setIsResetting(true)
    setShowResetConfirm(false)
    try {
      const response = await fetch('/api/reset', { method: 'POST' })
      if (response.ok) {
        setMessages([WELCOME_MESSAGE])
        setAnsweredInputs(new Set())
        setCanvasData(EMPTY_CANVAS)
        setProfileFieldCount(0)
        setInput('')
      } else {
        console.error('Reset failed:', await response.text())
      }
    } catch (error) {
      console.error('Error resetting:', error)
    } finally {
      setIsResetting(false)
    }
  }

  const hasActiveStructuredInput = messages.some(
    (msg) => msg.id !== 'welcome' && msg.role === 'assistant' && msg.input_request && !answeredInputs.has(msg.id)
  )

  const profileCompleteness = Math.min(profileFieldCount / PROFILE_FIELDS.length, 1)
  const hasCanvasContent = canvasData.projectionSummary !== null || canvasData.comparisonResult !== null
  const canSend = input.trim() && !isLoading && !hasActiveStructuredInput

  return (
    <div className="flex h-full min-h-0" style={{ padding: 0 }}>
      {/* ── Left: Chat Pane ──────────────────────────────────────────── */}
      <div
        className="flex flex-col min-w-0 h-full"
        style={{
          width: '60%',
          background: 'var(--color-bg-base)',
          borderRight: '1px solid var(--color-border)',
        }}
      >
        {/* Chat header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 20px',
            borderBottom: '1px solid var(--color-border)',
            minHeight: 48,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)' }}>
            Signal
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {showResetConfirm ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Clear all data?</span>
                <button
                  onClick={handleReset}
                  disabled={isResetting}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--color-accent-danger)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    borderRadius: 'var(--radius-sm)',
                    transition: 'all 150ms ease',
                  }}
                >
                  {isResetting ? 'Clearing…' : 'Confirm'}
                </button>
                <button
                  onClick={() => setShowResetConfirm(false)}
                  disabled={isResetting}
                  style={{
                    fontSize: 12,
                    color: 'var(--color-text-muted)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px 8px',
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => setShowResetConfirm(true)}
                  disabled={isLoading || isResetting}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 12,
                    color: 'var(--color-text-muted)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    borderRadius: 'var(--radius-sm)',
                    transition: 'all 150ms ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-muted)' }}
                  title="Start over"
                >
                  <RotateCcw style={{ width: 12, height: 12 }} />
                </button>
                <button
                  onClick={handleReset}
                  disabled={isLoading || isResetting}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: 12,
                    color: 'var(--color-text-secondary)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-md)',
                    transition: 'all 150ms ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--color-text-primary)'
                    e.currentTarget.style.background = 'var(--color-bg-elevated)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--color-text-secondary)'
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <Plus style={{ width: 14, height: 14 }} />
                  New conversation
                </button>
              </>
            )}
          </div>
        </div>

        {/* Message list */}
        <ScrollArea ref={scrollAreaRef} className="flex-1 min-h-0">
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
            {messages.map((message, msgIdx) => {
              const isUser = message.role === 'user'
              const isFirstAssistantInGroup =
                !isUser &&
                (msgIdx === 0 || messages[msgIdx - 1]?.role === 'user')

              return (
                <div key={message.id} className="animate-message-in" style={{ animationDelay: `${msgIdx * 30}ms` }}>
                  <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                    {!isUser && isFirstAssistantInGroup && <SignalMark />}
                    <div
                      style={{
                        maxWidth: '80%',
                        padding: isUser ? '10px 14px' : '12px 16px',
                        background: isUser
                          ? 'linear-gradient(135deg, #1A2744, #1E3460)'
                          : 'var(--color-bg-elevated)',
                        border: isUser
                          ? '1px solid rgba(79,142,247,0.2)'
                          : '1px solid var(--color-border)',
                        borderRadius: isUser
                          ? '18px 18px 4px 18px'
                          : '4px 18px 18px 18px',
                      }}
                    >
                      <p style={{
                        fontSize: 14,
                        fontWeight: 400,
                        color: 'var(--color-text-primary)',
                        lineHeight: isUser ? 1.6 : 1.7,
                        whiteSpace: 'pre-wrap',
                        margin: 0,
                      }}>
                        {renderMessageContent(message.content)}
                      </p>
                    </div>
                  </div>
                  {/* Timestamp */}
                  <div
                    style={{
                      fontSize: 10,
                      color: 'var(--color-text-muted)',
                      marginTop: 4,
                      textAlign: isUser ? 'right' : 'left',
                      paddingLeft: !isUser && isFirstAssistantInGroup ? 12 : 0,
                    }}
                  >
                    {new Date(message.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>

                  {/* Structured input below assistant message */}
                  {message.role === 'assistant' &&
                   message.input_request &&
                   !answeredInputs.has(message.id) && (
                    <div style={{ marginTop: 8, maxWidth: '80%' }}>
                      <StructuredInput
                        key={`${message.id}-${message.input_request.field}`}
                        inputRequest={message.input_request}
                        onSelect={(displayText, structuredValue) =>
                          handleStructuredInput(message.id, displayText, structuredValue)
                        }
                      />
                    </div>
                  )}
                </div>
              )
            })}

            {/* Loading indicator */}
            {isLoading && (
              <div className="animate-message-in" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <SignalMark />
                <div
                  style={{
                    background: 'var(--color-bg-elevated)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '4px 18px 18px 18px',
                    padding: '12px 16px',
                  }}
                >
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[0, 150, 300].map((delay) => (
                      <span
                        key={delay}
                        className="animate-bounce"
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: 'var(--color-text-muted)',
                          display: 'block',
                          animationDelay: `${delay}ms`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* ── Chat Input Bar ────────────────────────────────────────── */}
        <div
          style={{
            borderTop: '1px solid var(--color-border)',
            background: 'var(--color-bg-base)',
            padding: '16px 20px',
          }}
        >
          <div style={{ position: 'relative' }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                hasActiveStructuredInput
                  ? 'Please respond to the question above...'
                  : 'Ask a financial question...'
              }
              disabled={isLoading || hasActiveStructuredInput}
              style={{
                width: '100%',
                background: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border-strong)',
                borderRadius: 'var(--radius-xl)',
                padding: '12px 52px 12px 16px',
                fontSize: 14,
                fontWeight: 400,
                fontFamily: 'inherit',
                color: 'var(--color-text-primary)',
                outline: 'none',
                transition: 'all 150ms ease',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-accent-primary)'
                e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-accent-glow)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border-strong)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!canSend}
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 32,
                height: 32,
                borderRadius: '50%',
                border: 'none',
                cursor: canSend ? 'pointer' : 'default',
                background: canSend ? 'var(--color-accent-primary)' : 'var(--color-bg-elevated)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 150ms ease',
              }}
              onMouseEnter={(e) => {
                if (canSend) {
                  e.currentTarget.style.background = '#3A7AE8'
                  e.currentTarget.style.transform = 'translateY(-50%) scale(1.05)'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = canSend ? 'var(--color-accent-primary)' : 'var(--color-bg-elevated)'
                e.currentTarget.style.transform = 'translateY(-50%)'
              }}
            >
              <ArrowUp
                style={{
                  width: 16,
                  height: 16,
                  color: canSend ? 'white' : 'var(--color-text-muted)',
                }}
              />
            </button>
          </div>
        </div>
      </div>

      {/* ── Right: Canvas Pane ───────────────────────────────────────── */}
      <div
        className="flex flex-col min-w-0 h-full canvas-dot-grid"
        style={{
          width: '40%',
          background: 'var(--color-bg-base)',
        }}
      >
        {/* Canvas header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 20px',
            borderBottom: '1px solid var(--color-border)',
            minHeight: 48,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
            Canvas
          </span>
          {hasCanvasContent && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--color-accent-success)',
                background: 'rgba(52,211,153,0.1)',
                padding: '3px 10px',
                borderRadius: 999,
              }}
            >
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: 'var(--color-accent-success)',
                }}
              />
              Live
            </span>
          )}
        </div>

        <div className={`flex-1 min-h-0 ${hasCanvasContent ? 'animate-canvas-in' : ''}`}>
          <Canvas
            projectionSummary={canvasData.projectionSummary}
            comparisonResult={canvasData.comparisonResult}
            intent={canvasData.intent}
            assumptions={canvasData.assumptions}
            disclaimers={canvasData.disclaimers}
            profileCompleteness={profileCompleteness}
          />
        </div>
      </div>
    </div>
  )
}
