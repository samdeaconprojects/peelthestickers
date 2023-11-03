const express = require('express');
const { MongoClient, ServerApiVersion } = require('mongodb'); // Import MongoClient and ServerApiVersion
const userRoutes = require('./routes/userRoutes');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());
app.use('/api/users', userRoutes);

const uri = process.env.ATLAS_URI;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1 // Use the imported ServerApiVersion
});

async function run() {
  try {
    await client.connect();
    console.log("Connected successfully to MongoDB");

    // Make sure to add this line to use the connection across your routes
    app.locals.db = client.db();

    app.listen(port, () => {
      console.log(`Server is running on port: ${port}`);
    });
  } catch (error) {
    console.error("Connection to MongoDB failed:", error.message);
    process.exit();
  }
}

run().catch(console.dir);

// You may want to handle process termination / interruption signals
// to properly close the MongoDB client connection when the Node.js server stops.
process.on('SIGINT', async () => {
  console.log('Closing MongoDB connection');
  await client.close();
  process.exit();
});

process.on('SIGTERM', async () => {
  console.log('Closing MongoDB connection');
  await client.close();
  process.exit();
});
