export const initializeSocketHandlers = (io) => {
  // TODO: Handle 'connection' event
  // TODO: Send welcome message to client
  // TODO: Handle 'subscribe_outfall' event
  // TODO: Handle 'unsubscribe_outfall' event
  // TODO: Handle 'disconnect' event
};

export const emitDischargeUpdate = (io, data) => {
  // TODO: Emit 'discharge_update' to all clients
  // TODO: Emit 'outfall_update' to specific outfall room
};

export const emitTideUpdate = (io, data) => {
  // TODO: Emit 'tide_update' to all clients
};

export const emitRainfallUpdate = (io, data) => {
  // TODO: Emit 'rainfall_update' to all clients
};

export const emitStatusUpdate = (io, data) => {
  // TODO: Emit 'status_update' to all clients
};
