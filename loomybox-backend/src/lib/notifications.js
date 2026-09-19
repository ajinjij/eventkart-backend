const prisma = require("./prisma");

/**
 * Creates an in-app notification for a user. Fire-and-forget from any route —
 * failures are logged but never thrown, so a notification bug can never break
 * the actual action (booking, quote, etc.) that triggered it.
 *
 * To add real email/SMS later: this is the single choke point to hook a
 * provider (SendGrid, Twilio) into — call it here alongside the DB write,
 * using user.email / user.phone already available via the `userId` lookup.
 */
async function notify(userId, type, message, link = null) {
  try {
    await prisma.notification.create({ data: { userId, type, message, link } });
  } catch (err) {
    console.error("Failed to create notification:", err.message);
  }
}

module.exports = { notify };
