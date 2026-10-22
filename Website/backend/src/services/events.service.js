// TODO: Import database queries

export const fetchEvents = async ({ startDate, endDate, limit }) => {
  // TODO: Query database for events with filters
};

export const fetchActiveEvents = async () => {
  // TODO: Query database for events with no end_time
};

export const fetchEventsByOutfall = async (outfallId, limit) => {
  // TODO: Query database for events by outfall_id
};

export const createEvent = async (eventData) => {
  // TODO: Insert new event into database
};

export const closeEvent = async (eventId) => {
  // TODO: Update event end_time
};
