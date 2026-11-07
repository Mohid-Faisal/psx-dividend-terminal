import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://dlpjkbaczcgqzucwmdfp.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRscGprYmFjemNncXp1Y3dtZGZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MjcyOTQsImV4cCI6MjA5MTMwMzI5NH0.iSdxPEj6LsAYejr8K-0zEIxGpi8f5jgYlqGnRT0Nd9w";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
  },
});

export function getSupabaseBrowserClient() {
  return supabase;
}
