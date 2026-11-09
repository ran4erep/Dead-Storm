import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Trophy, AlertTriangle, RefreshCw, Sparkles, BrainCircuit } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ChessPiece {
  id: string;
  type: 'p' | 'r' | 'n' | 'b' | 'q' | 'k';
  color: 'white' | 'black';
  hasMoved?: boolean;
}

type BoardState = (ChessPiece | null)[][];

interface ChessModalProps {
  onClose: () => void;
  playSound?: (name: string) => void;
  strings?: any;
}

// Piece-Square positional tables to guide the AI
const pawnTable = [
  [0,  0,  0,  0,  0,  0,  0,  0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [5,  5, 10, 25, 25, 10,  5,  5],
  [0,  0,  0, 20, 20,  0,  0,  0],
  [5, -5,-10,  0,  0,-10, -5,  5],
  [5, 10, 10,-20,-20, 10, 10,  5],
  [0,  0,  0,  0,  0,  0,  0,  0]
];

const knightTable = [
  [-50,-40,-30,-30,-30,-30,-40,-50],
  [-40,-20,  0,  0,  0,  0,-20,-40],
  [-30,  0, 10, 15, 15, 10,  0,-30],
  [-30,  5, 15, 20, 20, 15,  5,-30],
  [-30,  0, 15, 20, 20, 15,  0,-30],
  [-30,  5, 10, 15, 15, 10,  5,-30],
  [-40,-20,  0,  5,  5,  0,-20,-40],
  [-50,-40,-30,-30,-30,-30,-40,-50]
];

const bishopTable = [
  [-20,-10,-10,-10,-10,-10,-10,-20],
  [-10,  0,  0,  0,  0,  0,  0,-10],
  [-10,  0,  5, 10, 10,  5,  0,-10],
  [-10,  5,  5, 10, 10,  5,  5,-10],
  [-10,  0, 10, 10, 10, 10,  0,-10],
  [-10, 10, 10, 10, 10, 10, 10,-10],
  [-10,  5,  0,  0,  0,  0,  5,-10],
  [-20,-10,-10,-10,-10,-10,-10,-20]
];

const rookTable = [
  [0,  0,  0,  0,  0,  0,  0,  0],
  [5, 10, 10, 10, 10, 10, 10,  5],
  [-5,  0,  0,  0,  0,  0,  0, -5],
  [-5,  0,  0,  0,  0,  0,  0, -5],
  [-5,  0,  0,  0,  0,  0,  0, -5],
  [-5,  0,  0,  0,  0,  0,  0, -5],
  [-5,  0,  0,  0,  0,  0,  0, -5],
  [0,  0,  0,  5,  5,  0,  0,  0]
];

const initialBoard = (): BoardState => {
  const backRow = (color: 'white' | 'black'): (ChessPiece | null)[] => [
    { id: `${color}-r1`, type: 'r', color, hasMoved: false },
    { id: `${color}-n1`, type: 'n', color },
    { id: `${color}-b1`, type: 'b', color },
    { id: `${color}-q`, type: 'q', color },
    { id: `${color}-k`, type: 'k', color, hasMoved: false },
    { id: `${color}-b2`, type: 'b', color },
    { id: `${color}-n2`, type: 'n', color },
    { id: `${color}-r2`, type: 'r', color, hasMoved: false },
  ];
  const pawnRow = (color: 'white' | 'black'): (ChessPiece | null)[] =>
    Array(8).fill(null).map((_, idx) => ({ id: `${color}-p${idx}`, type: 'p', color, hasMoved: false }));

  return [
    backRow('black'),
    pawnRow('black'),
    Array(8).fill(null),
    Array(8).fill(null),
    Array(8).fill(null),
    Array(8).fill(null),
    pawnRow('white'),
    backRow('white'),
  ];
};

const ChessModal: React.FC<ChessModalProps> = ({ onClose, playSound, strings }) => {
  const [playerColor, setPlayerColor] = useState<'white' | 'black'>(() => Math.random() < 0.5 ? 'white' : 'black');
  const [board, setBoard] = useState<BoardState>(initialBoard);
  const [selectedSquare, setSelectedSquare] = useState<{ r: number; c: number } | null>(null);
  const [validMoves, setValidMoves] = useState<{ r: number; c: number }[]>([]);
  const [turn, setTurn] = useState<'white' | 'black'>('white');
  const [gameOver, setGameOver] = useState<'win' | 'loss' | 'stalemate' | null>(null);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [lastMove, setLastMove] = useState<{
    from: { r: number; c: number };
    to: { r: number; c: number };
    player: 'white' | 'black';
  } | null>(null);

  const isRu = strings?.inventory?.title === "ИНВЕНТАРЬ" || strings?.inventory?.empty === "Карманы пусты.";

  // Raw legal moves without check-safety guard to keep minimax recursive loop blazing fast
  const getRawMoves = useCallback((currentBoard: BoardState, r: number, c: number): { r: number; c: number }[] => {
    const piece = currentBoard[r][c];
    if (!piece) return [];
    const moves: { r: number; c: number }[] = [];
    const color = piece.color;
    const oppColor = color === 'white' ? 'black' : 'white';

    const addIfOnBoard = (row: number, col: number) => {
      if (row >= 0 && row < 8 && col >= 0 && col < 8) {
        const p = currentBoard[row][col];
        if (!p || p.color === oppColor) {
          moves.push({ r: row, c: col });
          return !p; // True if step onto empty square, false if capturing/blocked
        }
      }
      return false;
    };

    switch (piece.type) {
      case 'p': {
        const dir = color === 'white' ? -1 : 1;
        const startRow = color === 'white' ? 6 : 1;
        const nextR = r + dir;

        // Standard forward move
        if (nextR >= 0 && nextR < 8 && !currentBoard[nextR][c]) {
          moves.push({ r: nextR, c });
          // Double jump
          const doubleR = r + 2 * dir;
          if (r === startRow && !currentBoard[doubleR][c]) {
            moves.push({ r: doubleR, c });
          }
        }
        // Diagonal captures
        for (const offset of [-1, 1]) {
          const targetC = c + offset;
          if (nextR >= 0 && nextR < 8 && targetC >= 0 && targetC < 8) {
            const targetPiece = currentBoard[nextR][targetC];
            if (targetPiece && targetPiece.color === oppColor) {
              moves.push({ r: nextR, c: targetC });
            }
          }
        }
        break;
      }
      case 'n': {
        const jumps = [
          [-2, -1], [-2, 1], [-1, -2], [-1, 2],
          [1, -2], [1, 2], [2, -1], [2, 1]
        ];
        for (const [dr, dc] of jumps) {
          addIfOnBoard(r + dr, c + dc);
        }
        break;
      }
      case 'b': {
        const dirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
        for (const [dr, dc] of dirs) {
          let currR = r + dr;
          let currC = c + dc;
          while (currR >= 0 && currR < 8 && currC >= 0 && currC < 8) {
            const canContinue = addIfOnBoard(currR, currC);
            if (!canContinue) break;
            currR += dr;
            currC += dc;
          }
        }
        break;
      }
      case 'r': {
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        for (const [dr, dc] of dirs) {
          let currR = r + dr;
          let currC = c + dc;
          while (currR >= 0 && currR < 8 && currC >= 0 && currC < 8) {
            const canContinue = addIfOnBoard(currR, currC);
            if (!canContinue) break;
            currR += dr;
            currC += dc;
          }
        }
        break;
      }
      case 'q': {
        const dirs = [[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]];
        for (const [dr, dc] of dirs) {
          let currR = r + dr;
          let currC = c + dc;
          while (currR >= 0 && currR < 8 && currC >= 0 && currC < 8) {
            const canContinue = addIfOnBoard(currR, currC);
            if (!canContinue) break;
            currR += dr;
            currC += dc;
          }
        }
        break;
      }
      case 'k': {
        const dirs = [[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]];
        for (const [dr, dc] of dirs) {
          addIfOnBoard(r + dr, c + dc);
        }
        break;
      }
    }
    return moves;
  }, []);

  const isKingInCheck = useCallback((currentBoard: BoardState, color: 'white' | 'black'): boolean => {
    let kingR = -1;
    let kingC = -1;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const p = currentBoard[row][col];
        if (p && p.type === 'k' && p.color === color) {
          kingR = row;
          kingC = col;
          break;
        }
      }
      if (kingR !== -1) break;
    }

    if (kingR === -1) return false;

    const oppColor = color === 'white' ? 'black' : 'white';
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const p = currentBoard[row][col];
        if (p && p.color === oppColor) {
          const rawMoves = getRawMoves(currentBoard, row, col);
          if (rawMoves.some(m => m.r === kingR && m.c === kingC)) {
            return true;
          }
        }
      }
    }
    return false;
  }, [getRawMoves]);

  const getValidMoves = useCallback((currentBoard: BoardState, r: number, c: number): { r: number; c: number }[] => {
    const piece = currentBoard[r][c];
    if (!piece) return [];
    const rawMoves = getRawMoves(currentBoard, r, c);
    const color = piece.color;

    return rawMoves.filter(m => {
      // Try move on cloned board
      const cloneBoard = currentBoard.map(row => row.map(cell => cell ? { ...cell } : null));
      cloneBoard[m.r][m.c] = cloneBoard[r][c];
      cloneBoard[r][c] = null;
      return !isKingInCheck(cloneBoard, color);
    });
  }, [getRawMoves, isKingInCheck]);

  // Evaluates board score from White perspective (positive = White leads, negative = Black leads)
  const evaluateBoard = useCallback((currentBoard: BoardState): number => {
    let score = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = currentBoard[r][c];
        if (p) {
          let val = 0;
          switch (p.type) {
            case 'p':
              val = 100 + (p.color === 'white' ? pawnTable[r][c] : pawnTable[7 - r][c]);
              break;
            case 'n':
              val = 320 + knightTable[r][c];
              break;
            case 'b':
              val = 330 + bishopTable[r][c];
              break;
            case 'r':
              val = 500 + (p.color === 'white' ? rookTable[r][c] : rookTable[7 - r][c]);
              break;
            case 'q':
              val = 900;
              break;
            case 'k':
              val = 20000;
              break;
          }
          score += p.color === 'white' ? val : -val;
        }
      }
    }
    return score;
  }, []);

  // Extremely fast alpha-beta minimax implementation (depth 2 for instant CPU-light execution)
  const minimax = useCallback((
    currentBoard: BoardState,
    depth: number,
    alpha: number,
    beta: number,
    isMaximizing: boolean
  ): number => {
    if (depth === 0) {
      return evaluateBoard(currentBoard);
    }

    const color = isMaximizing ? 'white' : 'black';
    const moves: { from: { r: number; c: number }; to: { r: number; c: number } }[] = [];

    // Collect all valid moves
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = currentBoard[r][c];
        if (p && p.color === color) {
          const valid = getValidMoves(currentBoard, r, c);
          for (const m of valid) {
            moves.push({ from: { r, c }, to: m });
          }
        }
      }
    }

    if (moves.length === 0) {
      if (isKingInCheck(currentBoard, color)) {
        return isMaximizing ? -15000 + (3 - depth) : 15000 - (3 - depth);
      }
      return 0; // Stalemate
    }

    if (isMaximizing) {
      let maxEval = -Infinity;
      for (const move of moves) {
        const cloneBoard = currentBoard.map(row => row.map(cell => cell ? { ...cell } : null));
        cloneBoard[move.to.r][move.to.c] = cloneBoard[move.from.r][move.from.c];
        cloneBoard[move.from.r][move.from.c] = null;
        if (cloneBoard[move.to.r][move.to.c]?.type === 'p' && move.to.r === 0) {
          cloneBoard[move.to.r][move.to.c]!.type = 'q';
        }

        const evaluation = minimax(cloneBoard, depth - 1, alpha, beta, false);
        maxEval = Math.max(maxEval, evaluation);
        alpha = Math.max(alpha, evaluation);
        if (beta <= alpha) break;
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const move of moves) {
        const cloneBoard = currentBoard.map(row => row.map(cell => cell ? { ...cell } : null));
        cloneBoard[move.to.r][move.to.c] = cloneBoard[move.from.r][move.from.c];
        cloneBoard[move.from.r][move.from.c] = null;
        if (cloneBoard[move.to.r][move.to.c]?.type === 'p' && move.to.r === 7) {
          cloneBoard[move.to.r][move.to.c]!.type = 'q';
        }

        const evaluation = minimax(cloneBoard, depth - 1, alpha, beta, true);
        minEval = Math.min(minEval, evaluation);
        beta = Math.min(beta, evaluation);
        if (beta <= alpha) break;
      }
      return minEval;
    }
  }, [evaluateBoard, getValidMoves, isKingInCheck]);

  const isWhiteInCheck = useMemo(() => isKingInCheck(board, 'white'), [board, isKingInCheck]);
  const isBlackInCheck = useMemo(() => isKingInCheck(board, 'black'), [board, isKingInCheck]);

  const aiThinkingRef = React.useRef(false);

  // AI calculates best move using alpha-beta minimax
  const performAiTurn = useCallback(() => {
    const aiColor = playerColor === 'white' ? 'black' : 'white';
    const playerColorVal = playerColor;

    const moves: { from: { r: number; c: number }; to: { r: number; c: number } }[] = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p && p.color === aiColor) {
          const valid = getValidMoves(board, r, c);
          for (const m of valid) {
            moves.push({ from: { r, c }, to: m });
          }
        }
      }
    }

    if (moves.length === 0) {
      if (isKingInCheck(board, aiColor)) {
        setGameOver('win'); // Player wins if AI is checkmated
        playSound?.('SYS_CLICK');
      } else {
        setGameOver('stalemate');
      }
      setIsAiThinking(false);
      return;
    }

    let bestMove: typeof moves[0] | null = null;
    const isAiMaximizing = aiColor === 'white';
    let bestValue = isAiMaximizing ? -Infinity : Infinity;

    for (const move of moves) {
      const cloneBoard = board.map(row => row.map(cell => cell ? { ...cell } : null));
      cloneBoard[move.to.r][move.to.c] = cloneBoard[move.from.r][move.from.c];
      cloneBoard[move.from.r][move.from.c] = null;
      
      const promoRow = aiColor === 'white' ? 0 : 7;
      if (cloneBoard[move.to.r][move.to.c]?.type === 'p' && move.to.r === promoRow) {
        cloneBoard[move.to.r][move.to.c]!.type = 'q';
      }

      const val = minimax(cloneBoard, 2, -Infinity, Infinity, !isAiMaximizing);
      if (isAiMaximizing) {
        if (val > bestValue) {
          bestValue = val;
          bestMove = move;
        }
      } else {
        if (val < bestValue) {
          bestValue = val;
          bestMove = move;
        }
      }
    }

    if (bestMove) {
      const move = bestMove;
      setBoard(prev => {
        const next = prev.map(row => row.map(cell => cell ? { ...cell } : null));
        
        next[move.to.r][move.to.c] = next[move.from.r][move.from.c];
        next[move.from.r][move.from.c] = null;

        const promoRow = aiColor === 'white' ? 0 : 7;
        if (next[move.to.r][move.to.c]?.type === 'p' && move.to.r === promoRow) {
          next[move.to.r][move.to.c]!.type = 'q';
        }

        playSound?.('SYS_CLICK');

        return next;
      });

      setLastMove({ from: move.from, to: move.to, player: aiColor });
      setTurn(playerColorVal);

      // Check Player's legal moves
      const playerMoves: { from: { r: number; c: number }; to: { r: number; c: number } }[] = [];
      setBoard(currentBoard => {
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            const p = currentBoard[r][c];
            if (p && p.color === playerColorVal) {
              const valid = getValidMoves(currentBoard, r, c);
              for (const m of valid) {
                playerMoves.push({ from: { r, c }, to: m });
              }
            }
          }
        }

        if (playerMoves.length === 0) {
          if (isKingInCheck(currentBoard, playerColorVal)) {
            setGameOver('loss'); // Player loses if checkmated
            playSound?.('SYS_CLICK');
          } else {
            setGameOver('stalemate');
          }
        }
        return currentBoard;
      });
    }

    setIsAiThinking(false);
  }, [board, getValidMoves, isKingInCheck, minimax, playSound, playerColor]);

  const aiColor = playerColor === 'white' ? 'black' : 'white';

  useEffect(() => {
    if (turn === aiColor && !gameOver && !aiThinkingRef.current) {
      aiThinkingRef.current = true;
      setIsAiThinking(true);
      const timer = setTimeout(() => {
        performAiTurn();
        aiThinkingRef.current = false;
      }, 400);
      return () => {
        clearTimeout(timer);
        aiThinkingRef.current = false;
      };
    }
  }, [turn, gameOver, aiColor, performAiTurn]);

  const handleSquareClick = (r: number, c: number) => {
    if (turn !== playerColor || isAiThinking || gameOver) return;

    const piece = board[r][c];

    // If a valid destination is clicked
    if (selectedSquare && validMoves.some(m => m.r === r && m.c === c)) {
      const from = selectedSquare;
      const to = { r, c };

      setBoard(prev => {
        const next = prev.map(row => row.map(cell => cell ? { ...cell } : null));

        next[to.r][to.c] = next[from.r][from.c];
        next[from.r][from.c] = null;

        const promoRow = playerColor === 'white' ? 0 : 7;
        if (next[to.r][to.c]?.type === 'p' && to.r === promoRow) {
          next[to.r][to.c]!.type = 'q';
        }

        playSound?.('SYS_CLICK');

        return next;
      });

      setLastMove({ from, to, player: playerColor });
      setSelectedSquare(null);
      setValidMoves([]);
      setTurn(aiColor);
    }
    // Select friendly piece
    else if (piece && piece.color === playerColor) {
      setSelectedSquare({ r, c });
      setValidMoves(getValidMoves(board, r, c));
      playSound?.('SYS_CLICK');
    }
    // Reset selection
    else {
      setSelectedSquare(null);
      setValidMoves([]);
    }
  };

  const resetGame = () => {
    setBoard(initialBoard());
    setSelectedSquare(null);
    setValidMoves([]);
    const nextPlayerColor = Math.random() < 0.5 ? 'white' : 'black';
    setPlayerColor(nextPlayerColor);
    setTurn('white');
    setGameOver(null);
    setLastMove(null);
    setIsAiThinking(false);
    playSound?.('SYS_CLICK');
  };

  const renderPiece = (piece: ChessPiece) => {
    const pieceSymbols: Record<string, string> = {
      'k': '♚',
      'q': '♛',
      'r': '♜',
      'b': '♝',
      'n': '♞',
      'p': '♟'
    };
    const isWhite = piece.color === 'white';
    return (
      <span 
        className={`text-4xl sm:text-5xl font-normal select-none leading-none ${
          isWhite 
            ? 'text-white drop-shadow-[0_1.5px_2px_rgba(0,0,0,0.85)]' 
            : 'text-zinc-950 drop-shadow-[0_1px_1px_rgba(255,255,255,0.75)]'
        }`}
      >
        {pieceSymbols[piece.type]}
      </span>
    );
  };

  return (
    <div 
      className="absolute inset-0 z-[300] bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div 
        id="chess-modal"
        className="relative bg-zinc-950 border border-zinc-800 p-6 rounded-lg shadow-2xl overflow-hidden font-mono flex flex-col items-center"
      >
        {/* Header/Control bar */}
        <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
          <button 
            onClick={resetGame}
            className="p-1.5 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded transition-colors cursor-pointer"
            title={isRu ? "Начать заново" : "Restart Game"}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button 
            onClick={onClose}
            className="p-1.5 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded transition-colors cursor-pointer"
            title={isRu ? "Закрыть" : "Close"}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Small Status indicator if game is active/thinking/ended */}
        <div className="h-6 text-sm font-semibold tracking-wider mb-3 text-zinc-300 flex items-center justify-center gap-2">
          {isAiThinking && (
            <span className="text-zinc-400 animate-pulse flex items-center gap-1.5">
              <BrainCircuit className="w-4 h-4 animate-spin text-zinc-400" />
              {strings?.ui?.chess?.thinking || (isRu ? 'Оппонент думает...' : 'Opponent is thinking...')}
            </span>
          )}
          {!isAiThinking && gameOver && (
            <span className={`font-bold uppercase flex items-center gap-1.5 ${gameOver === 'win' ? 'text-green-500' : gameOver === 'loss' ? 'text-red-500' : 'text-amber-500'}`}>
              {gameOver === 'win' && (
                <>
                  <Trophy className="w-4 h-4 text-green-500 animate-bounce" />
                  {strings?.ui?.chess?.checkmate_victory || (isRu ? 'МАТ! ПОБЕДА!' : 'CHECKMATE! VICTORY!')}
                </>
              )}
              {gameOver === 'loss' && (
                <>
                  <AlertTriangle className="w-4 h-4 text-red-500 animate-pulse" />
                  {strings?.ui?.chess?.checkmate_defeat || (isRu ? 'МАТ! ПОРАЖЕНИЕ' : 'CHECKMATE! DEFEAT')}
                </>
              )}
              {gameOver === 'stalemate' && (strings?.ui?.chess?.stalemate || (isRu ? 'Ничья (Пат)' : 'Stalemate'))}
            </span>
          )}
          {!isAiThinking && !gameOver && (
            <div className="flex items-center gap-2">
              <span className="text-zinc-500 text-xs font-semibold">
                {turn === playerColor ? (strings?.ui?.chess?.your_turn || (isRu ? 'Ваш ход' : 'Your turn')) : (strings?.ui?.chess?.opponents_turn || (isRu ? 'Ход оппонента' : "Opponent's Turn"))}
              </span>
              {(isWhiteInCheck || isBlackInCheck) && (
                <span className="px-1.5 py-0.5 bg-red-950 border border-red-600 text-red-500 text-[10px] font-bold rounded animate-pulse tracking-normal uppercase flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {strings?.ui?.chess?.check || (isRu ? 'ШАХ!' : 'CHECK!')}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Chessboard Wrapper with coordinates */}
        <div className="relative flex flex-col items-center">
          <div className="flex">
            {/* Left numbers */}
            <div className="flex flex-col justify-around text-xs text-zinc-500 font-bold w-6 pr-2 select-none h-[280px] sm:h-[360px]">
              {(playerColor === 'white' ? ['8', '7', '6', '5', '4', '3', '2', '1'] : ['1', '2', '3', '4', '5', '6', '7', '8']).map(n => (
                <div key={n} className="flex items-center justify-end h-full font-mono">{n}</div>
              ))}
            </div>

            {/* The 8x8 Chessboard */}
            <div className="grid grid-cols-8 grid-rows-8 w-[280px] sm:w-[360px] h-[280px] sm:h-[360px] border border-zinc-800 rounded overflow-hidden select-none bg-zinc-900 shadow-lg">
              {Array.from({ length: 8 }).map((_, vr) => {
                const rIdx = playerColor === 'white' ? vr : 7 - vr;
                const row = board[rIdx];
                return Array.from({ length: 8 }).map((_, vc) => {
                  const cIdx = playerColor === 'white' ? vc : 7 - vc;
                  const cell = row[cIdx];
                  const isDark = (rIdx + cIdx) % 2 === 1;
                  const isSelected = selectedSquare?.r === rIdx && selectedSquare?.c === cIdx;
                  const isValidDest = validMoves.some(m => m.r === rIdx && m.c === cIdx);
                  const isHighlightedLast = lastMove && ((lastMove.from.r === rIdx && lastMove.from.c === cIdx) || (lastMove.to.r === rIdx && lastMove.to.c === cIdx));
                  const isLastMoveByOpponent = isHighlightedLast && lastMove.player === aiColor;
                  const isLastMoveByPlayer = isHighlightedLast && lastMove.player === playerColor;
                  const isKingInCheckTile = cell && cell.type === 'k' && (cell.color === 'white' ? isWhiteInCheck : isBlackInCheck);

                  // Classic slate high-contrast chess tiles
                  let tileBg = isDark ? 'bg-zinc-700' : 'bg-zinc-300';
                  
                  if (isKingInCheckTile) {
                    tileBg = 'bg-red-600/40 ring-4 ring-red-500 ring-inset animate-pulse z-10';
                  } else if (isSelected) {
                    tileBg = 'bg-emerald-600/60 ring-2 ring-emerald-400 ring-inset shadow-inner';
                  } else if (isValidDest) {
                    tileBg = isDark ? 'bg-emerald-800/60 cursor-pointer hover:bg-emerald-700/80' : 'bg-emerald-400/60 cursor-pointer hover:bg-emerald-300/80';
                  } else if (isLastMoveByOpponent) {
                    tileBg = isDark ? 'bg-red-950/45 ring-2 ring-red-500/50 ring-inset shadow-inner' : 'bg-red-200 ring-2 ring-red-500/40 ring-inset shadow-inner';
                  } else if (isLastMoveByPlayer) {
                    tileBg = isDark ? 'bg-zinc-600 ring-2 ring-amber-400/20 ring-inset' : 'bg-zinc-200 ring-2 ring-amber-400/20 ring-inset';
                  }

                  return (
                    <div
                      key={`${rIdx}-${cIdx}`}
                      onClick={() => handleSquareClick(rIdx, cIdx)}
                      className={`relative w-full h-full flex items-center justify-center transition-all duration-150 select-none ${tileBg}`}
                    >
                      {/* Visual dot helper for move options */}
                      {isValidDest && !cell && (
                        <span className="w-3 h-3 rounded-full bg-emerald-500/80 shadow"></span>
                      )}

                      {/* Capturable warning on target squares */}
                      {isValidDest && cell && (
                        <span className="absolute inset-0 border-2 border-red-500 bg-red-500/15 pointer-events-none"></span>
                      )}

                      {/* Piece renderer */}
                      {cell && (
                        <motion.div
                          layoutId={`piece-${cell.id}`}
                          whileTap={{ scale: 0.95 }}
                          transition={{ type: "spring", stiffness: 180, damping: 20 }}
                          className="w-full h-full flex items-center justify-center cursor-pointer z-10"
                        >
                          {renderPiece(cell)}
                        </motion.div>
                      )}
                    </div>
                  );
                });
              })}
            </div>

            {/* Right numbers for balance */}
            <div className="flex flex-col justify-around text-xs text-zinc-500 font-bold w-6 pl-2 select-none h-[280px] sm:h-[360px]">
              {(playerColor === 'white' ? ['8', '7', '6', '5', '4', '3', '2', '1'] : ['1', '2', '3', '4', '5', '6', '7', '8']).map(n => (
                <div key={n} className="flex items-center justify-start h-full font-mono">{n}</div>
              ))}
            </div>
          </div>

          {/* Bottom letters */}
          <div className="flex pl-6 pr-6 w-full h-6 justify-around items-center text-xs text-zinc-500 font-bold select-none mt-2">
            {(playerColor === 'white' ? ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] : ['H', 'G', 'F', 'E', 'D', 'C', 'B', 'A']).map(c => (
              <div key={c} className="w-[35px] sm:w-[45px] text-center font-mono">{c}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(ChessModal);
