const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');

let messaging;

try {
  const serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));
  const app = initializeApp({
    credential: cert(serviceAccount),
  });
  messaging = getMessaging(app);
  console.log('✅ Firebase Admin SDK initialized');
} catch (err) {
  console.error('❌ Failed to initialize Firebase Admin SDK:', err);
  console.warn('⚠️ Firebase Admin SDK not available – FCM notifications are disabled.');
  // Mock messenger so calls to messaging.send won’t crash
  messaging = {
    send: async (msg) => {
      console.warn('📦 Mock FCM send – SDK missing. Message:', msg);
      return Promise.resolve('mock-message-id');
    },
  };
}

module.exports = { messaging };