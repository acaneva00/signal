'use client'

import { useState, useEffect, useRef } from 'react'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Send } from 'lucide-react'
import { StructuredInput } from '@/components/chat/StructuredInput'
import type { InputRequest, StructuredResponse } from '@/types/agent'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
  input_request?: InputRequest
}

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [answeredInputs, setAnsweredInputs] = useState<Set<string>>(new Set())
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  // Load messages on mount
  useEffect(() => {
    loadMessages()
  }, [])

  // Scroll to bottom when messages change
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

    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role: 'user',
          content: userMessage,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setMessages((prev) => [...prev, data.message])
      } else {
        console.error('Failed to send message')
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
    // Mark this input as answered
    setAnsweredInputs((prev) => new Set(prev).add(messageId))
    setIsLoading(true)

    // Optimistically add user message bubble
    const optimisticMessage: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: displayText,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimisticMessage])

    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role: 'user',
          content: displayText,
          structured_response: structuredValue,
        }),
      })

      if (response.ok) {
        // Reload all messages to get the assistant's response
        await loadMessages()
      } else {
        console.error('Failed to send structured input')
      }
    } catch (error) {
      console.error('Error sending structured input:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // Check if there's an active structured input waiting for response
  const hasActiveStructuredInput = messages.some(
    (msg) => msg.role === 'assistant' && msg.input_request && !answeredInputs.has(msg.id)
  )

  return (
    <div className="flex h-full gap-4 p-6">
      {/* Left Pane - Chat Messages */}
      <Card className="flex flex-col w-[60%] h-full">
        <div className="border-b p-4">
          <h2 className="text-lg font-semibold text-slate-900">Conversation</h2>
          <p className="text-sm text-slate-600">Chat with your financial coach</p>
        </div>

        {/* Messages Area */}
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
                  
                  {/* Render StructuredInput if this is an assistant message with input_request */}
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
          </div>
        </ScrollArea>

        {/* Input Area */}
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

      {/* Right Pane - Canvas Placeholder */}
      <Card className="w-[40%] h-full bg-slate-50">
        <div className="border-b p-4 bg-white">
          <h2 className="text-lg font-semibold text-slate-900">Canvas</h2>
          <p className="text-sm text-slate-600">Visualizations will appear here</p>
        </div>
        <div className="flex items-center justify-center h-[calc(100%-4rem)] p-6">
          <div className="text-center">
            <div className="w-24 h-24 mx-auto mb-4 rounded-lg bg-slate-200 flex items-center justify-center">
              <svg
                className="w-12 h-12 text-slate-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
                />
              </svg>
            </div>
            <p className="text-slate-600 font-medium">Canvas Area</p>
            <p className="text-sm text-slate-500 mt-1">
              Interactive visualizations and projections will be displayed here
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
