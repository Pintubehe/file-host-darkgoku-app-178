import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
let cachedClient = null;

async function connectToDatabase() {
  if (cachedClient) {
    return cachedClient;
  }
  
  const client = await MongoClient.connect(MONGODB_URI);
  cachedClient = client;
  return client;
}

export default async function handler(req, res) {
  try {
    const client = await connectToDatabase();
    const db = client.db('filehost');
    
    // Test connection
    await db.command({ ping: 1 });
    
    res.status(200).json({
      status: 'online',
      mongodb: 'connected',
      dbName: 'filehost',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      message: 'Server is running with MongoDB'
    });
    
  } catch (error) {
    res.status(200).json({
      status: 'online',
      mongodb: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString(),
      message: 'Server running but MongoDB not connected'
    });
  }
}
