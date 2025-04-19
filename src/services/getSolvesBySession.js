import dynamoDB from "../components/SignIn/awsConfig";

export const getSolvesBySession = async (userID, event, sessionID) => {
    const params = {
      TableName: "PTS",
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :gsi1pk",
      ExpressionAttributeValues: {
        ":gsi1pk": `SESSION#${userID}#${event}#${sessionID}`
      }
    };
  
    try {
      const result = await dynamoDB.query(params).promise();
      return result.Items;
    } catch (err) {
      console.error("Error fetching solves:", err);
      throw err;
    }
  };
  