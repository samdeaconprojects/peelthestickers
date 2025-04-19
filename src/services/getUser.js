import dynamoDB from "../components/SignIn/awsConfig";

export const getUser = async (userID) => {
  const params = {
    TableName: "PTS",
    Key: {
      PK: `USER#${userID}`,
      SK: "PROFILE"
    }
  };

  try {
    const result = await dynamoDB.get(params).promise();
    return result.Item;
  } catch (err) {
    console.error("Error fetching user:", err);
    throw err;
  }
};
