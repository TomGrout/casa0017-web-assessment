import axios from 'axios';
import config from '../config/env.js';

export const fetchTidalReadings = async (limit = 5) => {
  // TODO: Call Environment Agency API for tidal data
  // TODO: Return array of readings
};

export const fetchRainfallReadings = async (stationId, limit = 100) => {
  // TODO: Call Environment Agency API for rainfall data
  // TODO: Return array of readings
};

export const getRainfallStations = async () => {
  // TODO: Get list of available rainfall monitoring stations
};
