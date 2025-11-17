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
      // 1. Fetch group members
      const membersSnapshot = await db
        .collection("chats")
        .doc(groupId)
        .collection("members")
        .get();

      const userIds = [];
      membersSnapshot.forEach((doc) => {
        if (doc.id !== senderId) userIds.push(doc.id);
      });

      if (!userIds.length) return;

      // 2. Fetch tokens
      const tokens = [];
      for (const uid of userIds) {
        const userDoc = await db.collection("votik-users").doc(uid).get();
        const data = userDoc.data();
        if (data?.fcmToken) tokens.push(data.fcmToken);
      }

      if (!tokens.length) return;

      // 3. Send notification (correct API for Node 22)
      const response = await messaging.sendEachForMulticast({
        tokens,
        notification: {
          title: "New Group Message",
          body: message.text || "You have a new message",
        },
        data: {
          groupId,
        },
      });

      console.log("Notifications sent:", response.successCount);
    } catch (err) {
      console.error("Notification error:", err);
    }
  }
);
