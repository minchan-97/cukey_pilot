import webpush from "web-push";

let ready = false;
function setup() {
  if (ready) return;
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL}`,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  ready = true;
}

export async function sendPush(sub: webpush.PushSubscription, payload: { title: string; body: string; url: string }) {
  setup();
  return webpush.sendNotification(sub, JSON.stringify(payload));
}
