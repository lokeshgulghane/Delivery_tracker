'use client'

import { useState, useEffect, useRef } from 'react'
import { useChat } from '@ai-sdk/react'

export default function Chatbot() {
  const [open, setOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { messages, sendMessage, status, setMessages, error } = useChat({
    api: '/api/chat',
    onError: (err) => {
      // useChat already adds errors to the messages list via the stream,
      // but in case of network-level failures we log them
      console.error('[Chatbot] error:', err)
    },
  })

  const isLoading = status === 'submitted' || status === 'streaming'

  // ── Persist chat history ──────────────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem('chatbot_messages')
    if (saved) {
      try {
        setMessages(JSON.parse(saved))
      } catch {
        // ignore corrupt data
      }
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

  const clearChat = () => {
    setMessages([])
    localStorage.removeItem('chatbot_messages')
  }

  const [input, setInput] = useState('')

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || isLoading) return
    setInput('')
    await sendMessage({ text })
  }

  const quickSend = async (text: string) => {
    if (isLoading) return
    await sendMessage({ text })
  }

  // ── Extract visible text from a message (AI SDK v7) ───────────────────────
  const getMessageText = (m: any): string => {
    // v7 messages have parts[]
    if (Array.isArray(m.parts) && m.parts.length > 0) {
      return m.parts
        .filter((p: any) => p.type === 'text')
        .map((p: any) => p.text as string)
        .join('')
        .trim()
    }
    // fallback for v6 / plain content
    if (typeof m.content === 'string') return m.content.trim()
    return ''
  }

  return (
    <div className="chatbot-container">
      {/* ── Chat Window ─────────────────────────────────────────────────── */}
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
                <p className="text-xs text-gold-muted flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${isLoading ? 'bg-yellow-400 animate-pulse' : 'bg-green-400'}`} />
                  {isLoading ? 'Thinking…' : 'Powered by Gemini AI'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {messages.length > 0 && (
                <button
                  onClick={clearChat}
                  className="text-gold-muted hover:text-red-400 transition-colors p-1"
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
            {/* Welcome screen */}
            {messages.length === 0 && (
              <div className="text-center py-6">
                <div className="text-3xl mb-2">👋</div>
                <p className="text-sm text-gold-muted mb-4">
                  Hi! I can help you track orders, explain charges, and answer delivery questions.
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {['Show my orders', 'Track my order', 'Why this charge?', 'What is out for delivery?'].map((q) => (
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

            {/* Message list */}
            {messages.map((m) => {
              const text = getMessageText(m)
              const isUser = m.role === 'user'

              // Skip tool-call-only assistant messages that have no text
              if (!isUser && !text) return null

              return (
                <div key={m.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`chat-message ${m.role} ${text.startsWith('⚠️') ? 'border border-red-500/40 bg-red-500/10 text-red-300' : ''}`}
                    style={{ whiteSpace: 'pre-wrap', maxWidth: '85%' }}
                  >
                    {text}
                  </div>
                </div>
              )
            })}

            {/* Network-level error (e.g. fetch failure) */}
            {error && (
              <div className="flex justify-start">
                <div className="chat-message assistant border border-red-500/40 bg-red-500/10 text-red-300" style={{ maxWidth: '85%' }}>
                  ⚠️ {error.message || 'Connection error. Please check your internet and try again.'}
                </div>
              </div>
            )}

            {/* Loading indicator — only show if no streaming text yet */}
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
              placeholder={isLoading ? 'Waiting for response…' : 'Ask about your order…'}
              className="input text-sm py-2"
              disabled={isLoading}
              aria-label="Chat message input"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="btn-primary px-4 py-2 text-sm shrink-0 flex items-center justify-center"
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

      {/* ── Toggle Button ────────────────────────────────────────────────── */}
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
