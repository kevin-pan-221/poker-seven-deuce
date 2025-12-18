/**
 * API service for REST endpoints
 */

// Use environment variable for production, fallback for local dev
const getApiUrl = () => {
  // Vite exposes env vars with VITE_ prefix
  if (import.meta.env.VITE_API_URL) {
    return `${import.meta.env.VITE_API_URL}/api`;
  }
  // Production: same origin (frontend served from backend)
  if (import.meta.env.PROD) {
    return '/api';
  }
  // Local development fallback
  if (window.location.hostname === 'localhost') {
    return 'http://localhost:3001/api';
  }
  // LAN fallback
  return `http://${window.location.hostname}:3001/api`;
};

const API_URL = getApiUrl();

/**
 * Create a new game room
 */
export async function createRoom(name, hostId) {
  const response = await fetch(`${API_URL}/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, hostId })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create room');
  }
  
  return response.json();
}

/**
 * Get list of all rooms
 */
export async function listRooms() {
  const response = await fetch(`${API_URL}/rooms`);
  
  if (!response.ok) {
    throw new Error('Failed to list rooms');
  }
  
  return response.json();
}

/**
 * Get room details
 */
export async function getRoom(roomId) {
  const response = await fetch(`${API_URL}/rooms/${roomId}`);
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Room not found');
    }
    throw new Error('Failed to get room');
  }
  
  return response.json();
}
