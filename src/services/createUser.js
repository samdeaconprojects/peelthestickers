import dynamoDB from "../components/SignIn/awsConfig";

export const createUser = async ({
  userID,
  name,
  username,
  color,
  profileEvent,
  profileScramble,
  chosenStats,
  headerStats,
  wcaid,
  cubeCollection,
  settings
}) => {
  const params = {
    TableName: "PTS",
    Item: {
      PK: `USER#${userID}`,
      SK: "PROFILE",
      Name: name,
      Username: username,
      Friends: [],
      Posts: [],
      Color: color,
      ProfileEvent: profileEvent,
      ProfileScramble: profileScramble,
      ChosenStats: chosenStats,
      HeaderStats: headerStats,
      WCAID: wcaid,
      DateFounded: new Date().toISOString(),
      CubeCollection: cubeCollection,
      Settings: settings
    }
  };

  try {
    await dynamoDB.put(params).promise();
    console.log("User created successfully.");
  } catch (err) {
    console.error("Error creating user:", err);
    throw err;
  }
};
