self.addEventListener("push", (event) => {
  let data = { title: "Al Noor Law", body: "You have an update." };
  try {
    if (event.data) data = event.data.json();
  } catch {
    data.body = event.data?.text() || data.body;
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "Al Noor Law", {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "al-noor-reminder",
      renotify: true,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      if (list.length) return list[0].focus();
      return clients.openWindow("/");
    })
  );
});
