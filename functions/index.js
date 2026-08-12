const functions = require('firebase-functions');
const admin = require('firebase-admin');

try {
  admin.initializeApp();
} catch (e) {
  // ignore if already initialized in emulator/runtime
}

const db = admin.firestore();

// 1) New message -> notify receiver
exports.onNewMessage = functions.firestore
  .document('chats/{chatId}/messages/{messageId}')
  .onCreate(async (snapshot, context) => {
    const message = snapshot.data();
    const { chatId } = context.params;
    try {
      const chatDoc = await db.collection('chats').doc(chatId).get();
      if (!chatDoc.exists) return null;
      const chatData = chatDoc.data() || {};
      const participants = Array.isArray(chatData.participants) ? chatData.participants : [];
      const receiverId = participants.find((id) => id !== message.senderId);
      if (!receiverId) return null;

      const receiverDoc = await db.collection('users').doc(String(receiverId)).get();
      const receiverData = receiverDoc.exists ? receiverDoc.data() : null;
      if (!receiverData || !receiverData.fcmToken) return null;

      const senderDoc = await db.collection('users').doc(String(message.senderId)).get();
      const senderName = senderDoc.exists ? (senderDoc.data().name || 'Someone') : 'Someone';

      const msg = {
        notification: {
          title: senderName,
          body: message.text || 'Sent you a message',
        },
        data: {
          type: 'new_message',
          chatId: chatId,
          senderId: String(message.senderId),
          userName: String(senderName),
          screen: 'chat',
        },
        token: receiverData.fcmToken,
        android: { priority: 'high', notification: { channelId: 'messages' } },
        apns: { payload: { aps: { sound: 'default', badge: 1 } } },
      };

      await admin.messaging().send(msg);
      return null;
    } catch (err) {
      console.error('onNewMessage error', err);
      return null;
    }
  });

// 2) New match -> notify both users
exports.onNewMatch = functions.firestore
  .document('matches/{matchId}')
  .onCreate(async (snapshot, context) => {
    const match = snapshot.data() || {};
    const matchId = context.params.matchId;
    try {
      const matchedUsers = Array.isArray(match.matchedUsers) ? match.matchedUsers : [];
      const promises = matchedUsers.map(async (userId) => {
        const userDoc = await db.collection('users').doc(String(userId)).get();
        const userData = userDoc.exists ? userDoc.data() : null;
        if (!userData || !userData.fcmToken) return null;

        const otherUserId = matchedUsers.find((id) => id !== userId) || '';
        const otherUserDoc = await db.collection('users').doc(String(otherUserId)).get();
        const otherUserName = otherUserDoc.exists ? (otherUserDoc.data().name || 'Someone') : 'Someone';

        const payload = {
          notification: { title: '🎉 New Match!', body: `You matched with ${otherUserName}` },
          data: {
            type: 'new_match',
            matchId: String(matchId),
            matchedUserId: String(otherUserId),
            matchedUserName: String(otherUserName),
            screen: 'user-profile',
          },
          token: userData.fcmToken,
          android: { priority: 'high', notification: { channelId: 'matches' } },
          apns: { payload: { aps: { sound: 'default', badge: 1 } } },
        };

        return admin.messaging().send(payload);
      });

      await Promise.all(promises);
      return null;
    } catch (err) {
      console.error('onNewMatch error', err);
      return null;
    }
  });

// 3) New like -> notify liked user
exports.onNewLike = functions.firestore
  .document('likes/{likeId}')
  .onCreate(async (snapshot, context) => {
    const like = snapshot.data() || {};
    try {
      const likedUserId = like.likedUserId;
      if (!likedUserId) return null;

      const likedUserDoc = await db.collection('users').doc(String(likedUserId)).get();
      if (!likedUserDoc.exists) return null;
      const likedUserData = likedUserDoc.data() || {};
      if (!likedUserData.fcmToken) return null;

      const likerDoc = await db.collection('users').doc(String(like.likerId)).get();
      const likerName = likerDoc.exists ? (likerDoc.data().name || 'Someone') : 'Someone';

      const payload = {
        notification: { title: '❤️ Someone Liked You!', body: `${likerName} liked your profile` },
        data: { type: 'new_like', likerId: String(like.likerId), likerName: String(likerName), screen: 'likes' },
        token: likedUserData.fcmToken,
        android: { priority: 'high', notification: { channelId: 'likes' } },
        apns: { payload: { aps: { sound: 'default', badge: 1 } } },
      };

      await admin.messaging().send(payload);
      return null;
    } catch (err) {
      console.error('onNewLike error', err);
      return null;
    }
  });
