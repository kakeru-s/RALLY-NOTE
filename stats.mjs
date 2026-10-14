export function summarizeMatch(points = [], players = { self: [], opponent: [] }) {
  const total = points.length;
  const won = side => points.filter(p => p.winner === side).length;
  const pct = (n, d) => d ? (n / d) * 100 : 0;

  const sideWon = { self: won('self'), opponent: won('opponent') };
  const sideLost = { self: sideWon.opponent, opponent: sideWon.self };

  const playerRows = [...(players.self || []).map(p=>({...p,side:'self'})), ...(players.opponent || []).map(p=>({...p,side:'opponent'}))].map(player => {
    const winners = points.filter(p => p.outcome?.type === 'winner' && p.outcome?.playerId === player.id).length;
    const errors = points.filter(p => p.outcome?.type === 'error' && p.outcome?.playerId === player.id).length;
    const servicePoints = points.filter(p => p.service?.server === player.id);
    const first = servicePoints.filter(p => (p.serveAttempt || 'first') === 'first');
    const second = servicePoints.filter(p => p.serveAttempt === 'second');
    const serviceWon = servicePoints.filter(p => p.winner === player.side).length;
    return {
      ...player,
      winners,
      errors,
      winnerShareOfTeamPoints: pct(winners, sideWon[player.side]),
      errorShareOfTeamLostPoints: pct(errors, sideLost[player.side]),
      servicePoints: servicePoints.length,
      servicePointWinRate: pct(serviceWon, servicePoints.length),
      firstCount: first.length,
      secondCount: second.length,
      firstInRate: pct(first.length, servicePoints.length),
      firstPointWinRate: pct(first.filter(p => p.winner === player.side).length, first.length),
      secondPointWinRate: pct(second.filter(p => p.winner === player.side).length, second.length),
    };
  });

  const serve = side => {
    const servicePoints = points.filter(p => p.service?.servingSide === side);
    const first = servicePoints.filter(p => (p.serveAttempt || 'first') === 'first');
    const second = servicePoints.filter(p => p.serveAttempt === 'second');
    return {
      total: servicePoints.length,
      firstCount: first.length,
      secondCount: second.length,
      firstInRate: pct(first.length, servicePoints.length),
      firstPointWinRate: pct(first.filter(p => p.winner === side).length, first.length),
      secondPointWinRate: pct(second.filter(p => p.winner === side).length, second.length),
      pointWinRate: pct(servicePoints.filter(p => p.winner === side).length, servicePoints.length),
    };
  };

  const breakdown = side => {
    const sidePoints = points.filter(p => p.winner === side);
    const winners = sidePoints.filter(p => p.outcome?.type === 'winner').length;
    const opponentErrors = sidePoints.filter(p => p.outcome?.type === 'error').length;
    return {
      points: sidePoints.length,
      winners,
      opponentErrors,
      winnerRate: pct(winners, sidePoints.length),
      opponentErrorRate: pct(opponentErrors, sidePoints.length),
      unclassified: sidePoints.length - winners - opponentErrors,
    };
  };

  const classified = points.filter(p => p.outcome?.playerId && p.outcome?.type).length;
  return {
    totalPoints: total,
    selfPoints: sideWon.self,
    opponentPoints: sideWon.opponent,
    selfPointRate: pct(sideWon.self, total),
    opponentPointRate: pct(sideWon.opponent, total),
    classified,
    unclassified: total - classified,
    players: playerRows,
    serve: { self: serve('self'), opponent: serve('opponent') },
    breakdown: { self: breakdown('self'), opponent: breakdown('opponent') },
  };
}
