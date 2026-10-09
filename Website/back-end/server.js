#!/usr/bin/env node

//  SERVER TITLE
//  Author:  Tom Grout, Rabee Ali
//  Description:  API ingestion server for rainfall & sewage backflow site
//  Version: 0.0.1
//
//  Notes:   Any notes we need to know about the server     

//  Install Instructions
//      npm install moment mysql express ejs ....  
//         OR Groups will get more credit if they use
//      npm install and npm start shortcuts and include a package.json file
//          - See https://docs.npmjs.com/creating-a-package-json-file


const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// EA reading in silvertown, prob near thames barrier pk (e16)
const SILVERTOWN_GAUGE_URL = 'https://environment.data.gov.uk/flood-monitoring/id/measures/0001-level-tidal_level-i-15_min-mAOD/readings?_sorted&_limit=5';

// thames open water data
const THAMES_STATUS_URL = 'https://api.thameswater.co.uk/opendata/v2/discharge/status';


// !    ENDPOINTS

// silvertown flow updates
app.get('api/tidal-status-e16', async (req, res) => {
    try {
        const response = await axios.get(SILVERTOWN_GAUGE_URL);
        const readings = response.data.times;

        if (!readings || readings.length < 2){
            return res.status(502).json({ error: 'Insufficient readings'});
        }
    

        // push new and prev readings back
        const currReading = readings[0];
        const prevReading = readings[1];

        // values come as mOAD (meters above sea level)
        const currLevel = currReading.value;
        const prevLevel = prevReading.value;
        const change = currLevel - prevLevel;

        // pos/neg delta change -> sewage flushed/trapped
        const flowDirection = change > 0 ? 'FLOOD_TIDE_INCOMING': 'EBB_TIDE_OUTGOING';
        const entrapmentRisk = change > 0 ? 'HIGH' : 'LOW';

        res.json({
            station: 'Silvertown',
            stationId: '001',
            timestamp: currReading.dateTime,
            currentLevelMOAD: currLevel,
            previousLevelMOAD: prevLevel,
            change15Min: Number(change.toFixed(3)),
            flowDirection,
            entrapmentRisk
        });
    }
    catch (error) {
        console.error('Error fetching tidal data (silvertown): ', error.message);
        res.status(500).json({ error: 'Failed to fetch tidal data (silvertown) '});
    }
});

// lea outfalls from thames
app.get('api/live-discharges', async (res, req) => {
    try {
        const response = await axios.get(THAMES_STATUS_URL, { timeout: 8000 });
        const allOutfalls = response.data.items || response.data;

        // filter for lea+bow creek
        const leaOutfalls = (Array.isArray(allOutfalls) ? allOutfalls : []).filter(item => {
            const river = (item.ReceivingWaterCourse || '').toLowerCase();
            return river.includes('lee') || river.includes('lea') || river.includes('bow');
        });

        res.json({
            count: leaOutfalls.length,
            outfalls: leaOutfalls
        });
    }
    catch (error) {
        console.error('Error fetching Thames Water status: ', error.message);
        res.status(500).json({
            error: 'Failed to reach Thames Water API. Downstream outage or timeout ',
            fallbackNotice: 'Ensure offline csv are loaded into mySQL for robustness'
        });
    }
});

app.listen(PORT, () => {
    console.log('Server listening on port ', PORT);
    console.log('\n Server running at ', process.env.SERVER_URL || 'localhost:', PORT);
});