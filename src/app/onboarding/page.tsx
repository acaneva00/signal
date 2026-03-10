'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// ── Types ────────────────────────────────────────────────────────────────────

interface StepOption {
  value: string
  label: string
  emoji?: string
}

interface QuizStep {
  id: number
  field: string
  question: string
  sublabel?: string
  type: 'single' | 'multi'
  options: StepOption[]
  columns: number
}

type ScreenState = 'welcome' | 'name' | 'step' | 'interstitial' | 'complete'

interface Answers {
  [field: string]: string | string[]
}

// ── Step Data ────────────────────────────────────────────────────────────────

const STEPS: QuizStep[] = [
  {
    id: 1,
    field: 'age_bracket',
    question: 'How old are you?',
    type: 'single',
    options: [
      { value: 'under_25', label: 'Under 25', emoji: '\u{1F331}' },
      { value: '25_34', label: '25\u201334', emoji: '\u{1F680}' },
      { value: '35_44', label: '35\u201344', emoji: '\u{1F4C8}' },
      { value: '45_54', label: '45\u201354', emoji: '\u2696\uFE0F' },
      { value: '55_64', label: '55\u201364', emoji: '\u{1F3AF}' },
      { value: '65_plus', label: '65 or over', emoji: '\u{1F305}' },
    ],
    columns: 3,
  },
  {
    id: 2,
    field: 'household',
    question: 'Who\u2019s in your household?',
    sublabel: 'This helps us tailor projections for your situation.',
    type: 'single',
    options: [
      { value: 'single', label: 'Just me', emoji: '\u{1F464}' },
      { value: 'partnered', label: 'Me and my partner', emoji: '\u{1F46B}' },
      { value: 'single_with_kids', label: 'Single parent', emoji: '\u{1F464}\u{1F467}' },
      { value: 'partnered_with_kids', label: 'Partner and kids', emoji: '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}' },
    ],
    columns: 2,
  },
  {
    id: 3,
    field: 'income_bracket',
    question: 'What\u2019s your household income?',
    sublabel: 'Combined before tax. Approximate is fine.',
    type: 'single',
    options: [
      { value: 'under_50k', label: 'Under $50k' },
      { value: '50k_100k', label: '$50k \u2013 $100k' },
      { value: '100k_150k', label: '$100k \u2013 $150k' },
      { value: '150k_200k', label: '$150k \u2013 $200k' },
      { value: '200k_plus', label: 'Over $200k' },
    ],
    columns: 2,
  },
  {
    id: 4,
    field: 'financial_confidence',
    question: 'How financially confident do you feel?',
    sublabel: 'There\u2019s no wrong answer \u2014 this helps us pitch things at the right level.',
    type: 'single',
    options: [
      { value: 'just_starting', label: 'Still finding my feet', emoji: '\u{1F331}' },
      { value: 'getting_there', label: 'Getting there', emoji: '\u{1F4DA}' },
      { value: 'pretty_savvy', label: 'Pretty across it', emoji: '\u{1F4A1}' },
      { value: 'very_confident', label: 'Very confident', emoji: '\u{1F9E0}' },
    ],
    columns: 2,
  },
  {
    id: 5,
    field: 'priority_areas',
    question: 'What do you most want to get on top of?',
    sublabel: 'Pick everything that applies.',
    type: 'multi',
    options: [
      { value: 'super_retirement', label: 'Super & retirement', emoji: '\u{1F3E6}' },
      { value: 'take_home_pay', label: 'Take-home pay & tax', emoji: '\u{1F4B0}' },
      { value: 'mortgage_debt', label: 'Mortgage & debt', emoji: '\u{1F3E0}' },
      { value: 'net_worth', label: 'Net worth & savings', emoji: '\u{1F4CA}' },
      { value: 'aged_pension', label: 'Age pension', emoji: '\u{1F3AF}' },
      { value: 'all_of_it', label: 'All of the above', emoji: '\u{1F50D}' },
    ],
    columns: 2,
  },
]

const TOTAL_STEPS = 6

// ── Interstitial Content ─────────────────────────────────────────────────────

function getInterstitialContent(
  ageBracket: string | undefined,
  incomeBracket: string | undefined,
): { headline: string; sub: string } {
  const highIncome =
    incomeBracket === '100k_150k' ||
    incomeBracket === '150k_200k' ||
    incomeBracket === '200k_plus'

  if (ageBracket === 'under_25') {
    return {
      headline: 'Super grows quietly in the background \u2014 until you look.',
      sub: 'Most people your age are surprised how much difference the next five years make to their retirement balance.',
    }
  }
  if (ageBracket === '25_34') {
    if (highIncome) {
      return {
        headline: 'At your income, you\u2019re likely crossing a tax threshold that changes your options.',
        sub: 'Signal will show you exactly where the opportunities are.',
      }
    }
    return {
      headline: 'Your 30s are the highest-leverage decade for super.',
      sub: 'Small decisions now \u2014 extra contributions, lower fees \u2014 compound for more than 30 years.',
    }
  }
  if (ageBracket === '35_44') {
    return {
      headline: 'This is the decade where the gap opens up between people who planned and people who didn\u2019t.',
      sub: 'You\u2019re in the right place.',
    }
  }
  if (ageBracket === '45_54') {
    return {
      headline: 'The decade before 55 is where retirement outcomes are actually set.',
      sub: 'There are real levers still to pull \u2014 let\u2019s find yours.',
    }
  }
  if (ageBracket === '55_64') {
    return {
      headline: 'The next few years carry more financial weight than the previous ten.',
      sub: 'Clarity now is worth thousands of dollars. You\u2019re nearly there.',
    }
  }
  if (ageBracket === '65_plus') {
    return {
      headline: 'Making your money last matters as much as having it.',
      sub: 'Signal will help you see the full picture \u2014 including what the age pension changes for you.',
    }
  }
  return {
    headline: 'You\u2019re thinking about this. Most Australians aren\u2019t.',
    sub: 'That\u2019s already a meaningful head start.',
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [screen, setScreen] = useState<ScreenState>('welcome')
  const [answers, setAnswers] = useState<Answers>({})
  const [multiSelection, setMultiSelection] = useState<string[]>([])
  const [slideDirection, setSlideDirection] = useState<'enter' | 'exit' | null>(null)
  const [completing, setCompleting] = useState(false)
  const interstitialTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initRef = useRef(false)

  // Restore existing session on mount (but don't skip the welcome screen)
  useEffect(() => {
    if (initRef.current) return
    initRef.current = true
    const existingId = document.cookie
      .split('; ')
      .find(c => c.startsWith('signal_quiz_session='))
      ?.split('=')[1]

    if (existingId) {
      setSessionId(existingId)
    }
  }, [])

  const createSession = useCallback(async () => {
    try {
      const res = await fetch('/api/onboarding/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create' }),
      })
      if (res.ok) {
        const data = await res.json()
        setSessionId(data.session_id)
        return true
      }
    } catch (err) {
      console.error('Failed to create quiz session:', err)
    }
    return false
  }, [])

  // Cleanup interstitial timer
  useEffect(() => {
    return () => {
      if (interstitialTimer.current) clearTimeout(interstitialTimer.current)
    }
  }, [])

  const saveAnswer = useCallback(
    async (field: string, value: string | string[]) => {
      if (!sessionId) return
      try {
        await fetch('/api/onboarding/quiz', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'save', session_id: sessionId, field, value }),
        })
      } catch (err) {
        console.error('Failed to save answer:', err)
      }
    },
    [sessionId],
  )

  const transitionTo = useCallback(
    (next: () => void) => {
      setSlideDirection('exit')
      setTimeout(() => {
        next()
        setSlideDirection('enter')
        setTimeout(() => setSlideDirection(null), 250)
      }, 250)
    },
    [],
  )

  const handleWelcomeCTA = useCallback(async () => {
    if (sessionId) {
      transitionTo(() => setScreen('name'))
      return
    }
    const ok = await createSession()
    if (ok) {
      transitionTo(() => setScreen('name'))
    }
  }, [sessionId, createSession, transitionTo])

  const handleNameSubmit = useCallback(
    (name: string) => {
      setAnswers(prev => ({ ...prev, preferred_name: name }))
      saveAnswer('preferred_name', name)
      transitionTo(() => setScreen('step'))
    },
    [saveAnswer, transitionTo],
  )

  const advanceStep = useCallback(() => {
    const currentStep = STEPS[currentStepIndex]
    const nextIndex = currentStepIndex + 1

    // After step 3 (index 2), show interstitial
    if (currentStep.id === 3) {
      transitionTo(() => setScreen('interstitial'))
      return
    }

    if (nextIndex < STEPS.length) {
      transitionTo(() => {
        setCurrentStepIndex(nextIndex)
        setMultiSelection([])
      })
    } else {
      transitionTo(() => setScreen('complete'))
    }
  }, [currentStepIndex, transitionTo])

  const handleSingleSelect = useCallback(
    (field: string, value: string) => {
      setAnswers(prev => ({ ...prev, [field]: value }))
      saveAnswer(field, value)
      setTimeout(() => advanceStep(), 180)
    },
    [saveAnswer, advanceStep],
  )

  const handleMultiToggle = useCallback((value: string) => {
    setMultiSelection(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value],
    )
  }, [])

  const handleMultiContinue = useCallback(() => {
    const step = STEPS[currentStepIndex]
    setAnswers(prev => ({ ...prev, [step.field]: multiSelection }))
    saveAnswer(step.field, multiSelection)
    advanceStep()
  }, [currentStepIndex, multiSelection, saveAnswer, advanceStep])

  const handleInterstitialSkip = useCallback(() => {
    if (interstitialTimer.current) {
      clearTimeout(interstitialTimer.current)
      interstitialTimer.current = null
    }
    transitionTo(() => {
      setScreen('step')
      setCurrentStepIndex(3) // Step 4 is index 3
      setMultiSelection([])
    })
  }, [transitionTo])

  const handleBack = useCallback(() => {
    if (screen === 'name') {
      transitionTo(() => setScreen('welcome'))
      return
    }
    if (screen === 'interstitial') {
      if (interstitialTimer.current) {
        clearTimeout(interstitialTimer.current)
        interstitialTimer.current = null
      }
      const targetField = STEPS[2].field
      transitionTo(() => {
        setAnswers(prev => { const next = { ...prev }; delete next[targetField]; return next })
        setScreen('step')
        setCurrentStepIndex(2)
      })
      return
    }
    if (screen === 'step') {
      if (currentStepIndex === 0) {
        transitionTo(() => setScreen('name'))
      } else {
        const prevIndex = currentStepIndex - 1
        const prevField = STEPS[prevIndex].field
        transitionTo(() => {
          setAnswers(prev => { const next = { ...prev }; delete next[prevField]; return next })
          setCurrentStepIndex(prevIndex)
          setMultiSelection([])
        })
      }
    }
  }, [screen, currentStepIndex, transitionTo])

  const showBackButton = screen === 'name' || screen === 'step' || screen === 'interstitial'

  // Fire complete action when completion screen mounts
  useEffect(() => {
    if (screen !== 'complete' || completing || !sessionId) return
    setCompleting(true)
    ;(async () => {
      try {
        await fetch('/api/onboarding/quiz', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'complete', session_id: sessionId }),
        })
      } catch (err) {
        console.error('Failed to complete quiz:', err)
      }
    })()
  }, [screen, completing, sessionId])

  const currentStep = STEPS[currentStepIndex]
  const progressPercent =
    screen === 'welcome'
      ? 0
      : screen === 'name'
        ? (1 / TOTAL_STEPS) * 100
        : screen === 'interstitial'
          ? 60
          : screen === 'complete'
            ? 100
            : ((currentStep.id + 1) / TOTAL_STEPS) * 100

  const slideClass =
    slideDirection === 'exit'
      ? 'quiz-slide-exit'
      : slideDirection === 'enter'
        ? 'quiz-slide-enter'
        : ''

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100dvh',
        background: 'var(--color-bg-base)',
      }}
    >
      {/* ── Sticky Nav + Progress ─────────────────────────────────── */}
      {screen !== 'welcome' && (
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            background: 'var(--color-bg-base)',
          }}
        >
          <nav
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 24px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {showBackButton && (
                <button
                  type="button"
                  onClick={handleBack}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 32,
                    height: 32,
                    background: 'transparent',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    color: 'var(--color-text-secondary)',
                    transition: 'all 150ms ease',
                    padding: 0,
                    marginRight: 4,
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.color = 'var(--color-text-primary)'
                    e.currentTarget.style.background = 'var(--color-bg-elevated)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color = 'var(--color-text-secondary)'
                    e.currentTarget.style.background = 'transparent'
                  }}
                  aria-label="Go back"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
              )}
              <SignalIcon />
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: 'var(--color-text-primary)',
                  letterSpacing: '-0.02em',
                }}
              >
                Signal
              </span>
            </div>
            <Link
              href="/login"
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--color-text-secondary)',
                textDecoration: 'none',
                transition: 'color 150ms ease',
              }}
            >
              Already have an account? Sign in
            </Link>
          </nav>

          {/* Progress bar */}
          <div
            style={{
              height: 3,
              background: 'var(--color-bg-elevated)',
              width: '100%',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${progressPercent}%`,
                background:
                  'linear-gradient(90deg, var(--color-accent-primary), var(--color-accent-secondary))',
                transition: 'width 300ms ease',
              }}
            />
          </div>
        </div>
      )}

      {/* ── Main Content ──────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 24px',
          maxWidth: 560,
          width: '100%',
          margin: '0 auto',
        }}
      >
        <div className={slideClass} style={{ width: '100%' }}>
          {screen === 'welcome' && (
            <WelcomeScreen onStart={handleWelcomeCTA} />
          )}

          {screen === 'name' && (
            <NameScreen onSubmit={handleNameSubmit} />
          )}

          {screen === 'step' && (
            <StepScreen
              step={currentStep}
              stepNumber={currentStep.id + 1}
              multiSelection={multiSelection}
              answeredValue={answers[currentStep.field]}
              onSingleSelect={handleSingleSelect}
              onMultiToggle={handleMultiToggle}
              onMultiContinue={handleMultiContinue}
            />
          )}

          {screen === 'interstitial' && (
            <InterstitialScreen
              name={answers.preferred_name as string | undefined}
              ageBracket={answers.age_bracket as string | undefined}
              incomeBracket={answers.income_bracket as string | undefined}
              timerRef={interstitialTimer}
              onSkip={handleInterstitialSkip}
              onAutoAdvance={handleInterstitialSkip}
            />
          )}

          {screen === 'complete' && (
            <CompletionScreen name={answers.preferred_name as string | undefined} />
          )}
        </div>
      </div>

      {/* ── Inline Styles (CSS animations, no external deps) ────── */}
      <style jsx global>{`
        @keyframes quiz-slide-exit-kf {
          from { opacity: 1; transform: translateX(0); }
          to   { opacity: 0; transform: translateX(-24px); }
        }
        @keyframes quiz-slide-enter-kf {
          from { opacity: 0; transform: translateX(24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .quiz-slide-exit {
          animation: quiz-slide-exit-kf 250ms ease forwards;
        }
        .quiz-slide-enter {
          animation: quiz-slide-enter-kf 250ms ease forwards;
        }
        @keyframes interstitial-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
        @keyframes interstitial-countdown {
          from { width: 0%; }
          to   { width: 100%; }
        }
        @keyframes completion-check-in {
          from { opacity: 0; transform: scale(0.8); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes tile-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

// ── Sub-Components ───────────────────────────────────────────────────────────

function SignalIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="12" width="3" height="6" rx="1.5" fill="var(--color-accent-primary)" />
      <rect x="7" y="8" width="3" height="10" rx="1.5" fill="var(--color-accent-primary)" />
      <rect x="12" y="4" width="3" height="14" rx="1.5" fill="var(--color-accent-secondary)" />
      <rect x="17" y="0" width="3" height="18" rx="1.5" fill="var(--color-accent-secondary)" opacity="0.5" />
    </svg>
  )
}

function WelcomeScreen({ onStart }: { onStart: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
        <SignalIcon />
        <span
          style={{
            fontSize: 17,
            fontWeight: 700,
            color: 'var(--color-text-primary)',
            letterSpacing: '-0.02em',
          }}
        >
          Signal
        </span>
      </div>

      <h1
        style={{
          fontSize: 32,
          fontWeight: 700,
          color: 'var(--color-text-primary)',
          lineHeight: 1.2,
          margin: 0,
          letterSpacing: '-0.03em',
          maxWidth: 420,
        }}
      >
        Let&rsquo;s build your financial picture
      </h1>

      <p
        style={{
          fontSize: 15,
          color: 'var(--color-text-secondary)',
          marginTop: 16,
          maxWidth: 400,
          lineHeight: 1.7,
        }}
      >
        Five quick questions about your situation. Takes about two minutes.
        At the end, Signal will personalise itself to where you actually are
        &mdash; not some generic template.
      </p>

      <div
        style={{
          display: 'flex',
          gap: 24,
          marginTop: 36,
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        {[
          { icon: '⏱', label: '2 minutes' },
          { icon: '🔓', label: 'No account needed' },
          { icon: '🎯', label: 'Personalised to you' },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--color-text-secondary)',
            }}
          >
            <span style={{ fontSize: 16 }}>{item.icon}</span>
            {item.label}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onStart}
        style={{
          width: '100%',
          maxWidth: 360,
          marginTop: 40,
          height: 48,
          fontSize: 15,
          fontWeight: 600,
          fontFamily: 'inherit',
          color: 'white',
          background: 'var(--color-accent-primary)',
          border: 'none',
          borderRadius: 'var(--radius-md)',
          cursor: 'pointer',
          transition: 'all 150ms ease',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'translateY(-1px)'
          e.currentTarget.style.boxShadow = 'var(--shadow-glow)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = 'none'
        }}
      >
        Let&rsquo;s go &rarr;
      </button>

      <Link
        href="/login"
        style={{
          marginTop: 20,
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--color-text-muted)',
          textDecoration: 'none',
          transition: 'color 150ms ease',
        }}
      >
        Already have an account? Sign in
      </Link>
    </div>
  )
}

function NameScreen({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const trimmed = value.trim()
  const canSubmit = trimmed.length >= 2

  const handleSubmit = () => {
    if (canSubmit) onSubmit(trimmed)
  }

  return (
    <div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--color-text-muted)',
          marginBottom: 12,
        }}
      >
        Step 1 of {TOTAL_STEPS}
      </div>

      <h1
        style={{
          fontSize: 26,
          fontWeight: 700,
          color: 'var(--color-text-primary)',
          lineHeight: 1.3,
          margin: 0,
          letterSpacing: '-0.02em',
        }}
      >
        First, what should we call you?
      </h1>

      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
        placeholder="Your first name"
        style={{
          width: '100%',
          marginTop: 32,
          padding: '14px 16px',
          fontSize: 16,
          fontWeight: 400,
          fontFamily: 'inherit',
          color: 'var(--color-text-primary)',
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          outline: 'none',
          transition: 'border-color 150ms ease, box-shadow 150ms ease',
        }}
        onFocus={e => {
          e.currentTarget.style.borderColor = 'var(--color-accent-primary)'
          e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-accent-glow)'
        }}
        onBlur={e => {
          e.currentTarget.style.borderColor = 'var(--color-border)'
          e.currentTarget.style.boxShadow = 'none'
        }}
      />

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          width: '100%',
          marginTop: 20,
          padding: '14px 0',
          fontSize: 15,
          fontWeight: 600,
          fontFamily: 'inherit',
          color: canSubmit ? 'white' : 'var(--color-text-muted)',
          background: canSubmit ? 'var(--color-accent-primary)' : 'var(--color-bg-elevated)',
          border: 'none',
          borderRadius: 'var(--radius-md)',
          cursor: canSubmit ? 'pointer' : 'default',
          transition: 'all 150ms ease',
        }}
      >
        Continue &rarr;
      </button>
    </div>
  )
}

function StepScreen({
  step,
  stepNumber,
  multiSelection,
  answeredValue,
  onSingleSelect,
  onMultiToggle,
  onMultiContinue,
}: {
  step: QuizStep
  stepNumber: number
  multiSelection: string[]
  answeredValue: string | string[] | undefined
  onSingleSelect: (field: string, value: string) => void
  onMultiToggle: (value: string) => void
  onMultiContinue: () => void
}) {
  const singleLocked = step.type === 'single' && answeredValue != null

  const handleTileClick = (value: string) => {
    if (step.type === 'single') {
      if (singleLocked) return
      onSingleSelect(step.field, value)
    } else {
      onMultiToggle(value)
    }
  }

  const isOddLastItem = step.options.length % 2 !== 0

  return (
    <div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--color-text-muted)',
          marginBottom: 12,
        }}
      >
        Step {stepNumber} of {TOTAL_STEPS}
      </div>

      <h1
        style={{
          fontSize: 26,
          fontWeight: 700,
          color: 'var(--color-text-primary)',
          lineHeight: 1.3,
          margin: 0,
          letterSpacing: '-0.02em',
        }}
      >
        {step.question}
      </h1>

      {step.sublabel && (
        <p
          style={{
            fontSize: 14,
            color: 'var(--color-text-secondary)',
            marginTop: 8,
            margin: '8px 0 0',
            lineHeight: 1.5,
          }}
        >
          {step.sublabel}
        </p>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${step.columns}, 1fr)`,
          gap: 12,
          marginTop: 32,
        }}
        className="quiz-tile-grid"
      >
        {step.options.map((opt, i) => {
          const isActive =
            step.type === 'single'
              ? answeredValue === opt.value
              : multiSelection.includes(opt.value)
          const isLastOdd = isOddLastItem && i === step.options.length - 1

          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleTileClick(opt.value)}
              disabled={singleLocked}
              className="quiz-tile"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '16px 20px',
                minHeight: 52,
                background: isActive ? 'rgba(79,142,247,0.10)' : 'var(--color-bg-elevated)',
                border: isActive
                  ? '1px solid var(--color-accent-primary)'
                  : '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                cursor: singleLocked ? 'default' : 'pointer',
                transition: 'all 150ms ease',
                textAlign: 'left',
                fontFamily: 'inherit',
                animation: `tile-in 200ms ease both`,
                animationDelay: `${i * 40}ms`,
                boxShadow: isActive ? '0 0 0 1px var(--color-accent-primary)' : 'none',
                gridColumn: isLastOdd && step.columns === 2 ? '1 / -1' : undefined,
              }}
            >
              {opt.emoji && (
                <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{opt.emoji}</span>
              )}
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 500,
                  color: 'var(--color-text-primary)',
                }}
              >
                {opt.label}
              </span>
            </button>
          )
        })}
      </div>

      {step.type === 'multi' && (
        <button
          type="button"
          onClick={onMultiContinue}
          disabled={multiSelection.length === 0}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            width: '100%',
            marginTop: 24,
            padding: '14px 0',
            fontSize: 15,
            fontWeight: 600,
            fontFamily: 'inherit',
            color: multiSelection.length > 0 ? 'white' : 'var(--color-text-muted)',
            background:
              multiSelection.length > 0
                ? 'var(--color-accent-primary)'
                : 'var(--color-bg-elevated)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            cursor: multiSelection.length > 0 ? 'pointer' : 'default',
            transition: 'all 150ms ease',
          }}
        >
          Continue &rarr;
        </button>
      )}

      <style jsx global>{`
        .quiz-tile:hover:not(:disabled) {
          border-color: var(--color-border-strong) !important;
          background: #22242E !important;
        }
        .quiz-tile-grid {
          /* Responsive: collapse to 1 column below 400px */
        }
        @media (max-width: 400px) {
          .quiz-tile-grid {
            grid-template-columns: 1fr !important;
          }
          .quiz-tile {
            grid-column: auto !important;
          }
        }
      `}</style>
    </div>
  )
}

function InterstitialScreen({
  name,
  ageBracket,
  incomeBracket,
  timerRef,
  onSkip,
  onAutoAdvance,
}: {
  name: string | undefined
  ageBracket: string | undefined
  incomeBracket: string | undefined
  timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  onSkip: () => void
  onAutoAdvance: () => void
}) {
  const base = getInterstitialContent(ageBracket, incomeBracket)
  const headline = name ? `${name}, ${base.headline.charAt(0).toLowerCase()}${base.headline.slice(1)}` : base.headline
  const sub = base.sub
  const [countdownActive, setCountdownActive] = useState(false)

  useEffect(() => {
    setCountdownActive(true)
    timerRef.current = setTimeout(() => {
      onAutoAdvance()
    }, 3500)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [onAutoAdvance, timerRef])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
      }}
    >
      {/* Pulsing icon */}
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'var(--color-bg-elevated)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 24px var(--color-accent-glow)',
          animation: 'interstitial-pulse 1.6s ease-in-out infinite',
          marginBottom: 28,
        }}
      >
        <svg width="32" height="32" viewBox="0 0 20 20" fill="none">
          <rect x="2" y="12" width="3" height="6" rx="1.5" fill="var(--color-accent-primary)" />
          <rect x="7" y="8" width="3" height="10" rx="1.5" fill="var(--color-accent-primary)" />
          <rect x="12" y="4" width="3" height="14" rx="1.5" fill="var(--color-accent-secondary)" />
          <rect x="17" y="0" width="3" height="18" rx="1.5" fill="var(--color-accent-secondary)" opacity="0.5" />
        </svg>
      </div>

      <h2
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: 'var(--color-text-primary)',
          lineHeight: 1.3,
          maxWidth: 400,
          margin: 0,
          letterSpacing: '-0.02em',
        }}
      >
        {headline}
      </h2>

      <p
        style={{
          fontSize: 15,
          color: 'var(--color-text-secondary)',
          marginTop: 12,
          maxWidth: 380,
          lineHeight: 1.6,
        }}
      >
        {sub}
      </p>

      {/* Countdown bar */}
      <div
        style={{
          width: '100%',
          maxWidth: 320,
          height: 2,
          background: 'var(--color-bg-elevated)',
          borderRadius: 1,
          marginTop: 32,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            background:
              'linear-gradient(90deg, var(--color-accent-primary), var(--color-accent-secondary))',
            animation: countdownActive ? 'interstitial-countdown 3.5s linear forwards' : 'none',
          }}
        />
      </div>

      <button
        type="button"
        onClick={onSkip}
        style={{
          marginTop: 20,
          fontSize: 13,
          fontWeight: 500,
          fontFamily: 'inherit',
          color: 'var(--color-text-muted)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          transition: 'color 150ms ease',
          padding: '4px 8px',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.color = 'var(--color-text-secondary)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.color = 'var(--color-text-muted)'
        }}
      >
        Keep going &rarr;
      </button>
    </div>
  )
}

function CompletionScreen({ name }: { name: string | undefined }) {
  const router = useRouter()

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
      }}
    >
      {/* Check icon */}
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background:
            'linear-gradient(135deg, var(--color-accent-primary), var(--color-accent-secondary))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 28,
          animation: 'completion-check-in 400ms ease both',
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>

      <h1
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: 'var(--color-text-primary)',
          margin: 0,
          letterSpacing: '-0.02em',
        }}
      >
        {name ? `Your profile is ready, ${name}.` : 'Your profile is ready.'}
      </h1>

      <p
        style={{
          fontSize: 15,
          color: 'var(--color-text-secondary)',
          marginTop: 12,
          maxWidth: 380,
          lineHeight: 1.6,
        }}
      >
        Create a free account to save your results and get a personalised plan.
      </p>

      <button
        type="button"
        onClick={() => router.push('/signup?from=onboarding')}
        style={{
          width: '100%',
          maxWidth: 400,
          marginTop: 32,
          height: 48,
          fontSize: 15,
          fontWeight: 600,
          fontFamily: 'inherit',
          color: 'white',
          background: 'var(--color-accent-primary)',
          border: 'none',
          borderRadius: 'var(--radius-md)',
          cursor: 'pointer',
          transition: 'all 150ms ease',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'translateY(-1px)'
          e.currentTarget.style.boxShadow = 'var(--shadow-glow)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = 'none'
        }}
      >
        Create your account &rarr;
      </button>

      <Link
        href="/login"
        style={{
          marginTop: 16,
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--color-text-secondary)',
          textDecoration: 'none',
          transition: 'color 150ms ease',
        }}
      >
        Already have an account? Sign in
      </Link>

      <p
        style={{
          marginTop: 16,
          fontSize: 12,
          color: 'var(--color-text-muted)',
        }}
      >
        No credit card. Free forever for personal use.
      </p>
    </div>
  )
}
