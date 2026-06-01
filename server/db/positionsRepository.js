const positions = [];

export function addPosition(position) {
  const p = { ...position, id: `${position.symbol}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, status: 'open', openedAt: new Date().toISOString(), closedAt: null, result: null };
  positions.push(p);
  return p;
}

export function closePosition(id, result) {
  const p = positions.find(x => x.id === id);
  if (!p) return null;
  p.status = 'closed';
  p.closedAt = new Date().toISOString();
  p.result = result;
  return p;
}

export function getOpenPositions() { return positions.filter(p => p.status === 'open'); }
export function getAllPositions() { return positions.slice(); }
export function getPositionById(id) { return positions.find(p => p.id === id); }