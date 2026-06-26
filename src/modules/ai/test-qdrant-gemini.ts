import { GoogleGenerativeAI } from '@google/generative-ai';
import { QdrantClient } from '@qdrant/js-client-rest';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../.env') });

async function testConnections() {
  console.log('--- Testing Connections ---');
  
  const googleApiKey = process.env.GOOGLE_API_KEY;
  const qdrantUrl = process.env.QDRANT_URL;
  const qdrantApiKey = process.env.QDRANT_API_KEY;

  console.log(`GOOGLE_API_KEY length: ${googleApiKey?.length ?? 0}`);
  console.log(`QDRANT_URL: ${qdrantUrl}`);
  console.log(`QDRANT_API_KEY length: ${qdrantApiKey?.length ?? 0}`);

  // 1. Test Gemini Connection
  if (!googleApiKey) {
    console.error('GOOGLE_API_KEY is not defined in .env');
  } else {
    try {
      const genAI = new GoogleGenerativeAI(googleApiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      console.log('Sending request to Gemini...');
      const response = await model.generateContent('Say Hello');
      console.log('Gemini Response success:', response.response.text());
    } catch (err: any) {
      console.error('Gemini Connection failed:', err.message);
    }
  }

  // 2. Test Qdrant Connection
  if (!qdrantUrl) {
    console.error('QDRANT_URL is not defined in .env');
  } else {
    try {
      const client = new QdrantClient({
        url: qdrantUrl,
        apiKey: qdrantApiKey,
      });
      console.log('Checking Qdrant collections...');
      const collections = await client.getCollections();
      console.log('Qdrant Connection success! Collections:', collections.collections.map(c => c.name));
    } catch (err: any) {
      console.error('Qdrant Connection failed:', err.message);
    }
  }
}

testConnections();
