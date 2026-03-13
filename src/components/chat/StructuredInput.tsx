'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import type { InputRequest, StructuredResponse } from '@/types/agent'

interface StructuredInputProps {
  inputRequest: InputRequest
  onSelect: (displayText: string, structuredValue: StructuredResponse) => void
}

function formatCurrency(value: number): string {
  return '$' + value.toLocaleString('en-AU', { maximumFractionDigits: 0 })
}

export function StructuredInput({ inputRequest, onSelect }: StructuredInputProps) {
  if (inputRequest.type === 'numeric') return <NumericCard inputRequest={inputRequest} onSelect={onSelect} />
  if (inputRequest.type === 'chips') return <ChipSelector inputRequest={inputRequest} onSelect={onSelect} />
  if (inputRequest.type === 'segmented') return <SegmentedControl inputRequest={inputRequest} onSelect={onSelect} />
  if (inputRequest.type === 'text') return <TextInput inputRequest={inputRequest} onSelect={onSelect} />
  return null
}

/* ── Pattern 1: Numeric Card ─────────────────────────────────────────────── */

function NumericCard({ inputRequest, onSelect }: StructuredInputProps) {
  const { format, min, max, label, hint, placeholder, field, required } = inputRequest
  const [rawDigits, setRawDigits] = useState('')
  const [isExiting, setIsExiting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const autoConfirmRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const confirmedRef = useRef(false)

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 100)
    return () => {
      clearTimeout(t)
      if (autoConfirmRef.current) clearTimeout(autoConfirmRef.current)
    }
  }, [])

  const numericValue = (() => {
    if (!rawDigits) return null
    const n = parseFloat(rawDigits)
    return isNaN(n) ? null : n
  })()

  const validationError = (() => {
    if (numericValue === null) return null
    if (min != null && numericValue < min) {
      if (format === 'year') return `Year must be ${min} or later`
      if (format === 'age') return `Must be at least ${min}`
      if (format === 'currency') return `Minimum is ${formatCurrency(min)}`
      return `Minimum is ${min}`
    }
    if (max != null && numericValue > max) {
      if (format === 'year') return `Year must be ${max} or earlier`
      if (format === 'age') return `Must be ${max} or less`
      if (format === 'currency') return `Maximum is ${formatCurrency(max)}`
      return `Maximum is ${max}`
    }
    return null
  })()

  const isValid = numericValue !== null && validationError === null

  const doConfirm = useCallback((val: number) => {
    if (confirmedRef.current) return
    confirmedRef.current = true
    if (autoConfirmRef.current) {
      clearTimeout(autoConfirmRef.current)
      autoConfirmRef.current = null
    }
    setIsExiting(true)
    setTimeout(() => {
      const display = format === 'currency' ? formatCurrency(val) : String(val)
      onSelect(display, {
        field,
        value: val,
        source: 'structured_input',
        confidence: 1.0,
      })
    }, 150)
  }, [field, format, onSelect])

  const handleConfirm = () => {
    if (numericValue === null) return
    if (validationError) { setError(validationError); return }
    if (autoConfirmRef.current) {
      clearTimeout(autoConfirmRef.current)
      autoConfirmRef.current = null
    }
    doConfirm(numericValue)
  }

  const displayValue = (() => {
    if (!rawDigits) return ''
    if (format === 'currency') {
      const n = parseInt(rawDigits, 10)
      if (isNaN(n)) return rawDigits
      return n === 0 ? '$0' : formatCurrency(n)
    }
    return rawDigits
  })()

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setError(null)
    if (autoConfirmRef.current) {
      clearTimeout(autoConfirmRef.current)
      autoConfirmRef.current = null
    }

    if (format === 'currency') {
      const stripped = val.replace(/[$,\s]/g, '')
      const lower = stripped.toLowerCase()
      if (lower.endsWith('k') || lower.endsWith('m')) {
        const numPart = stripped.slice(0, -1).replace(/[^0-9.]/g, '')
        const n = parseFloat(numPart)
        if (!isNaN(n)) {
          const resolved = lower.endsWith('k') ? Math.round(n * 1_000) : Math.round(n * 1_000_000)
          setRawDigits(String(resolved))
          return
        }
      }
      setRawDigits(stripped.replace(/[^0-9]/g, ''))
      return
    }

    if (format === 'year') {
      const digits = val.replace(/\D/g, '').slice(0, 4)
      setRawDigits(digits)
      if (digits.length === 4) {
        const year = parseInt(digits, 10)
        if (min != null && max != null && year >= min && year <= max) {
          autoConfirmRef.current = setTimeout(() => doConfirm(year), 400)
        }
      }
      return
    }

    if (format === 'age') {
      const digits = val.replace(/\D/g, '').slice(0, 2)
      setRawDigits(digits)
      if (digits.length === 2) {
        const age = parseInt(digits, 10)
        if (min != null && max != null && age >= min && age <= max) {
          autoConfirmRef.current = setTimeout(() => doConfirm(age), 400)
        }
      }
      return
    }

    const cleaned = val.replace(/[^0-9.\-]/g, '')
    const parts = cleaned.split('.')
    setRawDigits(parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : cleaned)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleConfirm() }
    if (e.key === 'Escape' && !required) {
      setIsExiting(true)
      setTimeout(() => {
        onSelect('(Skipped)', { field, value: null, source: 'structured_input', confidence: 0 } as StructuredResponse)
      }, 150)
    }
  }

  return (
    <div style={{
      opacity: isExiting ? 0 : 1,
      transform: isExiting ? 'translateY(4px)' : 'translateY(0)',
      transition: 'opacity 150ms ease, transform 150ms ease',
    }}>
      <div className="animate-numeric-card-in" style={{
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border-strong)',
        borderRadius: 16,
        padding: 16,
        maxWidth: 400,
        boxShadow: 'var(--shadow-card)',
      }}>
        <div style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--color-text-muted)',
          marginBottom: 8,
        }}>
          {label || field.replace(/_/g, ' ')}
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            value={displayValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            autoComplete="off"
            style={{
              width: '100%',
              fontSize: 32,
              fontWeight: 700,
              fontFamily: 'Inter, system-ui, sans-serif',
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--color-text-primary)',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              padding: 0,
            }}
          />
          {format === 'age' && rawDigits && (
            <span style={{
              fontSize: 16,
              color: 'var(--color-text-muted)',
              marginLeft: 6,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}>
              years old
            </span>
          )}
        </div>

        {error && (
          <div style={{ fontSize: 11, color: 'var(--color-accent-danger)', marginTop: 4 }}>
            {error}
          </div>
        )}

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 12,
        }}>
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
            {hint || '\u00a0'}
          </span>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!isValid}
            style={{
              height: 34,
              padding: '0 16px',
              background: isValid ? 'var(--color-accent-primary)' : 'var(--color-bg-elevated)',
              color: isValid ? 'white' : 'var(--color-text-muted)',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: 'Inter, system-ui, sans-serif',
              border: 'none',
              borderRadius: 10,
              cursor: isValid ? 'pointer' : 'default',
              transition: 'all 150ms ease',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => {
              if (isValid) {
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = 'var(--shadow-glow)'
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            Confirm →
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Pattern 2: Chip Selector ────────────────────────────────────────────── */

function ChipSelector({ inputRequest, onSelect }: StructuredInputProps) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [isExiting, setIsExiting] = useState(false)
  const options = inputRequest.options || []

  const handleSelect = (option: { label: string; value: string }, idx: number) => {
    if (selectedIdx !== null) return
    setSelectedIdx(idx)
    setTimeout(() => {
      setIsExiting(true)
      setTimeout(() => {
        onSelect(option.label, {
          field: inputRequest.field,
          value: option.value,
          source: 'structured_input',
          confidence: 1.0,
        })
      }, 150)
    }, 200)
  }

  return (
    <div style={{
      padding: '4px 0 8px 0',
      opacity: isExiting ? 0 : 1,
      transition: 'opacity 150ms ease',
    }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {options.map((opt, i) => {
          const isSelected = selectedIdx === i
          return (
            <button
              type="button"
              key={opt.value}
              onClick={() => handleSelect(opt, i)}
              disabled={selectedIdx !== null}
              className="animate-chip-in"
              style={{
                animationDelay: `${i * 60}ms`,
                height: 36,
                padding: '0 16px',
                background: isSelected ? 'var(--color-accent-primary)' : 'var(--color-bg-elevated)',
                border: isSelected ? '1px solid transparent' : '1px solid var(--color-border-strong)',
                borderRadius: 18,
                fontSize: 13,
                fontWeight: 500,
                fontFamily: 'Inter, system-ui, sans-serif',
                color: isSelected ? 'white' : 'var(--color-text-primary)',
                cursor: selectedIdx !== null ? 'default' : 'pointer',
                transition: 'background 120ms ease, border-color 120ms ease, color 120ms ease, transform 120ms ease',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                if (selectedIdx === null) {
                  e.currentTarget.style.background = 'var(--color-bg-surface)'
                  e.currentTarget.style.borderColor = 'var(--color-accent-primary)'
                  e.currentTarget.style.color = 'var(--color-accent-primary)'
                  e.currentTarget.style.transform = 'translateY(-1px)'
                }
              }}
              onMouseLeave={(e) => {
                if (selectedIdx === null) {
                  e.currentTarget.style.background = 'var(--color-bg-elevated)'
                  e.currentTarget.style.borderColor = 'var(--color-border-strong)'
                  e.currentTarget.style.color = 'var(--color-text-primary)'
                  e.currentTarget.style.transform = 'translateY(0)'
                }
              }}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ── Pattern 3: Segmented Control ────────────────────────────────────────── */

function SegmentedControl({ inputRequest, onSelect }: StructuredInputProps) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [isExiting, setIsExiting] = useState(false)
  const options = inputRequest.options || []

  const handleSelect = (option: { label: string; value: string }, idx: number) => {
    if (selectedIdx !== null) return
    setSelectedIdx(idx)
    setTimeout(() => {
      setIsExiting(true)
      setTimeout(() => {
        onSelect(option.label, {
          field: inputRequest.field,
          value: option.value,
          source: 'structured_input',
          confidence: 1.0,
        })
      }, 150)
    }, 200)
  }

  return (
    <div style={{
      padding: '4px 0 8px 0',
      opacity: isExiting ? 0 : 1,
      transition: 'opacity 150ms ease',
    }}>
      <div className="animate-numeric-card-in" style={{
        display: 'inline-flex',
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border)',
        borderRadius: 12,
        padding: 3,
      }}>
        {options.map((opt, i) => {
          const isActive = selectedIdx === i
          return (
            <button
              type="button"
              key={opt.value}
              onClick={() => handleSelect(opt, i)}
              disabled={selectedIdx !== null}
              style={{
                height: 32,
                padding: '0 20px',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 500,
                fontFamily: 'Inter, system-ui, sans-serif',
                color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                background: isActive ? 'var(--color-bg-surface)' : 'transparent',
                border: 'none',
                cursor: selectedIdx !== null ? 'default' : 'pointer',
                transition: 'all 150ms ease',
                boxShadow: isActive ? '0 1px 4px rgba(0,0,0,0.3)' : 'none',
                whiteSpace: 'nowrap',
              }}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ── Pattern 4: Text Input with optional autocomplete ────────────────────── */

interface SearchResult {
  id: string
  name: string
}

function TextInput({ inputRequest, onSelect }: StructuredInputProps) {
  const { field, label, hint, placeholder, autocomplete, autocomplete_url } = inputRequest
  const [value, setValue] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const [isExiting, setIsExiting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const submittedRef = useRef(false)
  const blurIgnoreRef = useRef(false)

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 100)
    return () => {
      clearTimeout(t)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const doSubmit = useCallback((text: string) => {
    if (submittedRef.current || !text.trim()) return
    submittedRef.current = true
    setShowDropdown(false)
    setIsExiting(true)
    setTimeout(() => {
      onSelect(text.trim(), {
        field,
        value: text.trim(),
        source: 'structured_input',
        confidence: 1.0,
      })
    }, 150)
  }, [field, onSelect])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setValue(v)
    setActiveIdx(-1)

    if (!autocomplete) return

    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (v.trim().length < 2) {
      setResults([])
      setShowDropdown(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const baseUrl = autocomplete_url ?? '/api/products/search'
        const separator = baseUrl.includes('?') ? '&' : '?'
        const res = await fetch(`${baseUrl}${separator}q=${encodeURIComponent(v.trim())}`)
        if (res.ok) {
          const data: SearchResult[] = await res.json()
          setResults(data)
          setShowDropdown(data.length > 0)
        }
      } catch {
        setResults([])
        setShowDropdown(false)
      }
    }, 200)
  }

  const handleSelect = (name: string) => {
    setValue(name)
    setShowDropdown(false)
    doSubmit(name)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowDropdown(false)
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      if (showDropdown && activeIdx >= 0 && activeIdx < results.length) {
        handleSelect(results[activeIdx].name)
      } else {
        doSubmit(value)
      }
      return
    }

    if (showDropdown && results.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIdx((prev) => (prev < results.length - 1 ? prev + 1 : 0))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx((prev) => (prev > 0 ? prev - 1 : results.length - 1))
      }
    }
  }

  const handleBlur = () => {
    if (blurIgnoreRef.current) {
      blurIgnoreRef.current = false
      return
    }
    setTimeout(() => {
      if (submittedRef.current) return
      setShowDropdown(false)
      if (value.trim()) doSubmit(value)
    }, 200)
  }

  return (
    <div
      ref={containerRef}
      style={{
        opacity: isExiting ? 0 : 1,
        transform: isExiting ? 'translateY(4px)' : 'translateY(0)',
        transition: 'opacity 150ms ease, transform 150ms ease',
        position: 'relative',
      }}
    >
      <div className="animate-numeric-card-in" style={{
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border-strong)',
        borderRadius: 16,
        padding: 16,
        maxWidth: 400,
        boxShadow: 'var(--shadow-card)',
      }}>
        <div style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--color-text-muted)',
          marginBottom: 8,
        }}>
          {label || field.replace(/_/g, ' ')}
        </div>

        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={placeholder}
          autoComplete="off"
          style={{
            width: '100%',
            fontSize: 20,
            fontWeight: 600,
            fontFamily: 'Inter, system-ui, sans-serif',
            color: 'var(--color-text-primary)',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            padding: 0,
          }}
        />

        {hint && (
          <div style={{
            fontSize: 11,
            color: 'var(--color-text-muted)',
            marginTop: 8,
          }}>
            {hint}
          </div>
        )}
      </div>

      {showDropdown && results.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          maxWidth: 400,
          marginTop: 4,
          background: '#0C0E14',
          border: '1px solid var(--color-border-strong)',
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          zIndex: 50,
        }}>
          {results.map((r, i) => (
            <button
              type="button"
              key={r.id}
              onMouseDown={() => {
                blurIgnoreRef.current = true
                handleSelect(r.name)
              }}
              onMouseEnter={() => setActiveIdx(i)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '10px 14px',
                fontSize: 14,
                fontWeight: 500,
                fontFamily: 'Inter, system-ui, sans-serif',
                color: i === activeIdx ? '#fff' : 'var(--color-text-primary)',
                background: i === activeIdx ? '#4F7EF7' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                transition: 'background 80ms ease, color 80ms ease',
              }}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
