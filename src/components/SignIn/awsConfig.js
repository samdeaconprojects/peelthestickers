import AWS from 'aws-sdk';

AWS.config.update({
  region: 'us-east-2',
  accessKeyId: process.env.REACT_APP_AWS_ACCESS_KEY_ID, // Store in environment variables
  secretAccessKey: process.env.REACT_APP_AWS_SECRET_ACCESS_KEY // Store in environment variables
});

const dynamoDB = new AWS.DynamoDB.DocumentClient();

export default dynamoDB;
