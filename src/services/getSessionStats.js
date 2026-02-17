import dynamoDB from "../components/SignIn/awsConfig";

export const getSessionStats = async (userID, event, sessionID) => {
  const normalizedEvent = String(event || "").toUpperCase();
  const sid = sessionID || "main";

  const params = {
    TableName: "PTS",
    Key: {
      PK: `USER#${userID}`,
      SK: `SESSIONSTATS#${normalizedEvent}#${sid}`,
    },
  };

  try {
    const { Item } = await dynamoDB.get(params).promise();
    return Item || null;
  } catch (err) {
    console.error("Error fetching session stats:", err);
    throw err;
  }
};
