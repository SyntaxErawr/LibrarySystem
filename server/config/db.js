const mongoose = require('mongoose');

async function connectDB(uri = process.env.MONGO_URI) {
  if (!uri || !/^mongodb(\+srv)?:\/\//.test(uri) || /<|>/.test(uri)) {
    throw new Error('Set MONGO_URI in server/.env to your MongoDB Atlas connection string.');
  }
  await mongoose.connect(uri, {
    dbName: 'librarysystem',
    serverSelectionTimeoutMS: 10000,
  });
  console.log('MongoDB connected: librarysystem');
  return mongoose.connection;
}

module.exports = connectDB;
