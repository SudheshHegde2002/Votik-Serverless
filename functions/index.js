const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();
const db = getFirestore();
const messaging = getMessaging();

exports.notifyGroupMembers = onDocumentCreated(
  "chats/{groupId}/messages/{messageId}",
  async (event) => {
    const { groupId } = event.params;
    const message = event.data.data();
    const senderId = message.user._id;

    try {
      // 1. Get group members
      const membersSnapshot = await db
        .collection("chats")
        .doc(groupId)
        .collection("members")
        .get();

      let userIds = [];
      membersSnapshot.forEach((doc) => {
        if (doc.id !== senderId) {
          userIds.push(doc.id);
        }
      });

      if (userIds.length === 0) return;

      // 2. Fetch tokens
      let tokens = [];
      for (let uid of userIds) {
        const userDoc = await db.collection("users").doc(uid).get();
        const userData = userDoc.data();
        if (userData?.fcmToken) {
          tokens.push(userData.fcmToken);
        }
      }

      if (tokens.length === 0) return;

      // 3. Notification payload
      const payload = {
        notification: {
          title: "New Group Message",
          body: message.text || "You have a new message",
        },
        data: {
          groupId,
        },
      };

      // 4. Send notification
      await messaging.sendToDevice(tokens, payload);
      console.log("Notifications sent to:", tokens.length);
    } catch (err) {
      console.error("Notification error:", err);
    }
  }
);
