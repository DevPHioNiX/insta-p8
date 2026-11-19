// Links a Business Manager system-user token to an Instagram account in Supabase,
// replacing the Instagram Login OAuth flow that new Meta apps no longer get.
//
// Usage: node scripts/connect-system-user.mjs [igAccountId]
//   Reads META_SYSTEM_USER_TOKEN, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY from .env.local.
//   Without igAccountId, uses the first IG account assigned to the system user.
//   Prints the userId to put in localStorage (ig_user_id) to open the dashboard.

import fs from "node:fs"
import { createClient } from "@supabase/supabase-js"

const GRAPH = "https://graph.facebook.com/v24.0"

const env = Object.fromEntries(
  fs
    .readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
)

const token = env.META_SYSTEM_USER_TOKEN
if (!token) throw new Error("META_SYSTEM_USER_TOKEN missing in .env.local")

async function graph(path) {
  const res = await fetch(`${GRAPH}/${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`)
  const json = await res.json()
  if (json.error) throw new Error(`${path}: ${json.error.message}`)
  return json
}

let igId = process.argv[2]
if (!igId) {
  const { data } = await graph("me/assigned_instagram_accounts")
  if (!data?.length) throw new Error("No Instagram account assigned to this system user")
  igId = data[0].id
}

const profile = await graph(`${igId}?fields=id,username`)

// users.id is bigint and read back as a JS number, so a 17-digit IG ID would lose
// precision in .eq("id", user.id) lookups. Use a small stable internal ID instead;
// the real IG ID lives in page_id (text) and business_account_id.
const userId = Number(env.INSTAAUTO_USER_ID || 1)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const { error } = await supabase.from("users").upsert(
  {
    id: userId,
    username: profile.username,
    access_token: token,
    token_expires_at: null, // system-user tokens never expire
    business_account_id: igId,
    page_id: igId,
    updated_at: new Date().toISOString(),
  },
  { onConflict: "id" },
)
if (error) throw error

console.log(`Connected @${profile.username} (IG ${igId}) as users.id=${userId}`)
console.log(`Dashboard login: localStorage ig_user_id=${userId}, ig_username=${profile.username}`)
