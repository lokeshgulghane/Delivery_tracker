'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useChat } from '@ai-sdk/react'

// Extract visible text from an AI SDK v7 message
function getMessageText(m: any): string {
  if (Array.isArray(m?.parts) && m.parts.length > 0) {
    return m.parts
      .filter((p: any) => p.type === 'text')
      .map((p: any) => (p.text as string) || '')
      .join('')
      .trim()
  }
  if (typeof m?.content === 'string') return m.content.trim()
  return ''
}

export default function Chatbot() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [retryCount, setRetryCount] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const prevStatusRef = useRef<string>('ready')
  const autoRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { messages, sendMessage, status, setMessages, error } = useChat({
    api: '/api/chat',
    onError: (err) => {
      console.error('[Chatbot] network error:', err)
    },
  })

  const isLoading = status === 'submitted' || status === 'streaming'

  // ── Persist history in localStorage ──────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem('chatbot_messages')
    if (saved) {
      try { setMessages(JSON.parse(saved)) } catch { /* ignore */ }
    }
  }, [setMessages])

  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('chatbot_messages', JSON.stringify(messages))
    }
  }, [messages])

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading, error])

  // ── Auto-retry when stream ends with no assistant text ────────────────────
  // Root cause: Llama/Groq sometimes calls tools but forgets to write the reply.
  // Fix: detect silent completion → automatically nudge the model to respond.
  useEffect(() => {
    if (prevStatusRef.current !== 'ready' && status === 'ready') {
      // Stream just finished — check if the last assistant message has text
      const lastMsg = messages[messages.length - 1]
      const lastText = lastMsg ? getMessageText(lastMsg) : ''
      const lastIsAssistant = lastMsg?.role === 'assistant'

      if (lastIsAssistant && !lastText && retryCount < 2) {
        // Silent response — auto-nudge after a short delay
        console.warn('[Chatbot] Empty assistant response detected, auto-retrying…')
        autoRetryTimerRef.current = setTimeout(() => {
          setRetryCount((c) => c + 1)
          sendMessage({ text: '__retry_summarise__' }) // special token caught by system prompt
        }, 600)
      } else {
        // Good response — reset retry counter
        setRetryCount(0)
      }
    }
    prevStatusRef.current = status
  }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup timer on unmount
  useEffect(() => () => { if (autoRetryTimerRef.current) clearTimeout(autoRetryTimerRef.current) }, [])

  const clearChat = useCallback(() => {
    setMessages([])
    localStorage.removeItem('chatbot_messages')
    setRetryCount(0)
  }, [setMessages])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || isLoading) return
    setInput('')
    setRetryCount(0)
    await sendMessage({ text })
  }

  const quickSend = async (text: string) => {
    if (isLoading) return
    setRetryCount(0)
    await sendMessage({ text })
  }

  return (
    <div className="chatbot-container">
      {/* ── Chat Window ──────────────────────────────────────────────── */}
      {open && (
        <div className="chat-window animate-fade-in">
          {/* Header */}
          <div className="chat-header">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full gold-gradient flex items-center justify-center text-sm font-bold text-black">
                🤖
              </div>
              <div>
                <p className="text-sm font-semibold text-gold-primary">DeliveryBot</p>
                <p className="text-xs text-gold-muted flex items-center gap-1.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full transition-colors ${
                      isLoading ? 'bg-yellow-400 animate-pulse' : 'bg-green-400'
                    }`}
                  />
                  {isLoading ? 'Working on it…' : 'Powered by Groq AI'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {messages.length > 0 && (
                <button
                  onClick={clearChat}
                  className="text-gold-muted hover:text-red-400 transition-colors p-1 text-base"
                  title="Clear chat"
                  aria-label="Clear chat history"
                >
                  🗑️
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="text-gold-muted hover:text-gold-primary transition-colors p-1"
                aria-label="Close chat"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            className="flex-1 overflow-y-auto p-4 space-y-3 scroll-smooth"
            style={{ maxHeight: '340px', minHeight: '200px' }}
          >
            {/* Welcome */}
            {messages.length === 0 && (
              <div className="text-center py-6">
                <div className="text-3xl mb-2">🤖</div>
                <p className="text-sm font-semibold text-gold-primary mb-1">Hi, I'm DeliveryBot!</p>
                <p className="text-xs text-gold-muted mb-4">
                  I can place orders, track deliveries, show charges, and reschedule — just ask!
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {[
                    '📦 Place a new order',
                    '🔍 Track my order',
                    '📋 Show my orders',
                    '💰 Check charges',
                    '📅 Reschedule delivery',
                  ].map((q) => (
                    <button
                      key={q}
                      onClick={() => quickSend(q)}
                      disabled={isLoading}
                      className="text-xs px-3 py-1.5 rounded-full border border-gold-border text-gold-secondary hover:bg-gold-subtle transition-colors disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Render messages */}
            {messages.map((m) => {
              const text = getMessageText(m)
              const isUser = m.role === 'user'

              // Hide retry trigger messages from the user
              if (isUser && text === '__retry_summarise__') return null
              // Hide tool-call-only assistant messages (no visible text)
              if (!isUser && !text) return null

              return (
                <div key={m.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`chat-message ${m.role} ${
                      text.startsWith('⚠️') ? 'border border-red-500/40 bg-red-500/10 text-red-300' : ''
                    }`}
                    style={{ whiteSpace: 'pre-wrap', maxWidth: '85%' }}
                  >
                    {text}
                  </div>
                </div>
              )
            })}

            {/* Network-level error */}
            {error && !isLoading && (
              <div className="flex justify-start">
                <div
                  className="chat-message assistant border border-red-500/40 bg-red-500/10 text-red-300"
                  style={{ maxWidth: '85%' }}
                >
                  ⚠️ {error.message || 'Connection error. Please check your internet and try again.'}
                </div>
              </div>
            )}

            {/* Typing / loading dots */}
            {isLoading && (() => {
              const last = messages[messages.length - 1]
              const lastText = last ? getMessageText(last) : ''
              const showDots = !lastText || last?.role === 'user'
              return showDots ? (
                <div className="flex justify-start">
                  <div className="chat-message assistant">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-gold-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 rounded-full bg-gold-primary animate-bounce" style={{ animationDelay: '160ms' }} />
                      <span className="w-2 h-2 rounded-full bg-gold-primary animate-bounce" style={{ animationDelay: '320ms' }} />
                    </span>
                  </div>
                </div>
              ) : null
            })()}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={onSubmit} className="p-3 border-t border-gold-border flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isLoading ? 'Working on it…' : 'Ask anything…'}
              className="input text-sm py-2"
              disabled={isLoading}
              aria-label="Chat message input"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="btn-primary px-4 py-2 text-sm shrink-0 flex items-center justify-center min-w-[40px]"
              aria-label="Send message"
            >
              {isLoading ? (
                <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ) : (
                '↑'
              )}
            </button>
          </form>
        </div>
      )}

      {/* ── Toggle Button ─────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="chat-bubble"
        aria-label={open ? 'Close chat' : 'Open AI chat support'}
      >
        {isLoading && open ? (
          <span className="w-6 h-6 border-2 border-black/30 border-t-black rounded-full animate-spin" />
        ) : (
          <span className="text-2xl">{open ? '✕' : '💬'}</span>
        )}
      </button>
    </div>
  )
}
