let subscriptions = [];

export function registerPushRoutes(app) {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@valido1m.local";

  let webpush = null;
  try {
    webpush = require("web-push");
    if (publicKey && privateKey) webpush.setVapidDetails(subject, publicKey, privateKey);
  } catch { webpush = null; }

  app.get("/api/push/public-key", (_req, res) => res.json({ publicKey }));

  app.post("/api/push/subscribe", (req, res) => {
    subscriptions.push(req.body);
    res.json({ ok: true, count: subscriptions.length });
  });

  app.post("/api/push/test", async (_req, res) => {
    await sendPushToAll({
      title: "VALIDO 1M test push",
      body: "Push real enviado desde backend worker.",
      tag: "valido-backend-test",
      url: "/"
    });
    res.json({ ok: true });
  });
}

export async function sendPushToAll(payload) {
  if (!subscriptions.length) return [];
  const webpush = (await import("web-push")).default;
  return Promise.allSettled(
    subscriptions.map(sub =>
      webpush.sendNotification(sub, JSON.stringify(payload))
    )
  );
}