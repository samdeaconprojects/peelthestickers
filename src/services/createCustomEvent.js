import dynamoDB from "../components/SignIn/awsConfig";

export const createCustomEvent = async (userID, eventName) => {
  const eventID = eventName.toUpperCase().replace(/\s+/g, "_");

  const params = {
    TableName: "PTS",
    Item: {
      PK: `USER#${userID}`,
      SK: `CUSTOMEVENT#${eventID}`,
      EventID: eventID,
      EventName: eventName,
      CreatedAt: new Date().toISOString()
    }
  };

  try {
    await dynamoDB.put(params).promise();
    console.log(` Created custom event "${eventName}"`);
  } catch (err) {
    console.error(" Error creating custom event:", err);
    throw err;
  }
};
