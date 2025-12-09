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
    
    const { search = '', filter = 'all', page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build query
    let query = {};
    
    if (search) {
      query.filename = { $regex: search, $options: 'i' };
    }
    
    // Apply filters
    if (filter === 'code') {
      query.filename = { 
        $regex: '\.(py|js|html|css|json|md)$',
        $options: 'i'
      };
    } else if (filter === 'archive') {
      query.filename = { $regex: '\.(zip|rar|tar|gz)$', $options: 'i' };
    } else if (filter === 'text') {
      query.filename = { 
        $regex: '\.(txt|md|log|ini|cfg)$',
        $options: 'i' 
      };
    }
    
    // Get files
    const files = await db.collection('files')
      .find(query, { projection: { data: 0 } }) // Don't return file data
      .sort({ uploaded_at: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();
    
    // Get stats
    const totalFiles = await db.collection('files').countDocuments(query);
    const totalSizeResult = await db.collection('files').aggregate([
      { $group: { _id: null, total: { $sum: "$size" } } }
    ]).toArray();
    
    const totalDownloadsResult = await db.collection('files').aggregate([
      { $group: { _id: null, total: { $sum: "$downloads" } } }
    ]).toArray();
    
    res.status(200).json({
      success: true,
      files: files,
      stats: {
        totalFiles: totalFiles,
        totalSize: totalSizeResult[0]?.total || 0,
        totalDownloads: totalDownloadsResult[0]?.total || 0
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalFiles,
        pages: Math.ceil(totalFiles / parseInt(limit))
      }
    });
    
  } catch (error) {
    console.error('Files error:', error);
    res.status(500).json({ error: error.message });
  }
}
