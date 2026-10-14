export const FORMATS = [5, 7, 9];

export class SoftTennisMatchEngine {
  constructor(format = 7, winners = []) {
    if (!FORMATS.includes(Number(format))) throw new Error("試合形式は5・7・9ゲームです");
    this.format = Number(format);
    this.winners = [...winners];
  }

  addPoint(winner) {
    if (!['self', 'opponent'].includes(winner)) throw new Error('得点側が不正です');
    if (this.getState().matchComplete) return this.getState();
    this.winners.push(winner);
    return this.getState();
  }

  undo() {
    this.winners.pop();
    return this.getState();
  }

  getState() {
    const clinch = (this.format + 1) / 2;
    const finalTrigger = clinch - 1;
    const games = { self: 0, opponent: 0 };
    let points = { self: 0, opponent: 0 };
    let gameNumber = 1;
    let isFinalGame = false;
    let matchComplete = false;
    let winner = null;

    for (const pointWinner of this.winners) {
      if (matchComplete) break;
      isFinalGame = games.self === finalTrigger && games.opponent === finalTrigger;
      points[pointWinner] += 1;
      const target = isFinalGame ? 7 : 4;
      const gameWon = points[pointWinner] >= target && Math.abs(points.self - points.opponent) >= 2;
      if (gameWon) {
        games[pointWinner] += 1;
        points = { self: 0, opponent: 0 };
        if (games[pointWinner] === clinch) {
          matchComplete = true;
          winner = pointWinner;
        } else {
          gameNumber += 1;
        }
      }
    }

    isFinalGame = !matchComplete && games.self === finalTrigger && games.opponent === finalTrigger;
    return { format: this.format, clinch, games, points, gameNumber, isFinalGame, matchComplete, winner };
  }
}

export function scoreAfterPoint(format, priorWinners, winner) {
  const engine = new SoftTennisMatchEngine(format, priorWinners);
  return engine.addPoint(winner);
}
