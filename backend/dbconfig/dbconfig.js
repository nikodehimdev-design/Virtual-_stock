require('dotenv').config();
const mongoose = require('mongoose');

// Connect to MongoDB

mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to MongoDB successfully'))
    .catch((err) => console.error('MongoDB connection error:', err));

// Get the default connection
const db = mongoose.connection;

// Bind connection to error event
db.on('error', (err) => console.error('MongoDB connection error:', err));