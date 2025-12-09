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
  const { id } = req.query;
  
  if (!id) {
    return res.status(400).json({ error: 'File ID required' });
  }
  
  try {
    const client = await connectToDatabase();
    const db = client.db('filehost');
    
    // Find file
    const file = await db.collection('files').findOne({ _id: id });
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Update download count
    await db.collection('files').updateOne(
      { _id: id },
      { $inc: { downloads: 1 } }
    );
    
    // Convert base64 to buffer
    const fileBuffer = Buffer.from(file.data, 'base64');
    
    // Set headers
    res.setHeader('Content-Type', file.type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.filename)}"`);
    res.setHeader('Content-Length', fileBuffer.length);
    
    // Send file
    res.send(fileBuffer);
    
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: error.message });
  }
}
