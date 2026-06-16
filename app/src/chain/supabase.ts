// Browser-side Supabase client used for Realtime multiplayer (Presence +
// Broadcast). There is NO game server: peers coordinate purely through Supabase
// Realtime channels.
//
// SECURITY: the anon key below is the project's PUBLIC anonymous key and is safe
// to ship in client code — it grants only what Row Level Security allows. The
// service-role key (which bypasses RLS) is NEVER used here; it lives exclusively
// in the serverless functions under app/api.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://fqsvgqlccimrmgriretd.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxc3ZncWxjY2ltcm1ncmlyZXRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MTU3MDAsImV4cCI6MjA5NzE5MTcwMH0.p2Lm6k2cL5Fhy0eZbS85Mav-zLs9PnICqfbeaj-ZHBM';

// eventsPerSecond caps the client-side rate at which Realtime messages (e.g.
// position broadcasts) are flushed. We throttle movement to ~10/sec in
// multiplayer.ts, comfortably under this ceiling.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: { params: { eventsPerSecond: 20 } },
});
