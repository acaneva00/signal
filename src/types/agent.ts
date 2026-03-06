/**
 * Agent Output Schema Types
 * Section 6: Agent Specifications - Extended Output Schema
 */

import type {
  ProjectionSummary,
  ComparisonResult,
  TrajectoryPoint,
  YearlyDetail,
} from '@/engine/api'

export type { ProjectionSummary, ComparisonResult, TrajectoryPoint, YearlyDetail }

export type CanvasPanel =
  | { type: 'projection_chart'; summary: ProjectionSummary; assumptions: string[] }
  | { type: 'scenario_comparison'; comparison: ComparisonResult; assumptions: string[] }
  | { type: 'fee_impact'; comparison: ComparisonResult }
  | { type: 'tax_breakdown'; detail: YearlyDetail }
  | { type: 'cash_flow'; detail: YearlyDetail }
  | { type: 'balance_sheet'; summary: ProjectionSummary }
  | { type: 'forecast_table'; summary: ProjectionSummary }
  | { type: 'empty' }

export interface CanvasState {
  panels: CanvasPanel[]
  profileCompleteness: number
}

export interface InputRequest {
  type: 'single_select' | 'multi_select' | 'numeric_input' | 'free_text'
  options?: Array<{ 
    label: string
    value: string
    icon?: string 
  }>
  range?: { 
    min: number
    max: number
    step: number
    default: number
    format: string 
  }
  field: string           // maps to financial_profiles field path
  required: boolean       // if false, show skip option
  allow_free_text?: boolean // if true, show 'Other' option with text input
}

export interface AgentOutput {
  message: string
  projection_summary?: ProjectionSummary
  comparison_result?: ComparisonResult
  canvas_panels?: CanvasPanel[]
  assumptions?: string[]
  disclaimers?: string[]
  input_request?: InputRequest
}

/**
 * Structured Response from User Input
 */
export interface StructuredResponse {
  field: string
  value: any
  source: 'structured_input'
  confidence: 1.0
}

/**
 * Message Request Body
 */
export interface MessageRequest {
  message: string
  structured_response?: StructuredResponse
}

/**
 * User Message with Display Text
 * When frontend sends a structured response, it provides both display text and structured value
 */
export interface UserMessageWithStructuredInput {
  display_text: string  // shown in chat history, what Claude sees
  structured_value: StructuredResponse
}
