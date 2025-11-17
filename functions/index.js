const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore,FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();
const db = getFirestore();
const messaging = getMessaging();

//count the messages
exports.incrementMessageCount = onDocumentCreated(
  "groups/{groupId}/messages/{messageId}",
  async (event) => {
    const { groupId } = event.params;

    try {
      console.log("Incrementing message count for group:", groupId);

      // Reference to chat group doc
      const groupRef = db.collection("groups").doc(groupId);

      // Increment messageCount by 1
      await groupRef.set(
        {
          messageCount: FieldValue.increment(1),
        },
        { merge: true }
      );

      console.log("messageCount incremented for:", groupId);
    } catch (err) {
      console.error("Error incrementing messageCount:", err);
    }

    return null;
  }
);

//send the notifications
exports.notifyGroupMembers = onDocumentCreated(
  "groups/{groupId}/messages/{messageId}",
  async (event) => {
    const { groupId } = event.params;
    const message = event.data.data();
    const senderId = message.user._id;

    console.log("New message in group:", groupId, "from:", senderId);
    try{
      const groupDoc = await db.collection("groups").doc(groupId).get();
      const data = groupDoc.data();
      const count = data?.messageCount || 0;

      console.log("Current messageCount:", count);

      if (count % 20 !== 0) {
        console.log("Not sending notification. Waiting for next 20 messages.");
        return null;
      }
      // 1. Fetch group members
      const membersSnapshot = await db
        .collection("groups")
        .doc(groupId)
        .collection("members")
        .get();

      const userIds = [];
      membersSnapshot.forEach((doc) => {
        if (doc.id !== senderId) userIds.push(doc.id);
      });

      console.log("Found members:", userIds);
      if (!userIds.length) {
        console.log("No other members to notify");
        return;
      }

      // 2. Fetch tokens
      const tokens = [];
      for (const uid of userIds) {
        const userDoc = await db.collection("votik-users").doc(uid).get();
        const data = userDoc.data();
        console.log(`User ${uid} token:`, data?.fcmToken ? "EXISTS" : "MISSING");
        if (data?.fcmToken) tokens.push(data.fcmToken);
      }

      console.log("Valid tokens found:", tokens.length);
      if (!tokens.length) {
        console.log("No FCM tokens available");
        return;
      }

      // 3. Send notification
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

      console.log("Notification response:", {
        successCount: response.successCount,
        failureCount: response.failureCount,
      });

      // Log individual failures
      if (response.failureCount > 0) {
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            console.error(`Token ${idx} failed:`, resp.error);
          }
        });
      }
    } catch (err) {
      console.error("Notification error:", err);
    }
  }
);
