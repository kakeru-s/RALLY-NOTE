export const otherSide = side => side === 'self' ? 'opponent' : 'self';

export function partnerId(pairIds, id) {
  if (!Array.isArray(pairIds) || pairIds.length !== 2) return '';
  return pairIds[0] === id ? pairIds[1] : pairIds[0];
}

export function servingSideForGame(startServiceSide, gameNumber) {
  return (Number(gameNumber) - 1) % 2 === 0 ? startServiceSide : otherSide(startServiceSide);
}

export function normalPointRoles({ pointIndex, servingPairIds, receivingPairIds, firstServerId, rightReceiverId }) {
  const p = Math.max(0, Number(pointIndex) || 0);
  const serverTurn = Math.floor(p / 2) % 2;
  const server = serverTurn === 0 ? firstServerId : partnerId(servingPairIds, firstServerId);
  const receiver = p % 2 === 0 ? rightReceiverId : partnerId(receivingPairIds, rightReceiverId);
  return {
    server,
    receiver,
    serviceFrom: p % 2 === 0 ? 'right' : 'left',
    pointNumber: p + 1,
  };
}

export function finalPointRoles({ pointIndex, startServiceSide, pairIdsBySide, firstServerBySide, rightReceiverBySide }) {
  const p = Math.max(0, Number(pointIndex) || 0);
  const serviceBlock = Math.floor(p / 2);
  const servingSide = serviceBlock % 2 === 0 ? startServiceSide : otherSide(startServiceSide);
  const receivingSide = otherSide(servingSide);
  const pairServeTurn = Math.floor(serviceBlock / 2) % 2;
  const firstServer = firstServerBySide[servingSide];
  const server = pairServeTurn === 0 ? firstServer : partnerId(pairIdsBySide[servingSide], firstServer);
  const rightReceiver = rightReceiverBySide[receivingSide];
  const receiver = p % 2 === 0 ? rightReceiver : partnerId(pairIdsBySide[receivingSide], rightReceiver);
  return {
    servingSide,
    receivingSide,
    server,
    receiver,
    serviceFrom: p % 2 === 0 ? 'right' : 'left',
    pointNumber: p + 1,
    changeSidesBeforePoint: p === 2 || (p > 2 && (p - 2) % 4 === 0),
  };
}
