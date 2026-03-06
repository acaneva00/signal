-- =============================================================================
-- Add support for structured inputs and outputs
-- =============================================================================

-- Add channel column to messages (defaults to 'web')
ALTER TABLE public.messages 
ADD COLUMN channel TEXT DEFAULT 'web';

-- Add structured_response column for user messages with structured inputs
ALTER TABLE public.messages 
ADD COLUMN structured_response JSONB;

-- Add input_request column for assistant messages requesting structured input
ALTER TABLE public.messages 
ADD COLUMN input_request JSONB;

-- Create index for channel filtering
CREATE INDEX idx_messages_channel ON public.messages (channel);

-- Add comment for documentation
COMMENT ON COLUMN public.messages.structured_response IS 'Stores structured input data from user responses, including field path, value, source, and confidence';
COMMENT ON COLUMN public.messages.input_request IS 'Stores structured input request from agent, including type, options, field path, and validation rules';
COMMENT ON COLUMN public.messages.channel IS 'Communication channel (web, sms, etc)';
