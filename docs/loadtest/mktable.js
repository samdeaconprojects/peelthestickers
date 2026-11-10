const { DynamoDBClient, CreateTableCommand, DescribeTableCommand } = require('../../server/node_modules/@aws-sdk/client-dynamodb');
const c = new DynamoDBClient({ region: 'us-east-1', endpoint: process.env.SIM_DDB || 'http://localhost:4567', credentials: { accessKeyId: 'fake', secretAccessKey: 'fake' } });
const gsi = (n) => ({ IndexName: `GSI${n}`, KeySchema: [{ AttributeName: `GSI${n}PK`, KeyType: 'HASH' }, { AttributeName: `GSI${n}SK`, KeyType: 'RANGE' }], Projection: { ProjectionType: 'ALL' }, ProvisionedThroughput: { ReadCapacityUnits: 1000, WriteCapacityUnits: 1000 } });
(async () => {
  await c.send(new CreateTableCommand({ TableName: 'PTSLoadTest',
    AttributeDefinitions: ['PK','SK','GSI1PK','GSI1SK','GSI2PK','GSI2SK','GSI3PK','GSI3SK'].map(a => ({ AttributeName: a, AttributeType: 'S' })),
    KeySchema: [{ AttributeName: 'PK', KeyType: 'HASH' }, { AttributeName: 'SK', KeyType: 'RANGE' }],
    ProvisionedThroughput: { ReadCapacityUnits: 1000, WriteCapacityUnits: 1000 },
    GlobalSecondaryIndexes: [gsi(1), gsi(2), gsi(3)] }));
  const d = await c.send(new DescribeTableCommand({ TableName: 'PTSLoadTest' }));
  console.log(d.Table.TableStatus, d.Table.GlobalSecondaryIndexes.length);
})().catch(e => { console.error(e); process.exit(1); });
