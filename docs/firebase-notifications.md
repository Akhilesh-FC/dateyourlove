**Firebase Cloud Functions notifications — usage & click handling**

Files added:
- `functions/index.js` — three triggers: new message, new match, new like. Each message includes `data.type` that the frontend can use to route.

How frontend should handle clicks (Flutter example)

1) In `main()` register message handlers:

```dart
// When app is opened from a terminated state by a notification
FirebaseMessaging.instance.getInitialMessage().then((RemoteMessage? message) {
  if (message != null) handleNotificationClick(message.data);
});

// When app is in background and user taps notification
FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
  handleNotificationClick(message.data);
});

void handleNotificationClick(Map<String, dynamic> data) {
  final type = data['type'];
  switch (type) {
    case 'new_message':
      final chatId = data['chatId'];
      Navigator.pushNamed(context, '/chat', arguments: {'chatId': chatId});
      break;
    case 'new_match':
      final userId = data['matchedUserId'];
      Navigator.pushNamed(context, '/profile', arguments: {'userId': userId});
      break;
    case 'new_like':
      Navigator.pushNamed(context, '/likes');
      break;
  }
}
```

2) Web / Service worker (if using web push)

In `firebase-messaging-sw.js`:
```javascript
self.addEventListener('notificationclick', function(event) {
  const data = event.notification?.data || {};
  event.notification.close();
  const type = data.type;
  let url = '/';
  if (type === 'new_message' && data.chatId) url = `/chat/${data.chatId}`;
  if (type === 'new_match' && data.matchedUserId) url = `/profile/${data.matchedUserId}`;
  if (type === 'new_like') url = '/likes';
  event.waitUntil(clients.openWindow(url));
});
```

Notes
- Always rely on `data.type` for routing — notification `title`/`body` are for UI only.
- Ensure FCM tokens are stored in Firestore at `users/{uid}.fcmToken`.
- Deploy functions with `firebase deploy --only functions`.
