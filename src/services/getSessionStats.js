// getSessionStats.js
import dynamoDB from "../components/SignIn/awsConfig";

export const getSessionStats = async (userID, event, sessionID) => {
  const normalizedEvent = event.toUpperCase();

  const params = {
    TableName: "PTS",
    Key: {
      PK: `USER#${userID}`,
      SK: `SESSIONSTATS#${normalizedEvent}#${sessionID}`,
    },
  };

  const { Item } = await dynamoDB.get(params).promise();
  return Item || null;
};
