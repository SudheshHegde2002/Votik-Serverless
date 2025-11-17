exports.notifyGroupMembers = onDocumentCreated(
  "chats/{groupId}/messages/{messageId}",
  async (event) => {
    const { groupId } = event.params;
    const message = event.data.data();
    const senderId = message.user._id;

    console.log("New message in group:", groupId, "from:", senderId);

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
```

## Check These Issues:

### 1. **FCM Token Validity**
The token in your example looks correct format-wise, but:
- Tokens expire when the app is uninstalled/reinstalled
- Tokens can become invalid after ~2 months of inactivity
- Make sure you're refreshing tokens in your app when they change

### 2. **Firebase Cloud Messaging API**
Enable it in Google Cloud Console:
```
// https://console.cloud.google.com/apis/library/fcm.googleapis.com