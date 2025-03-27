const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { createClient } = require('redis');

class Flowdoc {
  static redis = null;
  static s3Client = null;
  static initPromise = null;
  static initialized = false;

  static async init() {
    if (Flowdoc.initialized) {
      return;
    }
    if (Flowdoc.initPromise) {
      await Flowdoc.initPromise;
      return;
    }

    Flowdoc.initPromise = (async () => {
      if (!Flowdoc.redis) {
        await Flowdoc.initializeRedis();
      }
      if (!Flowdoc.s3Client) {
        Flowdoc.initializeS3Client();
      }
      Flowdoc.initialized = true;
    })();

    await Flowdoc.initPromise;
  }

  static async initializeRedis() {
    const redisUrl = process.env.REDIS_CLUSTER || 'redis://127.0.0.1:6379';
    Flowdoc.redis = createClient({ url: redisUrl });
    Flowdoc.redis.on('error', (err) => console.error('Redis Client Error', err));
    await Flowdoc.redis.connect();
  }

  static initializeS3Client() {
    const region = process.env.AWS_REGION || 'us-east-1'; // Default to 'us-east-1' if not set
    Flowdoc.s3Client = new S3Client({
      region: region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS,
        secretAccessKey: process.env.AWS_SECRET,
      },
    });
  }

  constructor(options) {
    if (!Flowdoc.initialized) {
      throw new Error('Flowdoc.init() must be called before creating instances.');
    }

    this.nodule = options.nodule;
    this.item = Array.isArray(options.item) ? options.item.join('_') : options.item;
    this.hashName = `${this.nodule}_${this.item}`;
    this.s3Path = `flowdoc/${this.nodule}/${this.item}`;
    this.s3Bucket = process.env.AWS_BUCKET_SECURE;

    this.saveInterval = null;
    this.saveTimeout = null;
  }

  async ini() {
    if (this.iniDid) return;
    this.iniDid = true;
    await this.loadData();
  }

  async loadData() {
    let data = await Flowdoc.redis.hGetAll(this.hashName);

    if (!data || Object.keys(data).length === 0) {
      data = await this.loadFromS3();
      if (data) {
        // Use a single hSet call to write the entire object to Redis
        await Flowdoc.redis.hSet(this.hashName, data);
      }
    }
  }

  async loadFromS3() {
    try {
      const params = { Bucket: this.s3Bucket, Key: this.s3Path };
      const command = new GetObjectCommand(params);
      const data = await Flowdoc.s3Client.send(command);
      const bodyContents = await streamToString(data.Body);

      return JSON.parse(bodyContents);
    } catch (err) {
      console.error('Error loading from S3:', err);
      return null;
    }
  }

  async set(key, value) {
    if (value === null || value === undefined) {
      await Flowdoc.redis.hDel(this.hashName, key);
    } else {
      await Flowdoc.redis.hSet(this.hashName, key, value);
    }

    this.scheduleS3Save();
    return value;
  }

  async get(key) {
    let value = await Flowdoc.redis.hGet(this.hashName, key);
    if (value === null) {
      await this.refreshData();
      value = await Flowdoc.redis.hGet(this.hashName, key);
    }
    return value;
  }

  async data() {
    let data = await Flowdoc.redis.hGetAll(this.hashName);
    if (!data || Object.keys(data).length === 0) {
      await this.refreshData();
      data = await Flowdoc.redis.hGetAll(this.hashName);
    }
    return data;
  }

  async refreshData() {
    const data = await this.loadFromS3();
    if (data) {
      await Flowdoc.redis.hSet(this.hashName, data);
    }
  }
  async update(updates) {
    if (typeof updates !== 'object' || updates === null) {
      throw new Error('Updates must be a non-null object');
    }

    const entries = Object.entries(updates);

    // Separate nulls from valid values
    const toDelete = entries.filter(([_, v]) => v === null || v === undefined).map(([k]) => k);
    const toSet = Object.fromEntries(entries.filter(([_, v]) => v !== null && v !== undefined));

    if (Object.keys(toSet).length > 0) {
      await Flowdoc.redis.hSet(this.hashName, toSet);
    }

    if (toDelete.length > 0) {
      await Flowdoc.redis.hDel(this.hashName, toDelete);
    }

    this.scheduleS3Save();
  }
  scheduleS3Save() {
    if (!this.saveInterval) {
      this.saveInterval = setInterval(() => this.saveToS3(), 5000);
    }
    clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
      this.saveToS3();
    }, 5000);
  }

  async saveToS3() {
    const data = await this.data();
    const params = {
      Bucket: this.s3Bucket,
      Key: this.s3Path,
      Body: JSON.stringify(data),
      ContentType: 'application/json',
    };
    const command = new PutObjectCommand(params);
    try {
      await Flowdoc.s3Client.send(command);
    } catch (err) {
      console.error('Error saving to S3:', err);
    }
  }
}

// Helper function to convert a stream to a string
async function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

async function main() {
  try {
    await Flowdoc.init(); // Ensure initialization
  } catch (error) {
    console.error('Error:', error);
  }
}

main();

module.exports = Flowdoc;
