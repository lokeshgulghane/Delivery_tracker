'use client'

import { useState, useEffect, useRef } from 'react'
import { useChat } from '@ai-sdk/react'

export default function Chatbot() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  
  const { messages, sendMessage, status } = useChat({
    api: '/api/chat',
    onError: (err) => {
      const msg = (err?.message || '').toLowerCase()
      if (msg.includes('429') || msg.includes('quota') || msg.includes('exhausted') || msg.includes('rate')) {
        setErrorMsg('⚠️ AI quota exceeded. Please wait 1 minute and try again.')
      } else {
        setErrorMsg('⚠️ AI service unavailable. Please try again shortly.')
      }
    },
  })

  const isLoading = status === 'submitted' || status === 'streaming'

  const messagesContainerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }, [messages, errorMsg, isLoading])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return
    setErrorMsg(null)
    const messageText = input
    setInput('')
    await sendMessage({ text: messageText })
  }

  return (
    <div className="chatbot-container">
      {/* Chat Window */}
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
                <p className="text-xs text-gold-muted">Powered by Gemini AI</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-gold-muted hover:text-gold-primary transition-colors"
              aria-label="Close chat"
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div 
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto p-4 space-y-3 scroll-smooth" 
            style={{ maxHeight: '320px' }}
          >
            {messages.length === 0 && !errorMsg && (
              <div className="text-center py-6">
                <div className="text-3xl mb-2">👋</div>
                <p className="text-sm text-gold-muted">Hi! I can help you with order tracking, charge breakdowns, and delivery questions.</p>
                <div className="flex flex-wrap gap-2 justify-center mt-3">
                  {['Track my order', 'Why this charge?', 'Reschedule delivery'].map((q) => (
                    <button
                      key={q}
                      onClick={async () => {
                        if (isLoading) return
                        setErrorMsg(null)
                        await sendMessage({ text: q })
                      }}
                      className="text-xs px-3 py-1.5 rounded-full border border-gold-border text-gold-secondary hover:bg-gold-subtle transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => {
              // Extract text content from parts if present
              let displayContent = (m as any).content || ''
              if (m.parts && m.parts.length > 0) {
                displayContent = m.parts
                  .map((p) => (p.type === 'text' ? p.text : ''))
                  .join('')
              }

              return (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`chat-message ${m.role}`}>
                    {displayContent || (isLoading && m.role === 'assistant' ? (
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-gold-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-gold-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-gold-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                    ) : null)}
                  </div>
                </div>
              )
            })}

            {/* Error message rendered at the bottom in conversational order */}
            {errorMsg && (
              <div className="flex justify-start">
                <div className="chat-message assistant text-red-400 border border-red-500/30 bg-red-500/10">
                  {errorMsg}
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={onSubmit} className="p-3 border-t border-gold-border flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your order..."
              className="input text-sm py-2"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="btn-primary px-3 py-2 text-sm shrink-0"
              aria-label="Send message"
            >
              {isLoading ? '⏳' : '↑'}
            </button>
          </form>
        </div>
      )}

      {/* Toggle Button */}
      <button
        onClick={() => setOpen(!open)}
        className="chat-bubble"
        aria-label={open ? 'Close chat' : 'Open AI chat support'}
      >
        <span className="text-2xl">{open ? '✕' : '💬'}</span>
      </button>
    </div>
  )
}
