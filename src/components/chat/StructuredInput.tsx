'use client'

import { useState } from 'react'
import { InputRequest, StructuredResponse } from '@/types/agent'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface StructuredInputProps {
  inputRequest: InputRequest
  onSelect: (displayText: string, structuredValue: StructuredResponse) => void
}

export function StructuredInput({ inputRequest, onSelect }: StructuredInputProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [numericValue, setNumericValue] = useState<number>(
    inputRequest.range?.default ?? inputRequest.range?.min ?? 0
  )
  const [isSubmitted, setIsSubmitted] = useState(false)

  const handleSingleSelect = (option: { label: string; value: string }) => {
    setIsSubmitted(true)
    
    const structuredValue: StructuredResponse = {
      field: inputRequest.field,
      value: option.value,
      source: 'structured_input',
      confidence: 1.0
    }
    
    onSelect(option.label, structuredValue)
  }

  const handleMultiSelectToggle = (value: string) => {
    const newSelected = new Set(selected)
    if (newSelected.has(value)) {
      newSelected.delete(value)
    } else {
      newSelected.add(value)
    }
    setSelected(newSelected)
  }

  const handleMultiSelectConfirm = () => {
    setIsSubmitted(true)
    
    const selectedOptions = inputRequest.options?.filter(opt => selected.has(opt.value)) ?? []
    const displayText = selectedOptions.map(opt => opt.label).join(', ')
    const values = selectedOptions.map(opt => opt.value)
    
    const structuredValue: StructuredResponse = {
      field: inputRequest.field,
      value: values,
      source: 'structured_input',
      confidence: 1.0
    }
    
    onSelect(displayText, structuredValue)
  }

  const handleNumericConfirm = () => {
    setIsSubmitted(true)
    
    const formatValue = (val: number) => {
      const format = inputRequest.range?.format ?? ''
      if (format.includes('$')) {
        return `$${val.toLocaleString()}`
      }
      if (format.includes('%')) {
        return `${val}%`
      }
      return val.toLocaleString()
    }
    
    const displayText = formatValue(numericValue)
    
    const structuredValue: StructuredResponse = {
      field: inputRequest.field,
      value: numericValue,
      source: 'structured_input',
      confidence: 1.0
    }
    
    onSelect(displayText, structuredValue)
  }

  const handleSkip = () => {
    setIsSubmitted(true)
    
    const structuredValue: StructuredResponse = {
      field: inputRequest.field,
      value: null,
      source: 'structured_input',
      confidence: 0
    }
    
    onSelect('(Skipped)', structuredValue)
  }

  if (inputRequest.type === 'single_select' && inputRequest.options) {
    return (
      <div className="mt-4 mb-2">
        <div className={cn(
          "grid gap-2 grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
          isSubmitted && "pointer-events-none"
        )}>
          {inputRequest.options.map((option) => {
            const isSelected = isSubmitted && selected.has(option.value)
            const wasNotSelected = isSubmitted && !selected.has(option.value)
            
            return (
              <button
                key={option.value}
                onClick={() => {
                  setSelected(new Set([option.value]))
                  handleSingleSelect(option)
                }}
                disabled={isSubmitted}
                className={cn(
                  "px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all",
                  "hover:shadow-md",
                  !isSubmitted && "border-[#1A365D] bg-white text-slate-900 hover:bg-[#1A365D] hover:text-white",
                  isSelected && "border-[#1A365D] bg-[#1A365D] text-white",
                  wasNotSelected && "opacity-30 border-slate-300"
                )}
              >
                {option.label}
              </button>
            )
          })}
        </div>
        
        {!inputRequest.required && !isSubmitted && (
          <button
            onClick={handleSkip}
            className="mt-3 text-xs text-slate-500 hover:text-slate-700 underline"
          >
            Skip
          </button>
        )}
      </div>
    )
  }

  if (inputRequest.type === 'multi_select' && inputRequest.options) {
    return (
      <div className="mt-4 mb-2">
        <div className={cn(
          "grid gap-2 grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
          isSubmitted && "pointer-events-none"
        )}>
          {inputRequest.options.map((option) => {
            const isSelected = selected.has(option.value)
            const wasNotSelected = isSubmitted && !selected.has(option.value)
            
            return (
              <button
                key={option.value}
                onClick={() => handleMultiSelectToggle(option.value)}
                disabled={isSubmitted}
                className={cn(
                  "px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all",
                  "flex items-center gap-2 hover:shadow-md",
                  !isSubmitted && !isSelected && "border-[#1A365D] bg-white text-slate-900 hover:bg-[#1A365D] hover:text-white",
                  !isSubmitted && isSelected && "border-[#1A365D] bg-[#1A365D] text-white",
                  wasNotSelected && "opacity-30 border-slate-300",
                  isSubmitted && isSelected && "border-[#1A365D] bg-[#1A365D] text-white"
                )}
              >
                <div className={cn(
                  "w-4 h-4 border-2 rounded flex items-center justify-center flex-shrink-0",
                  isSelected && !isSubmitted && "border-white bg-white",
                  isSelected && isSubmitted && "border-white bg-white",
                  !isSelected && "border-[#1A365D]"
                )}>
                  {isSelected && (
                    <svg className="w-3 h-3 text-[#1A365D]" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M10 3L4.5 8.5L2 6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
                <span>{option.label}</span>
              </button>
            )
          })}
        </div>
        
        {!isSubmitted && selected.size > 0 && (
          <Button
            onClick={handleMultiSelectConfirm}
            className="mt-4 w-full md:w-auto"
          >
            Confirm ({selected.size} selected)
          </Button>
        )}
        
        {!inputRequest.required && !isSubmitted && (
          <button
            onClick={handleSkip}
            className="mt-3 text-xs text-slate-500 hover:text-slate-700 underline block"
          >
            Skip
          </button>
        )}
      </div>
    )
  }

  if (inputRequest.type === 'numeric_input' && inputRequest.range) {
    const { min, max, step, format } = inputRequest.range
    
    return (
      <div className={cn(
        "mt-4 mb-2 p-4 border-2 border-[#1A365D] rounded-lg bg-white",
        isSubmitted && "opacity-50 pointer-events-none"
      )}>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-900">
              {format.includes('$') ? 'Amount' : 'Value'}
            </label>
            <span className="text-lg font-semibold text-[#1A365D]">
              {format.includes('$') && '$'}
              {numericValue.toLocaleString()}
              {format.includes('%') && '%'}
            </span>
          </div>
          
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={numericValue}
            onChange={(e) => setNumericValue(Number(e.target.value))}
            disabled={isSubmitted}
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#1A365D]"
            style={{
              background: `linear-gradient(to right, #1A365D 0%, #1A365D ${((numericValue - min) / (max - min)) * 100}%, #e2e8f0 ${((numericValue - min) / (max - min)) * 100}%, #e2e8f0 100%)`
            }}
          />
          
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={min}
              max={max}
              step={step}
              value={numericValue}
              onChange={(e) => setNumericValue(Number(e.target.value))}
              disabled={isSubmitted}
              className="flex-1"
            />
            <Button
              onClick={handleNumericConfirm}
              disabled={isSubmitted}
            >
              Confirm
            </Button>
          </div>
          
          <div className="flex justify-between text-xs text-slate-500">
            <span>
              {format.includes('$') && '$'}
              {min.toLocaleString()}
              {format.includes('%') && '%'}
            </span>
            <span>
              {format.includes('$') && '$'}
              {max.toLocaleString()}
              {format.includes('%') && '%'}
            </span>
          </div>
        </div>
        
        {!inputRequest.required && !isSubmitted && (
          <button
            onClick={handleSkip}
            className="mt-3 text-xs text-slate-500 hover:text-slate-700 underline"
          >
            Skip
          </button>
        )}
      </div>
    )
  }

  return null
}
