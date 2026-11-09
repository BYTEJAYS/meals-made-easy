import { config } from './config.js';

export function requireOwner(req, res, next) {
  const provided = req.get('x-owner-api-key');
  if (!config.ownerApiKey || provided !== config.ownerApiKey) {
    return res.status(401).json({ error: 'Owner authentication required' });
  }
  next();
}

export function requireUser(req, res, next) {
  const userId = req.get('x-user-id')?.trim();
  if (!userId || userId.length > 100) {
    return res.status(400).json({ error: 'Provide a valid x-user-id header' });
  }
  req.userId = userId;
  next();
}

export function notFound(req, res) {
  res.status(404).json({ error: 'Route not found' });
}

export function handleError(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.name === 'ValidationError' || error.name === 'CastError') {
    return res.status(400).json({ error: error.message });
  }
  if (error.code === 11000) {
    return res.status(409).json({ error: 'A record with that value already exists' });
  }
  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
}
