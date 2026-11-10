// server/lib/mailer.js
//
// Account emails (verify address, reset password). Sends through Amazon SES
// when PTS_EMAIL_FROM is set; otherwise prints the email to the server log, so
// local dev and the sandbox work without SES (the links are in the log).

const FROM = String(process.env.PTS_EMAIL_FROM || "").trim();
const APP_URL = String(process.env.PTS_APP_URL || "http://localhost:3100").replace(/\/+$/, "");
const REGION = process.env.PTS_EMAIL_REGION || process.env.AWS_REGION || "us-east-1";

if (!FROM && process.env.NODE_ENV === "production") {
  throw new Error("PTS_EMAIL_FROM must be set in production (e.g. noreply@peelthestickers.com)");
}

let sesClient = null;
function getSes() {
  if (!sesClient) {
    const { SESv2Client } = require("@aws-sdk/client-sesv2");
    sesClient = new SESv2Client({ region: REGION });
  }
  return sesClient;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function validateEmail(value) {
  const email = normalizeEmail(value);
  if (!email) return "Email is required";
  if (email.length > 254 || !EMAIL_RE.test(email)) return "Enter a valid email address";
  return null;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function layout({ heading, intro, buttonLabel, url, outro }) {
  const text = `${heading}\n\n${intro}\n\n${url}\n\n${outro}\n\n- Peel The Stickers`;
  const html = `<!doctype html><html><body style="margin:0;background:#0e171d;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#e8eef1">
<div style="max-width:520px;margin:0 auto;padding:32px 24px">
<p style="font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#8aa0aa;margin:0 0 20px">Peel The Stickers</p>
<h1 style="font-size:22px;margin:0 0 12px;color:#fff">${escapeHtml(heading)}</h1>
<p style="font-size:15px;line-height:1.5;margin:0 0 24px">${escapeHtml(intro)}</p>
<p style="margin:0 0 24px"><a href="${escapeHtml(url)}" style="display:inline-block;background:#2EC4B6;color:#0e171d;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px">${escapeHtml(buttonLabel)}</a></p>
<p style="font-size:13px;line-height:1.5;color:#8aa0aa;margin:0 0 8px">Or paste this link into your browser:<br><span style="word-break:break-all">${escapeHtml(url)}</span></p>
<p style="font-size:13px;line-height:1.5;color:#8aa0aa;margin:16px 0 0">${escapeHtml(outro)}</p>
</div></body></html>`;
  return { text, html };
}

async function sendEmail({ to, subject, text, html }) {
  if (!FROM) {
    console.log(`[mailer] (log mode, not sent) to=${to} subject="${subject}"\n${text}`);
    return { logged: true };
  }
  const { SendEmailCommand } = require("@aws-sdk/client-sesv2");
  await getSes().send(
    new SendEmailCommand({
      FromEmailAddress: `Peel The Stickers <${FROM}>`,
      Destination: { ToAddresses: [to] },
      Content: {
        Simple: {
          Subject: { Data: subject, Charset: "UTF-8" },
          Body: { Text: { Data: text, Charset: "UTF-8" }, Html: { Data: html, Charset: "UTF-8" } },
        },
      },
    })
  );
  return { sent: true };
}

function sendVerificationEmail({ to, username, token }) {
  const url = `${APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
  const body = layout({
    heading: "Confirm your email",
    intro: `Hi ${username}, confirm this is your email so you can reset your password if you ever forget it.`,
    buttonLabel: "Confirm email",
    url,
    outro: "The link works for 24 hours. If you didn't create a Peel The Stickers account, you can ignore this email.",
  });
  return sendEmail({ to, subject: "Confirm your email for Peel The Stickers", ...body });
}

function sendPasswordResetEmail({ to, username, token }) {
  const url = `${APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const body = layout({
    heading: "Reset your password",
    intro: `Hi ${username}, someone (hopefully you) asked to reset the password for your Peel The Stickers account.`,
    buttonLabel: "Choose a new password",
    url,
    outro: "The link works once, for 1 hour. If you didn't ask for this, ignore this email and your password stays the same.",
  });
  return sendEmail({ to, subject: "Reset your Peel The Stickers password", ...body });
}

module.exports = {
  normalizeEmail,
  validateEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  isSendingEnabled: () => !!FROM,
};
