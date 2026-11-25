import { MongoClient, MongoClientOptions } from 'mongodb';

export function documentdbClient(url: string, tls: boolean): MongoClient {
  if (!url) throw new Error('DocumentDB connection URL is required');
  const options = new URLSearchParams(url.split('?')[1] || '');
  for (const [key, value] of options) {
    if (
      [
        'tlsinsecure',
        'tlsallowinvalidcertificates',
        'tlsallowinvalidhostnames',
      ].includes(key.toLowerCase()) &&
      value.toLowerCase() !== 'false'
    ) {
      throw new Error(
        'DocumentDB connection URL cannot disable TLS verification',
      );
    }
  }
  const clientOptions: MongoClientOptions = {
    tls,
    retryWrites: false,
    serverSelectionTimeoutMS: 5000,
    writeConcern: { w: 1 },
    readPreference: 'primary',
  };
  try {
    return new MongoClient(url, clientOptions);
  } catch {
    throw new Error(
      'DocumentDB connection URL must be a valid MongoDB connection string',
    );
  }
}
