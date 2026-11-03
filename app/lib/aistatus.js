// Whether an AI provider is refusing requests because its account has no credits: Anthropic (Claude,
// the chat and Talk answers) or OpenAI (Talk's speech, translations). Every AI feature reports here,
// so parents get a clear "unavailable, please call" message and the admin dashboard shows which
// account to top up, until a request works again.

const BILLING = {
  Anthropic: "https://platform.claude.com/",   // then Settings → Billing
  OpenAI: "https://platform.openai.com/settings/organization/billing/",
};
const state = new Map(); // provider -> { since (ISO time), kind: "no_credits" | "bad_key" }

// OpenAI answers 429 "insufficient_quota" / "no credits remaining"; Anthropic answers 400 "Your credit balance is too low".
export const outOfCredits = (err) => (err?.status === 429 || err?.status === 400) && /credit|quota|billing/i.test(`${err.code || ""} ${err.message || ""}`);
const badKey = (err) => err?.status === 401;

// Records a failed request to `provider` ("Anthropic" | "OpenAI"). Returns true when it failed for
// lack of credits or a wrong API key (the parent can't be helped until someone fixes the account).
export function noteAiError(err, provider = "OpenAI") {
  const kind = outOfCredits(err) ? "no_credits" : badKey(err) ? "bad_key" : null;
  if (!kind) return false;
  if (!state.has(provider)) {
    state.set(provider, { since: new Date().toISOString(), kind });
    console.error(kind === "no_credits"
      ? `\n  ${provider.toUpperCase()} HAS NO CREDITS: AI features that use it are down. Add credits at ${BILLING[provider]}\n`
      : `\n  ${provider.toUpperCase()} REJECTED THE API KEY in app/.env (${provider === "Anthropic" ? "ANTHROPIC_API_KEY, which should start with sk-ant-api" : "OPENAI_API_KEY"}).\n`);
  }
  return true;
}
export function noteAiOk(provider = "OpenAI") {
  if (state.delete(provider)) console.log(`  ${provider} is working again.`);
}
// [{ provider, since, kind, billing }] for every account with a problem; null when there's none.
export const aiProblem = () => (state.size ? [...state].map(([provider, v]) => ({ provider, ...v, billing: BILLING[provider] })) : null);
