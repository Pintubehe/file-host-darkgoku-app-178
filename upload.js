import { MongoClient } from 'mongodb';
import { Readable } from 'stream';
import { v4 as uuidv4 } from 'uuid';

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

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const client = await connectToDatabase();
    const db = client.db('filehost');
    
    // Get multipart data
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    
    const buffer = Buffer.concat(chunks);
    
    // Simple multipart parser
    const boundary = req.headers['content-type'].split('boundary=')[1];
    const parts = parseMultipart(buffer, boundary);
    
    if (!parts.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const file = parts.file;
    const filename = parts.filename || file.filename;
    const size = parseInt(parts.size || file.size);
    const type = parts.type || file.contentType;
    
    // Generate unique ID
    const fileId = uuidv4();
    
    // Convert file data to base64
    const base64Data = file.data.toString('base64');
    
    // Save to MongoDB
    const fileDoc = {
      _id: fileId,
      filename: filename,
      originalName: filename,
      size: size,
      type: type,
      uploaded_at: new Date().toISOString(),
      downloads: 0,
      data: base64Data,
      expires_at: null // Never expire
    };
    
    await db.collection('files').insertOne(fileDoc);
    
    // Send Telegram notification if configured
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
      try {
        const message = `📁 New file uploaded!\n\n` +
                       `📄 Name: ${filename}\n` +
                       `📦 Size: ${formatFileSize(size)}\n` +
                       `🔗 ID: ${fileId}`;
        
        await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: process.env.TELEGRAM_CHAT_ID,
            text: message
          })
        });
      } catch (telegramError) {
        console.error('Telegram notification failed:', telegramError);
      }
    }
    
    res.status(200).json({
      success: true,
      fileId: fileId,
      filename: filename,
      size: size,
      url: `/api/download/${fileId}`,
      message: 'File uploaded permanently'
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
}

// Helper functions
function parseMultipart(buffer, boundary) {
  const parts = {};
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  
  let start = buffer.indexOf(boundaryBuffer) + boundaryBuffer.length;
  
  while (start < buffer.length) {
    const end = buffer.indexOf(boundaryBuffer, start);
    if (end === -1) break;
    
    const part = buffer.slice(start, end);
    const headerEnd = part.indexOf('\r\n\r\n');
    const headers = part.slice(0, headerEnd).toString();
    const body = part.slice(headerEnd + 4);
    
    const nameMatch = headers.match(/name="([^"]+)"/);
    const filenameMatch = headers.match(/filename="([^"]+)"/);
    
    if (nameMatch) {
      const name = nameMatch[1];
      if (filenameMatch) {
        parts[name] = {
          filename: filenameMatch[1],
          data: body
        };
      } else {
        parts[name] = body.toString().trim();
      }
    }
    
    start = end + boundaryBuffer.length;
  }
  
  return parts;
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
