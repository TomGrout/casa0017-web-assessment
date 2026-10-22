import fs from 'fs/promises';
import { parse } from 'csv-parse/sync';

export const parseEdmReturns = async (filePath) => {
  // TODO: Read CSV file
  // TODO: Parse CSV records
  // TODO: Transform to database format
  // TODO: Filter for Lea and Bow Creek outfalls
};

export const validateOutfallData = (outfall) => {
  // TODO: Validate name, coordinates, receiving water course
  // TODO: Return { isValid, errors }
};
