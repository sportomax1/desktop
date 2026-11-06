/* Denver Sports Wallpaper mini-game. No network access or third-party libraries. */
(function (root) {
  'use strict';
  const LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];
  const MOVE_ORDER = [4, 0, 2, 6, 8, 1, 3, 5, 7];

  function result(board) {
    for (const line of LINES) {
      const [a, b, c] = line;
      if (board[a] && board[a] === board[b] && board[b] === board[c]) {
        return { winner: board[a], line };
      }
    }
    return board.every(Boolean) ? { winner: 'draw', line: [] } : null;
  }

  function minimax(board, turn, depth, alpha, beta) {
    const terminal = result(board);
    if (terminal) return terminal.winner === 'O' ? 10 - depth : terminal.winner === 'X' ? depth - 10 : 0;
    if (turn === 'O') {
      let best = -Infinity;
      for (const cell of MOVE_ORDER) {
        if (board[cell]) continue;
        board[cell] = 'O';
        best = Math.max(best, minimax(board, 'X', depth + 1, alpha, beta));
        board[cell] = '';
        alpha = Math.max(alpha, best);
        if (beta <= alpha) break;
      }
      return best;
    }
    let best = Infinity;
    for (const cell of MOVE_ORDER) {
      if (board[cell]) continue;
      board[cell] = 'X';
      best = Math.min(best, minimax(board, 'O', depth + 1, alpha, beta));
      board[cell] = '';
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }

  function bestMove(input) {
    const board = input.slice();
    if (result(board)) return -1;
    let bestScore = -Infinity;
    let bestCell = -1;
    for (const cell of MOVE_ORDER) {
      if (board[cell]) continue;
      board[cell] = 'O';
      const score = minimax(board, 'X', 0, -Infinity, Infinity);
      board[cell] = '';
      if (score > bestScore) { bestScore = score; bestCell = cell; }
    }
    return bestCell;
  }

  const API = { result, bestMove };
  if (typeof module === 'object' && module.exports) module.exports = API;
  if (typeof document === 'undefined') return;

  const panel = document.getElementById('ticTacToe');
  if (!panel) return;
  const cells = [...panel.querySelectorAll('[data-cell]')];
  const status = document.getElementById('tttStatus');
  const modeButton = document.getElementById('tttMode');
  const resetButton = document.getElementById('tttReset');
  const scoreboard = {
    X: document.getElementById('tttScoreX'),
    O: document.getElementById('tttScoreO'),
    draw: document.getElementById('tttScoreDraw')
  };
  let board = Array(9).fill('');
  let turn = 'X';
  let cpuMode = true;
  let finished = false;
  let winningLine = [];
  let timer = null;
  const scores = { X: 0, O: 0, draw: 0 };

  function paint() {
    const terminal = result(board);
    cells.forEach((cell, index) => {
      cell.textContent = board[index];
      cell.classList.toggle('ttt-x', board[index] === 'X');
      cell.classList.toggle('ttt-o', board[index] === 'O');
      cell.classList.toggle('ttt-win', winningLine.includes(index));
      cell.disabled = Boolean(board[index]) || finished || (cpuMode && turn === 'O');
      cell.setAttribute('aria-label', `${['Top left','Top middle','Top right','Middle left','Center','Middle right','Bottom left','Bottom middle','Bottom right'][index]}: ${board[index] || 'empty'}`);
    });
    if (terminal?.winner === 'draw') status.textContent = 'DRAW GAME';
    else if (terminal?.winner) status.textContent = cpuMode ? (terminal.winner === 'X' ? 'YOU WIN!' : 'COMPUTER WINS') : `${terminal.winner} WINS!`;
    else if (cpuMode) status.textContent = turn === 'X' ? 'Your turn · X' : 'CPU thinking…';
    else status.textContent = `${turn}'s turn`;
    modeButton.textContent = cpuMode ? 'VS COMPUTER ▾' : 'TWO PLAYERS ▾';
    for (const key of ['X', 'O', 'draw']) scoreboard[key].textContent = scores[key];
  }

  function finishOrNext() {
    const terminal = result(board);
    if (terminal) {
      finished = true;
      winningLine = terminal.line;
      scores[terminal.winner]++;
      paint();
      return;
    }
    turn = turn === 'X' ? 'O' : 'X';
    paint();
    if (cpuMode && turn === 'O') {
      timer = setTimeout(() => {
        timer = null;
        if (finished || turn !== 'O' || !cpuMode) return;
        const move = bestMove(board);
        if (move >= 0) { board[move] = 'O'; finishOrNext(); }
      }, 180);
    }
  }

  function play(index) {
    if (finished || board[index] || (cpuMode && turn !== 'X')) return;
    board[index] = turn;
    finishOrNext();
  }

  function newGame(clearScores = false) {
    if (timer) { clearTimeout(timer); timer = null; }
    board = Array(9).fill('');
    turn = 'X';
    finished = false;
    winningLine = [];
    if (clearScores) for (const key of Object.keys(scores)) scores[key] = 0;
    paint();
  }

  for (const cell of cells) cell.addEventListener('click', () => play(Number(cell.dataset.cell)));
  resetButton.addEventListener('click', () => newGame());
  modeButton.addEventListener('click', () => { cpuMode = !cpuMode; newGame(true); });
  paint();
})(typeof globalThis !== 'undefined' ? globalThis : this);
