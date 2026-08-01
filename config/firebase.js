let admin;
let messaging;

try {
  // Attempt to load the real Firebase Admin SDK
  admin = require('firebase-admin');
  const path = require('path');
  const serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  messaging = admin.messaging();
} catch (err) {
  console.warn('⚠️ Firebase Admin SDK not available – FCM notifications are disabled.');
  // Mock messenger so calls to messaging.send won’t crash
  messaging = {
    send: async (msg) => {
      console.log('📦 Mock FCM send called with:', msg);
      return Promise.resolve('mock-message-id');
    },
  };
}

module.exports = { messaging };
