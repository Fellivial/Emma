-- Add email unsubscribe flag to profiles so the email cron can suppress sends
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_unsubscribed BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for efficient suppression lookup in the email cron
CREATE INDEX IF NOT EXISTS idx_profiles_email_unsubscribed
  ON public.profiles (id)
  WHERE email_unsubscribed = TRUE;
