import { createClient } from '@supabase/supabase-js';

// The service_role key bypasses Row Level Security entirely, and the
// NEXT_PUBLIC_ prefix inlines it into the browser bundle at build time.
export const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!
);
