// 점수판: 한 판이 끝날 때마다 결과를 기록한다
import { getWinner } from './board.js';

export function createScore() {
  return { X: 0, O: 0, draw: 0 };
}

export function recordResult(score, cells) {
  const winner = getWinner(cells);
  if (winner) {
    return { ...score, [winner]: score[winner] + 1 };
  }
  return { ...score, draw: score.draw + 1 };
}

export function resetScore() {
  return createScore();
}
