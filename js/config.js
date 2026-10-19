/* Paste the two values from Supabase: Project Settings > API Keys.

   SUPABASE_ANON_KEY must be the PUBLISHABLE key (starts with sb_publishable_)
   or the legacy "anon" key (a long token starting eyJ). Both are designed to be
   public; what they can reach is limited by the security rules in supabase/schema.sql.

   NEVER paste a SECRET key (sb_secret_...) or the legacy "service_role" key here.
   Those bypass every security rule, and GitHub will flag them and Supabase will
   revoke them. The site refuses to run if it finds one. */
window.DC_CONFIG = {
  SUPABASE_URL: "https://kezyhwykfiifkvtxfnyj.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_V-3ci5Tto8BWuyoHouPf1A_OEtRqgIJ"
};
