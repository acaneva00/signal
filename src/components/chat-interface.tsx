'use client'

import { useState, useEffect, useRef } from 'react'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Send } from 'lucide-react'
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

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [answeredInputs, setAnsweredInputs] = useState<Set<string>>(new Set())
  const [canvasData, setCanvasData] = useState<CanvasData>(EMPTY_CANVAS)
  const [profileFieldCount, setProfileFieldCount] = useState(0)
  const scrollAreaRef = useRef<HTMLDivElement>(null)

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
        setMessages(data.messages || [])
      }
    } catch (error) {
      console.error('Failed to load messages:', error)
    }
  }

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return

    const userMessage = input.trim()
    setInput('')
    setIsLoading(true)

    const optimisticMsg: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: userMessage,
      created_at: new Date().toISOString(),
    }
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
    }
  }

  const handleStructuredInput = async (
    messageId: string,
    displayText: string,
    structuredValue: StructuredResponse
  ) => {
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

  const hasActiveStructuredInput = messages.some(
    (msg) => msg.role === 'assistant' && msg.input_request && !answeredInputs.has(msg.id)
  )

  const profileCompleteness = Math.min(profileFieldCount / PROFILE_FIELDS.length, 1)

  return (
    <div className="flex h-full gap-4 p-6">
      {/* Left Pane - Chat */}
      <Card className="flex flex-col w-[60%] h-full">
        <div className="border-b p-4">
          <h2 className="text-lg font-semibold text-slate-900">Conversation</h2>
          <p className="text-sm text-slate-600">Chat with your financial coach</p>
        </div>

        <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
          <div className="space-y-4">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-center">
                <div>
                  <p className="text-slate-600">No messages yet</p>
                  <p className="text-sm text-slate-500 mt-1">
                    Start a conversation to get financial guidance
                  </p>
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <div key={message.id}>
                  <div
                    className={`flex ${
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-4 py-2 ${
                        message.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-900'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      <p
                        className={`text-xs mt-1 ${
                          message.role === 'user'
                            ? 'text-blue-100'
                            : 'text-slate-500'
                        }`}
                      >
                        {new Date(message.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>

                  {message.role === 'assistant' &&
                   message.input_request &&
                   !answeredInputs.has(message.id) && (
                    <div className="flex justify-start">
                      <div className="max-w-[80%] w-full">
                        <StructuredInput
                          inputRequest={message.input_request}
                          onSelect={(displayText, structuredValue) =>
                            handleStructuredInput(message.id, displayText, structuredValue)
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-slate-100 rounded-lg px-4 py-2">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="border-t p-4">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                hasActiveStructuredInput
                  ? 'Please respond to the question above...'
                  : 'Type your message...'
              }
              disabled={isLoading || hasActiveStructuredInput}
              className="flex-1"
            />
            <Button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading || hasActiveStructuredInput}
              size="icon"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Right Pane - Canvas */}
      <Card className="w-[40%] h-full bg-slate-50 overflow-hidden">
        <div className="border-b p-4 bg-white">
          <h2 className="text-lg font-semibold text-slate-900">Canvas</h2>
          <p className="text-sm text-slate-600">
            {canvasData.projectionSummary || canvasData.comparisonResult
              ? canvasData.projectionSummary?.scenario_name ?? 'Scenario Comparison'
              : 'Visualisations will appear here'}
          </p>
        </div>
        <div className="h-[calc(100%-4.5rem)]">
          <Canvas
            projectionSummary={canvasData.projectionSummary}
            comparisonResult={canvasData.comparisonResult}
            intent={canvasData.intent}
            assumptions={canvasData.assumptions}
            disclaimers={canvasData.disclaimers}
            profileCompleteness={profileCompleteness}
          />
        </div>
      </Card>
    </div>
  )
}
