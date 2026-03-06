/**
 * Agent Output Schema Types
 * Section 6: Agent Specifications - Extended Output Schema
 */

export interface ProjectionResult {
  // Define based on your projection result structure
  [key: string]: any
}

export interface CanvasConfig {
  // Define based on your canvas configuration structure
  [key: string]: any
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
  projection_result?: ProjectionResult
  canvas_config?: CanvasConfig
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
