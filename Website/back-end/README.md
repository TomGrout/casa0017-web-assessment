# CASA0017 Server

API ingestion server for rainfall & sewage backflow monitoring.

## Project Structure

```
server/
├── src/
│   ├── app.js                      # Express app configuration
│   ├── server.js                   # HTTP server + Socket.io
│   ├── config/                     # Configuration files
│   ├── routes/                     # API route definitions
│   ├── controllers/                # Request handlers
│   ├── services/                   # Business logic
│   ├── db/                         # Database layer
│   ├── jobs/                       # Background jobs (polling)
│   ├── sockets/                    # Socket.io handlers
│   ├── middleware/                 # Express middleware
│   └── utils/                      # Utility functions
├── scripts/                        # One-off scripts
├── migrations/                     # Database migrations
└── package.json
```

## Installation

```bash
cd server
npm install
```

## Configuration

1. Copy `.env.example` to `.env`
2. Update environment variables with your configuration

## Database Setup

1. Create MySQL database
2. Run migration:
   ```bash
   mysql -u your_user -p casa0017_sewage < migrations/001_init.sql
   ```

## Running the Server

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

## API Endpoints

### Outfalls
- `GET /api/outfalls` - Get all outfalls
- `GET /api/outfalls/:id` - Get specific outfall
- `GET /api/outfalls/nearby?lat=x&lng=y&radius=z` - Get nearby outfalls

### Events
- `GET /api/events` - Get all events
- `GET /api/events/active` - Get active discharge events
- `GET /api/events/outfall/:outfallId` - Get events for specific outfall

### Tide
- `GET /api/tide/current` - Get current tide state
- `GET /api/tide/history?hours=24` - Get historical tide data
- `GET /api/tide/forecast?hours=12` - Get tide forecast

### Thresholds
- `GET /api/thresholds` - Get rainfall threshold analysis
- `GET /api/thresholds/scatter` - Get scatter plot data

### Status
- `GET /api/status` - Get live system status
- `GET /api/status/health` - Get system health

## Socket.io Events

### Client → Server
- `subscribe_outfall` - Subscribe to specific outfall updates
- `unsubscribe_outfall` - Unsubscribe from outfall updates

### Server → Client
- `discharge_update` - Discharge event updates
- `tide_update` - Tide state updates
- `rainfall_update` - Rainfall data updates
- `status_update` - General status updates

## Seeding Data

Load Thames Water EDM returns data:
```bash
npm run seed path/to/edm-returns.csv
```

## Technologies

- **Express** - Web framework
- **MySQL2** - Database driver
- **Socket.io** - Real-time communication
- **node-cron** - Job scheduling
- **Helmet** - Security middleware
- **Morgan** - Request logging
