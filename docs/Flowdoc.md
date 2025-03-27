# Flowdoc Class Documentation

## Overview

The `Flowdoc` class is designed to manage data using Redis as a primary storage and AWS S3 as a backup storage. It provides methods to set, get, and retrieve all data, ensuring data persistence and synchronization between Redis and S3.

## Constructor

### `Flowdoc(options)`

Creates an instance of the `Flowdoc` class.

#### Parameters:

- `options` (Object): Configuration options for the Flowdoc instance.
  - `nodule` (string): The module name.
  - `item` (Array|string): The item identifier, which can be an array or a string.
  - `s3Bucket` (string, optional): The S3 bucket name. Defaults to the environment variable `APP_FLOWDOC_BUCKET`.

## Methods

### `async set(key, value)`

Sets a key-value pair in the Redis hash and schedules a save to S3.

#### Parameters:

- `key` (string): The key to set.
- `value` (any): The value to associate with the key.

#### Returns:

- `value` (any): The value that was set.

### `async get(key)`

Retrieves the value associated with a key from the Redis hash.

#### Parameters:

- `key` (string): The key to retrieve.

#### Returns:

- `value` (any): The value associated with the key.

### `async data()`

Retrieves all key-value pairs from the Redis hash.

#### Returns:

- `Object`: An object containing all key-value pairs.

### `async loadData()`

Loads data from Redis. If no data is found, it attempts to load from S3 and populate Redis.

### `async loadFromS3()`

Loads data from AWS S3 using AWS SDK v3.

#### Returns:

- `Object|null`: The data loaded from S3, or `null` if an error occurs.

### `scheduleS3Save()`

Schedules a save operation to S3. Saves every 5 seconds during activity and ensures a final save after activity stops.

### `async saveToS3()`

Saves the current Redis hash data to AWS S3 using AWS SDK v3.

## Internal Logic

- The Redis hash name is a combination of the `nodule` and `item` (joined if `item` is an array).
- The S3 path is `flowdoc/$nodule/$item`.
- When the `Flowdoc` instance is constructed, it attempts to load data from Redis. If no data is found, it loads from S3 and populates Redis.
- AWS SDK v3 is used for S3 operations, which provides modular imports and improved performance.

## Usage Example

```javascript
const Redis = require('redis');
const Flowdoc = require('./Flowdoc');

const flowdoc = new Flowdoc({
  nodule: 'exampleModule',
  item: ['exampleItem'],
  s3Bucket: 'my-s3-bucket'
});

flowdoc.set('key1', 'value1');
const value = await flowdoc.get('key1');
const allData = await flowdoc.data();
```

## Environment Variables
- `AWS_BUCKET_SECURE`: The AWS region for the S3 bucket.
- `AWS_ACCESS`: The AWS access key ID.
- `AWS_SECRET`: The AWS secret access key.
- `REDIS_CLUSTER`: The Redis connection URL (e.g., `redis://127.0.0.1:6379`).
- `APP_FLOWDOC_BUCKET`: The default S3 bucket name if not provided in options.
