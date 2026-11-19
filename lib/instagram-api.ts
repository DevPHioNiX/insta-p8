// Unified login (system-user / business tokens) is served from graph.facebook.com.
// "/me" resolves to the token owner (e.g. a system user), not the Instagram account,
// so every call addresses the IG professional account by its ID.
export const GRAPH = "https://graph.facebook.com/v24.0"

export interface IGAuth {
  token: string
  igId: string
}

/**
 * Build IGAuth from a users row. page_id is a text column, so it keeps the full
 * 17-digit IG account ID; business_account_id is bigint and loses precision in JS.
 */
export function igAuth(user: { access_token: string; page_id?: string | null; business_account_id?: any }): IGAuth {
  return { token: user.access_token, igId: String(user.page_id ?? user.business_account_id) }
}

export interface IGButton {
  type: "web_url" | "postback"
  title: string
  url?: string
  payload?: string
}

export interface IGCard {
  title: string
  subtitle?: string
  image_url?: string
  buttons: IGButton[]
}

export interface QuickReply {
  title: string
  payload: string
}

export interface SendResult {
  ok: boolean
  id?: string
  error?: any
}

async function post(path: string, token: string, body: any): Promise<SendResult> {
  try {
    const res = await fetch(`${GRAPH}/${path}?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (!res.ok || json.error) {
      console.error(`[ig-api] ${path} failed:`, JSON.stringify(json.error))
      return { ok: false, error: json.error || `HTTP ${res.status}` }
    }
    return { ok: true, id: json.id || json.message_id }
  } catch (e) {
    console.error(`[ig-api] ${path} network error:`, e)
    return { ok: false, error: e }
  }
}

export function buildCardAttachment(card: IGCard) {
  const buttons = (card.buttons || [])
    .filter((b) => b.title)
    .map((b) => ({
      type: b.type,
      title: b.title,
      url: b.type === "web_url" ? b.url : undefined,
      payload: b.type === "postback" ? b.payload : undefined,
    }))
  const element: any = { title: card.title, buttons }
  if (card.subtitle) element.subtitle = card.subtitle
  if (card.image_url?.startsWith("http")) element.image_url = card.image_url
  return {
    attachment: {
      type: "template",
      payload: { template_type: "generic", elements: [element] },
    },
  }
}

/**
 * Build the follower-gate card shown to non-followers. Centralized so the
 * comment, story, and DM branches all share the same copy and the same
 * `as const` button types — preserving the `"web_url"` / `"postback"`
 * literal types that `IGButton` requires.
 */
export function buildFollowGateCard(params: {
  username: string
  ruleId: string
  title?: string
  subtitle?: string
}): IGCard {
  return {
    title: params.title ?? "Before you lose me",
    subtitle: params.subtitle ?? `Follow @${params.username} to unlock this content!`,
    buttons: [
      { type: "web_url", url: `https://instagram.com/${params.username}`, title: "Follow" },
      { type: "postback", title: "I Followed! ✅", payload: `UNLOCK_CONTENT_${params.ruleId}` },
    ],
  }
}

export async function sendTextDM(
  auth: IGAuth,
  recipient: { id?: string; comment_id?: string },
  text: string,
  quickReplies?: QuickReply[],
): Promise<SendResult> {
  const message: any = { text }
  if (quickReplies?.length) {
    message.quick_replies = quickReplies.slice(0, 13).map((q) => ({
      content_type: "text",
      title: q.title.slice(0, 20),
      payload: q.payload,
    }))
  }
  return post(`${auth.igId}/messages`, auth.token, { recipient, message })
}

export async function sendCardDM(
  auth: IGAuth,
  recipient: { id?: string; comment_id?: string },
  card: IGCard,
): Promise<SendResult> {
  return post(`${auth.igId}/messages`, auth.token, { recipient, message: buildCardAttachment(card) })
}

export async function sendMediaDM(
  auth: IGAuth,
  recipient: { id?: string; comment_id?: string },
  mediaType: "image" | "video" | "audio",
  url: string,
): Promise<SendResult> {
  return post(`${auth.igId}/messages`, auth.token, {
    recipient,
    message: { attachment: { type: mediaType, payload: { url } } },
  })
}

export async function sendSenderAction(
  auth: IGAuth,
  recipientId: string,
  action: "typing_on" | "typing_off" | "mark_seen",
): Promise<SendResult> {
  return post(`${auth.igId}/messages`, auth.token, { recipient: { id: recipientId }, sender_action: action })
}

export async function sendMessageReaction(
  auth: IGAuth,
  recipientId: string,
  messageId: string,
  reaction = "love",
): Promise<SendResult> {
  return post(`${auth.igId}/messages`, auth.token, {
    recipient: { id: recipientId },
    sender_action: "react",
    payload: { message_id: messageId, reaction },
  })
}

export async function replyToComment(auth: IGAuth, commentId: string, message: string): Promise<SendResult> {
  return post(`${commentId}/replies`, auth.token, { message })
}

export async function fetchProfile(token: string, igUserId: string): Promise<{ username?: string; name?: string } | null> {
  try {
    const res = await fetch(`${GRAPH}/${igUserId}?fields=username,name&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(5000) })
    const json = await res.json()
    if (!res.ok || json.error) return null
    return json
  } catch {
    return null
  }
}

export async function verifyIdOwnership(token: string, id: string): Promise<boolean> {
  try {
    const res = await fetch(`${GRAPH}/${id}?fields=id&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(5000) })
    return res.ok
  } catch {
    return false
  }
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, Math.min(ms, 8000)))
}
