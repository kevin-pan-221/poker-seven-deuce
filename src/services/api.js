/**
 * API service for REST endpoints
 */

// Use current hostname for LAN support
const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:3001/api'
  : `http://${window.location.hostname}:3001/api`;

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
