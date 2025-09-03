import dynamoDB from "../components/SignIn/awsConfig";

export const createSession = async (
  userID,
  event,
  sessionID = "main",
  sessionName = "Main Session"
) => {
  const normalizedEvent = event.toUpperCase(); // 🔹 Always uppercase

  const params = {
    TableName: "PTS",
    Item: {
      PK: `USER#${userID}`,
      SK: `SESSION#${normalizedEvent}#${sessionID}`,
      Event: normalizedEvent,
      SessionID: sessionID,
      SessionName: sessionName,
      CreatedAt: new Date().toISOString()
    }
  };

  try {
    await dynamoDB.put(params).promise();
    console.log(`✅ Created session for ${normalizedEvent}`);
  } catch (err) {
    console.error("❌ Error creating session:", err);
    throw err;
  }
};
