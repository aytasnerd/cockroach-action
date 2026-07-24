// Fill these in after creating your Supabase project.
//
//   Dashboard > Project Settings > API
//     SUPABASE_URL  = "Project URL"
//     SUPABASE_KEY  = the publishable / anon key  (sb_publishable_... or eyJ...)
//
// The publishable key is designed to be public. It is safe in this file and
// safe in a public repo. All access control comes from the row-level security
// policies in supabase/schema.sql, never from keeping this key secret.
// Never put the service_role / sb_secret_ key here.
//
// Leave these empty and the site still runs: it falls back to the committed
// snapshot in data/demands.json and quietly disables voting, which is what
// you want while setting up or if Supabase is ever down.

window.CA_CONFIG = {
  SUPABASE_URL: "https://xlztuusnaxduajgtibvg.supabase.co",
  SUPABASE_KEY: "sb_publishable_YAsHRtbza3e4D6dJcCDv1w_GwPONU9P",
  CHAPTER: "default",

  // Where the app reads the demand list from when it wants to be fast.
  // This file is a CDN-cached snapshot committed by the GitHub Action, so
  // first paint never waits on the database.
  SNAPSHOT_URL: "data/demands.json",
};
