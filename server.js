require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const activityRoutes = require('./routes/activity');
const downloadRoutes = require('./routes/download');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/activity', activityRoutes);
app.use('/api/download', downloadRoutes);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
