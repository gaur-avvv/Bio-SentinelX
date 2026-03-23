-- =============================================
-- Email Alert System Tables
-- BioSentinel - Resend Integration
-- =============================================

-- Table: email_alert_config
-- Stores per-user email alert configuration
CREATE TABLE IF NOT EXISTS public.email_alert_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT false,
  recipient_email TEXT NOT NULL,
  lead_time_hours INTEGER DEFAULT 12 CHECK (lead_time_hours BETWEEN 1 AND 72),
  min_severity_score INTEGER DEFAULT 60 CHECK (min_severity_score BETWEEN 0 AND 100),
  only_critical BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- RLS Policies for email_alert_config
ALTER TABLE public.email_alert_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own config" 
  ON public.email_alert_config FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own config" 
  ON public.email_alert_config FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own config" 
  ON public.email_alert_config FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own config" 
  ON public.email_alert_config FOR DELETE 
  USING (auth.uid() = user_id);

-- Table: email_alert_logs
-- Stores sent alerts for deduplication and audit trail
CREATE TABLE IF NOT EXISTS public.email_alert_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_key TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  severity TEXT NOT NULL,
  total_score INTEGER NOT NULL,
  city TEXT NOT NULL,
  event_date TEXT NOT NULL,
  primary_factor TEXT NOT NULL,
  email_subject TEXT,
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'pending')),
  resend_message_id TEXT,
  sent_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, alert_key)
);

-- RLS Policies for email_alert_logs
ALTER TABLE public.email_alert_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own logs" 
  ON public.email_alert_logs FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own logs" 
  ON public.email_alert_logs FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_email_alert_logs_user_key 
  ON public.email_alert_logs(user_id, alert_key);

CREATE INDEX IF NOT EXISTS idx_email_alert_logs_sent_at 
  ON public.email_alert_logs(sent_at DESC);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for email_alert_config updated_at
DROP TRIGGER IF EXISTS update_email_alert_config_updated_at ON public.email_alert_config;
CREATE TRIGGER update_email_alert_config_updated_at
  BEFORE UPDATE ON public.email_alert_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
