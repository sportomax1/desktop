const assert = require('node:assert/strict');
const { result, bestMove } = require('../web/tictactoe.js');
const empty = Array(9).fill('');
const board = (...marks) => marks.map(m => m === '-' ? '' : m);
assert.deepEqual(result(board('X','X','X','-','O','-','O','-','-')), { winner: 'X', line: [0,1,2] });
assert.deepEqual(result(board('X','O','X','O','O','X','X','X','O')), { winner: 'draw', line: [] });
assert.equal(result(empty), null);
assert.equal(bestMove(empty), 4, 'computer opens center');
assert.equal(bestMove(board('X','X','-','O','O','-','-','-','-')), 5, 'computer takes winning move');
assert.equal(bestMove(board('X','X','-','-','O','-','-','-','-')), 2, 'computer blocks immediate X win');
assert.equal(bestMove(board('X','X','X','O','O','-','-','-','-')), -1, 'no move after finished game');
// Play optimal X from every reachable position: O must never lose.
let stateCount = 0;
function proveComputerCannotLose(b, turn) {
  const terminal = result(b);
  if (terminal) {
    assert.notEqual(terminal.winner, 'X', 'Computer allowed human to win: ' + b);
    stateCount++;
    return;
  }
  if (turn === 'O') {
    const next = bestMove(b);
    assert.ok(next >= 0 && !b[next]);
    b[next] = 'O';
    proveComputerCannotLose(b, 'X');
    b[next] = '';
  } else {
    for (let i = 0; i < b.length; i++) {
      if (b[i]) continue;
      b[i] = 'X';
      proveComputerCannotLose(b, 'O');
      b[i] = '';
    }
  }
}
proveComputerCannotLose(empty.slice(), 'X');
console.log(`PASS: Tic Tac Toe winners, draws, tactical moves, unbeatability across ${stateCount} human branches.`);
