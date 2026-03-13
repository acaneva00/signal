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

export interface FeeComponent {
  label: string
  annual_dollar: number
  basis: string
  type: 'flat' | 'percentage'
}

export interface FundFeeBreakdown {
  fund_name: string
  investment_option: string
  growth_pct: number
  defensive_pct: number
  total_annual_fee: number
  fee_components: FeeComponent[]
}

export interface FeeProjectionRow {
  year: number
  balance: number
  admin_fee_dollar: number
  admin_fee_effective_pct: number
  investment_fee_dollar: number
  yearly_total: number
  cumulative: number
}

export interface FundFeeProjection {
  fund_name: string
  rows: FeeProjectionRow[]
}

export interface FeeBreakdownComparison {
  funds: FundFeeBreakdown[]
  balance_used: number
  projection_diff?: number
  yearly_fee_projections?: FundFeeProjection[]
}

export type CanvasPanel =
  | { type: 'projection_chart'; summary: ProjectionSummary; assumptions: string[] }
  | { type: 'scenario_comparison'; comparison: ComparisonResult; assumptions: string[] }
  | { type: 'fee_impact'; comparison: ComparisonResult }
  | { type: 'fee_breakdown'; data: FeeBreakdownComparison }
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
  type: 'numeric' | 'chips' | 'segmented' | 'text'
  field: string
  required: boolean
  label?: string
  hint?: string
  placeholder?: string
  options?: Array<{ label: string; value: string }>
  format?: 'currency' | 'year' | 'age' | 'number'
  min?: number
  max?: number
  autocomplete?: boolean
  autocomplete_url?: string
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
  confidence: number
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
