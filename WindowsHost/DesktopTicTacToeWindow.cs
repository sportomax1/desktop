using System;
using System.Drawing;
using System.Linq;
using Forms = System.Windows.Forms;

namespace DenverSportsWallpaper;

// A native, non-topmost desktop companion. The WebView2 wallpaper sits behind
// Explorer's icons; Windows won't forward mouse clicks to that layer. This
// compact panel stays clickable and does not cover normal maximized apps.
internal sealed class DesktopTicTacToeWindow : Forms.Form
{
    private static readonly int[][] Lines =
    {
        new[] {0,1,2}, new[] {3,4,5}, new[] {6,7,8},
        new[] {0,3,6}, new[] {1,4,7}, new[] {2,5,8},
        new[] {0,4,8}, new[] {2,4,6}
    };
    private static readonly int[] MoveOrder = {4,0,2,6,8,1,3,5,7};
    private static readonly Color BackgroundColor = Color.FromArgb(19, 34, 53);
    private static readonly Color CellColor = Color.FromArgb(29, 50, 75);
    private static readonly Color TextColor = Color.FromArgb(235, 242, 252);
    private static readonly Color MutedColor = Color.FromArgb(153, 174, 200);
    private static readonly Color XColor = Color.FromArgb(242, 178, 109);
    private static readonly Color OColor = Color.FromArgb(137, 204, 231);

    private readonly Forms.Button[] _cells = new Forms.Button[9];
    private readonly Forms.Label _status;
    private readonly Forms.Label _score;
    private readonly Forms.Button _mode;
    private readonly Forms.Timer _cpuTimer;
    private readonly char[] _board = new char[9];
    private readonly int[] _scores = new int[3]; // X, O, draw
    private bool _cpu = true;
    private bool _finished;
    private char _turn = 'X';

    // Appears without stealing focus when the wallpaper launches at login.
    protected override bool ShowWithoutActivation => true;

    public DesktopTicTacToeWindow(Forms.Screen screen)
    {
        Text = "Denver Tic Tac Toe";
        FormBorderStyle = Forms.FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = Forms.FormStartPosition.Manual;
        ClientSize = new Size(300, 176);
        BackColor = BackgroundColor;
        ForeColor = TextColor;
        TopMost = false; // Do not obscure other applications.
        Location = new Point(screen.Bounds.Left + screen.Bounds.Width / 2 - 322,
            screen.Bounds.Top + 38);
        DoubleBuffered = true;
        Padding = new Forms.Padding(0);

        var heading = new Forms.Label
        {
            Text = "✳  TIC TAC TOE", Location = new Point(12, 10), Size = new Size(183, 18),
            ForeColor = Color.FromArgb(241, 235, 226),
            Font = new Font("Segoe UI", 8f, FontStyle.Bold),
            TextAlign = ContentAlignment.MiddleLeft
        };
        Controls.Add(heading);
        var newGame = SmallButton("↻ NEW", 227, 9, 63, 23);
        newGame.Click += (_, _) => Reset();
        Controls.Add(newGame);

        for (var i = 0; i < 9; i++)
        {
            var index = i;
            var cell = new Forms.Button
            {
                Text = "", Location = new Point(12 + (i % 3) * 42, 39 + (i / 3) * 41),
                Size = new Size(38, 37), BackColor = CellColor, ForeColor = TextColor,
                FlatStyle = Forms.FlatStyle.Flat, TabStop = false,
                Font = new Font("Segoe UI", 17f, FontStyle.Bold),
                UseVisualStyleBackColor = false
            };
            cell.FlatAppearance.BorderColor = Color.FromArgb(71, 91, 118);
            cell.FlatAppearance.BorderSize = 1;
            cell.Click += (_, _) => Move(index);
            _cells[i] = cell;
            Controls.Add(cell);
        }

        Controls.Add(new Forms.Label
        {
            Text = "QUICK MATCH", Location = new Point(150, 44), Size = new Size(137, 17),
            ForeColor = MutedColor, Font = new Font("Segoe UI", 7f, FontStyle.Bold)
        });
        _status = new Forms.Label
        {
            Text = "Your turn · X", Location = new Point(150, 62), Size = new Size(140, 34),
            ForeColor = TextColor, Font = new Font("Segoe UI", 9.5f, FontStyle.Bold)
        };
        Controls.Add(_status);
        _score = new Forms.Label
        {
            Location = new Point(150, 100), Size = new Size(141, 19),
            ForeColor = MutedColor, Font = new Font("Segoe UI", 7.5f, FontStyle.Bold)
        };
        Controls.Add(_score);
        _mode = SmallButton("VS COMPUTER ▾", 149, 130, 140, 29);
        _mode.Click += (_, _) =>
        {
            _cpu = !_cpu;
            Array.Clear(_scores, 0, _scores.Length);
            Reset();
        };
        Controls.Add(_mode);

        _cpuTimer = new Forms.Timer { Interval = 180 };
        _cpuTimer.Tick += (_, _) =>
        {
            _cpuTimer.Stop();
            if (_cpu && !_finished && _turn == 'O')
            {
                var index = BestMove();
                if (index >= 0) { _board[index] = 'O'; CheckTurn(); }
            }
        };
        Reset();
    }

    private static Forms.Button SmallButton(string title, int x, int y, int width, int height)
    {
        var button = new Forms.Button
        {
            Text = title, Location = new Point(x, y), Size = new Size(width, height),
            FlatStyle = Forms.FlatStyle.Flat, BackColor = Color.FromArgb(29, 52, 77),
            ForeColor = TextColor, UseVisualStyleBackColor = false,
            Font = new Font("Segoe UI", 7f, FontStyle.Bold), TabStop = false
        };
        button.FlatAppearance.BorderColor = Color.FromArgb(67, 91, 119);
        button.FlatAppearance.BorderSize = 1;
        return button;
    }

    protected override void OnPaint(Forms.PaintEventArgs e)
    {
        base.OnPaint(e);
        using var pen = new Pen(Color.FromArgb(100, 123, 149), 1);
        e.Graphics.DrawRectangle(pen, 0, 0, Width - 1, Height - 1);
    }

    private void Reset()
    {
        _cpuTimer.Stop();
        Array.Clear(_board, 0, _board.Length);
        _turn = 'X';
        _finished = false;
        PaintBoard();
    }

    private void Move(int index)
    {
        if (_finished || _board[index] != '\0' || (_cpu && _turn != 'X')) return;
        _board[index] = _turn;
        CheckTurn();
    }

    private (char Winner, int[] Line) Evaluate()
    {
        foreach (var line in Lines)
        {
            var first = _board[line[0]];
            if (first != '\0' && first == _board[line[1]] && first == _board[line[2]])
                return (first, line);
        }
        return _board.All(cell => cell != '\0') ? ('D', Array.Empty<int>()) : ('\0', Array.Empty<int>());
    }

    private void CheckTurn()
    {
        var (winner, _) = Evaluate();
        if (winner != '\0')
        {
            _finished = true;
            _scores[winner == 'X' ? 0 : winner == 'O' ? 1 : 2]++;
            PaintBoard();
            return;
        }
        _turn = _turn == 'X' ? 'O' : 'X';
        PaintBoard();
        if (_cpu && _turn == 'O') _cpuTimer.Start();
    }

    private void PaintBoard()
    {
        var (winner, line) = Evaluate();
        for (var i = 0; i < 9; i++)
        {
            var mark = _board[i];
            _cells[i].Text = mark == '\0' ? "" : mark.ToString();
            _cells[i].ForeColor = mark == 'X' ? XColor : mark == 'O' ? OColor : TextColor;
            _cells[i].BackColor = _finished && line.Contains(i)
                ? Color.FromArgb(55, 87, 68) : CellColor;
            _cells[i].Enabled = !_finished && mark == '\0' && (!_cpu || _turn == 'X');
        }
        _status.Text = winner == 'D' ? "DRAW GAME" :
            winner == 'X' ? (_cpu ? "YOU WIN!" : "X WINS!") :
            winner == 'O' ? (_cpu ? "COMPUTER WINS" : "O WINS!") :
            _cpu ? (_turn == 'X' ? "Your turn · X" : "CPU thinking…") : $"{_turn}'s turn";
        _score.Text = $"X {_scores[0]}    O {_scores[1]}    DRAW {_scores[2]}";
        _mode.Text = _cpu ? "VS COMPUTER ▾" : "TWO PLAYERS ▾";
    }

    private int BestMove()
    {
        var best = int.MinValue;
        var selected = -1;
        foreach (var cell in MoveOrder)
        {
            if (_board[cell] != '\0') continue;
            _board[cell] = 'O';
            var score = Minimax('X', 0, int.MinValue, int.MaxValue);
            _board[cell] = '\0';
            if (score > best) { best = score; selected = cell; }
        }
        return selected;
    }

    private int Minimax(char player, int depth, int alpha, int beta)
    {
        var (winner, _) = Evaluate();
        if (winner != '\0') return winner == 'O' ? 10 - depth : winner == 'X' ? depth - 10 : 0;
        if (player == 'O')
        {
            var best = int.MinValue;
            foreach (var cell in MoveOrder)
            {
                if (_board[cell] != '\0') continue;
                _board[cell] = 'O';
                best = Math.Max(best, Minimax('X', depth + 1, alpha, beta));
                _board[cell] = '\0';
                alpha = Math.Max(alpha, best);
                if (beta <= alpha) break;
            }
            return best;
        }
        else
        {
            var best = int.MaxValue;
            foreach (var cell in MoveOrder)
            {
                if (_board[cell] != '\0') continue;
                _board[cell] = 'X';
                best = Math.Min(best, Minimax('O', depth + 1, alpha, beta));
                _board[cell] = '\0';
                beta = Math.Min(beta, best);
                if (beta <= alpha) break;
            }
            return best;
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _cpuTimer.Dispose();
            foreach (var cell in _cells) cell.Dispose();
        }
        base.Dispose(disposing);
    }
}
