using System;
using System.Drawing;
using System.Linq;
using Forms = System.Windows.Forms;

namespace DenverSportsWallpaper;

// A small clickable companion above Explorer's wallpaper layer. This is not
// topmost, so maximized applications still cover it normally.
internal sealed class Desktop2048Window : Forms.Form
{
    private readonly int[,] _board = new int[4,4];
    private readonly Forms.Label[,] _tiles = new Forms.Label[4,4];
    private readonly Forms.Label _scoreLabel;
    private readonly Forms.Label _status;
    private readonly Random _random = new();
    private int _score;

    protected override bool ShowWithoutActivation => true;

    internal Desktop2048Window(Forms.Screen screen)
    {
        Text = "2048 · Desktop mini game";
        FormBorderStyle = Forms.FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = Forms.FormStartPosition.Manual;
        ClientSize = new Size(254, 288);
        BackColor = Color.FromArgb(19,34,53);
        ForeColor = Color.White;
        Location = new Point(screen.Bounds.Left + screen.Bounds.Width / 2 + 30, screen.Bounds.Top + 38);
        TopMost = false;
        KeyPreview = true;
        DoubleBuffered = true;

        Controls.Add(new Forms.Label { Text = "2048  •  MERGE TILES", ForeColor = Color.FromArgb(242,224,188),
            Font = new Font("Segoe UI", 9f, FontStyle.Bold), Location = new Point(12,9), Size = new Size(176,23) });
        var reset = new Forms.Button { Text = "NEW", Location = new Point(192,6), Size = new Size(51,24),
            BackColor = Color.FromArgb(47,70,95), ForeColor = Color.White, FlatStyle = Forms.FlatStyle.Flat,
            Font = new Font("Segoe UI", 8, FontStyle.Bold), TabStop = false };
        reset.Click += (_,_) => Reset();
        Controls.Add(reset);
        _scoreLabel = new Forms.Label { Location = new Point(12,35), Size = new Size(232,20),
            ForeColor = Color.FromArgb(181,199,218), Font = new Font("Segoe UI", 9f) };
        Controls.Add(_scoreLabel);

        for (int row=0; row<4; row++)
        for (int col=0; col<4; col++)
        {
            var tile = new Forms.Label { Location = new Point(13+col*59,61+row*46),
                Size = new Size(53,40), TextAlign = ContentAlignment.MiddleCenter,
                BackColor = Color.FromArgb(32,51,75), ForeColor = Color.White,
                Font = new Font("Segoe UI", 13f, FontStyle.Bold), BorderStyle = Forms.BorderStyle.FixedSingle };
            Controls.Add(tile);
            _tiles[row,col] = tile;
        }
        _status = new Forms.Label { Location = new Point(11,248), Size = new Size(124,32),
            Text = "Use arrow keys", ForeColor = Color.FromArgb(184,201,219), Font = new Font("Segoe UI", 8f) };
        Controls.Add(_status);
        var arrows = new[] { ("◀", 0, 138), ("▼", 1, 166), ("▲", 2, 194), ("▶", 3, 222) };
        foreach (var (label, direction, x) in arrows)
        {
            var button = new Forms.Button { Text=label, Location=new Point(x,247), Size=new Size(27,30),
                BackColor=Color.FromArgb(43,72,104), ForeColor=Color.White,
                FlatStyle=Forms.FlatStyle.Flat, TabStop=false, Font=new Font("Segoe UI", 10f) };
            button.Click += (_,_) => { Slide(direction); button.Focus(); };
            Controls.Add(button);
        }
        KeyDown += (_,e) =>
        {
            int d = e.KeyCode switch
            {
                Forms.Keys.Left or Forms.Keys.A => 0,
                Forms.Keys.Down or Forms.Keys.S => 1,
                Forms.Keys.Up or Forms.Keys.W => 2,
                Forms.Keys.Right or Forms.Keys.D => 3,
                _ => -1
            };
            if (d >= 0) { Slide(d); e.Handled = true; e.SuppressKeyPress = true; }
        };
        Reset();
    }

    private void Reset()
    {
        Array.Clear(_board,0,_board.Length);
        _score=0;
        NewTile(); NewTile();
        _status.Text="Join tiles to reach 2048";
        Render();
    }

    private void NewTile()
    {
        var empty = Enumerable.Range(0,16).Where(i=>_board[i/4,i%4]==0).ToArray();
        if (empty.Length==0) return;
        int position=empty[_random.Next(empty.Length)];
        _board[position/4,position%4]=_random.Next(10)==0?4:2;
    }

    private void Slide(int dir)
    {
        bool changed=false;
        for (int lane=0;lane<4;lane++)
        {
            var original = new int[4];
            for(int i=0;i<4;i++) original[i]=Cell(lane,i,dir);
            var nonzero=original.Where(v=>v!=0).ToArray();
            var next=new int[4]; int at=0;
            for (int i=0;i<nonzero.Length;i++)
            {
                if (i+1<nonzero.Length && nonzero[i]==nonzero[i+1])
                { next[at]=nonzero[i]*2; _score+=next[at]; i++; }
                else next[at]=nonzero[i];
                at++;
            }
            for (int i=0;i<4;i++)
            {
                if (next[i]!=original[i]) changed=true;
                SetCell(lane,i,dir,next[i]);
            }
        }
        if (!changed) return;
        NewTile();
        bool full=true;
        for (int row=0;row<4;row++) for(int col=0;col<4;col++)
        {
            if (_board[row,col]==0 ||
                (row<3 && _board[row,col]==_board[row+1,col]) ||
                (col<3 && _board[row,col]==_board[row,col+1])) full=false;
        }
        _status.Text = full ? "No moves · NEW to retry" : "Use arrows to merge";
        Render();
    }

    private int Cell(int lane,int i,int direction) => direction switch
    {
        0=>_board[lane,i], 3=>_board[lane,3-i],
        2=>_board[i,lane], _=>_board[3-i,lane]
    };
    private void SetCell(int lane,int i,int direction,int value)
    {
        switch(direction)
        {
            case 0: _board[lane,i]=value; break;
            case 3: _board[lane,3-i]=value; break;
            case 2: _board[i,lane]=value; break;
            default: _board[3-i,lane]=value; break;
        }
    }

    private void Render()
    {
        _scoreLabel.Text=$"SCORE  {_score:#,0}";
        for (int row=0;row<4;row++)
        for (int col=0;col<4;col++)
        {
            int value=_board[row,col];
            var tile=_tiles[row,col];
            tile.Text=value==0?"":value.ToString();
            tile.Font = new Font("Segoe UI", value>=1024 ? 10f : 13f, FontStyle.Bold);
            tile.BackColor = value switch
            {
                0 => Color.FromArgb(32,51,75),
                2 => Color.FromArgb(63,94,117),
                4 => Color.FromArgb(58,117,133),
                8 => Color.FromArgb(150,115,70),
                16 => Color.FromArgb(173,107,65),
                32 => Color.FromArgb(174,88,72),
                64 => Color.FromArgb(176,71,65),
                _ => Color.FromArgb(172,140,56)
            };
        }
    }
}
