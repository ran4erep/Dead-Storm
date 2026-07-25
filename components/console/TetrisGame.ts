import { ConsoleGame, ConsoleGameBounds, ConsoleGameInputDetails } from './types';

const TETRIS_COLS = 10;
const TETRIS_ROWS = 15;

const TETROMINOES = {
    I: [
        [0, 0, 0, 0],
        [1, 1, 1, 1],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
    ],
    O: [
        [1, 1],
        [1, 1]
    ],
    T: [
        [0, 1, 0],
        [1, 1, 1],
        [0, 0, 0]
    ],
    S: [
        [0, 1, 1],
        [1, 1, 0],
        [0, 0, 0]
    ],
    Z: [
        [1, 1, 0],
        [0, 1, 1],
        [0, 0, 0]
    ],
    J: [
        [1, 0, 0],
        [1, 1, 1],
        [0, 0, 0]
    ],
    L: [
        [0, 0, 1],
        [1, 1, 1],
        [0, 0, 0]
    ]
};

type TetrominoKey = keyof typeof TETROMINOES;
const TETROMINO_KEYS: TetrominoKey[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

export class TetrisGame implements ConsoleGame {
    id = 'tetris';
    labelKey = 'tetris_title';

    private board: number[][] = Array(TETRIS_ROWS).fill(null).map(() => Array(TETRIS_COLS).fill(0));
    private currentPiece = { matrix: [] as number[][], x: 0, y: 0 };
    private nextPiece: number[][] | null = null;
    private score = 0;
    private gameOver = true;
    private hasStartedFlag = false;
    private linesClearedTotal = 0;

    private isClearingLines = false;
    private clearingStep = -1;
    private linesBeingCleared: number[] = [];
    private bag: TetrominoKey[] = [];
    private playSound: ((soundId: string) => void) | undefined;
    private onLevelChanged: ((speed: number) => void) | undefined;
    private isUpPressed = false;
    private lastSpawnTime = 0;
    private upKeyUpTimeout: any = null;

    private tetrisDecayGrid: number[][] = Array(TETRIS_ROWS).fill(null).map(() => Array(TETRIS_COLS).fill(0));

    constructor(onLevelChanged?: (speed: number) => void) {
        this.onLevelChanged = onLevelChanged;
    }

    init(playSound: ((soundId: string) => void) | undefined) {
        this.playSound = playSound;
    }

    getScore() {
        return this.score;
    }

    isGameOver() {
        return this.gameOver;
    }

    hasStarted() {
        return this.hasStartedFlag;
    }

    getTickSpeed() {
        const level = Math.floor(this.linesClearedTotal / 10) + 1;
        return Math.max(100, 900 - (level - 1) * 100);
    }

    stop() {
        this.isClearingLines = false;
    }

    reset() {
        this.board = Array(TETRIS_ROWS).fill(null).map(() => Array(TETRIS_COLS).fill(0));
        this.score = 0;
        this.linesClearedTotal = 0;
        this.isClearingLines = false;
        this.clearingStep = -1;
        this.linesBeingCleared = [];
        this.gameOver = false;
        this.hasStartedFlag = true;
        this.isUpPressed = false;
        this.lastSpawnTime = 0;
        if (this.upKeyUpTimeout) {
            clearTimeout(this.upKeyUpTimeout);
            this.upKeyUpTimeout = null;
        }

        for (let r = 0; r < TETRIS_ROWS; r++) {
            this.tetrisDecayGrid[r].fill(0);
        }

        this.bag = [];
        const firstType = this.getNextTetrominoFromBag();
        this.nextPiece = TETROMINOES[firstType];

        this.spawnPiece();

        if (this.playSound) {
            this.playSound('CONSOLE_START');
        }
    }

    tick() {
        if (this.gameOver || this.isClearingLines) return;
        this.tickTetris();
    }

    private tickTetris(isSoftDrop: boolean = false) {
        const nextY = this.currentPiece.y + 1;
        if (!this.checkCollision(this.currentPiece.matrix, { x: this.currentPiece.x, y: nextY })) {
            this.currentPiece.y = nextY;
            if (isSoftDrop) {
                this.score += 1;
            }
        } else {
            this.lockPiece();
        }
    }

    private checkCollision(matrix: number[][], offset: { x: number; y: number }) {
        for (let r = 0; r < matrix.length; r++) {
            for (let c = 0; c < matrix[r].length; c++) {
                if (matrix[r][c]) {
                    const targetX = offset.x + c;
                    const targetY = offset.y + r;
                    if (targetX < 0 || targetX >= TETRIS_COLS || targetY >= TETRIS_ROWS) {
                        return true;
                    }
                    if (targetY >= 0 && this.board[targetY][targetX]) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    private getNextTetrominoFromBag(): TetrominoKey {
        if (this.bag.length === 0) {
            const newBag = [...TETROMINO_KEYS];
            for (let i = newBag.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const temp = newBag[i];
                newBag[i] = newBag[j];
                newBag[j] = temp;
            }
            this.bag = newBag;
        }
        return this.bag.pop()!;
    }

    private spawnPiece() {
        let matrix = this.nextPiece;
        if (!matrix) {
            const initialType = this.getNextTetrominoFromBag();
            matrix = TETROMINOES[initialType];
        }

        this.currentPiece = {
            matrix,
            x: Math.floor((TETRIS_COLS - matrix[0].length) / 2),
            y: -1
        };

        const nextType = this.getNextTetrominoFromBag();
        this.nextPiece = TETROMINOES[nextType];

        this.lastSpawnTime = Date.now();

        if (this.checkCollision(matrix, { x: this.currentPiece.x, y: -1 })) {
            this.gameOver = true;
        }
    }

    private rotateMatrix(matrix: number[][]) {
        const n = matrix.length;
        const rotated = Array(n).fill(null).map(() => Array(n).fill(0));
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                rotated[c][n - 1 - r] = matrix[r][c];
            }
        }
        return rotated;
    }

    private rotatePiece() {
        if (this.isClearingLines) return;
        const rotated = this.rotateMatrix(this.currentPiece.matrix);
        let x = this.currentPiece.x;
        if (this.checkCollision(rotated, { x, y: this.currentPiece.y })) {
            // Wall kicks
            if (!this.checkCollision(rotated, { x: x - 1, y: this.currentPiece.y })) {
                x -= 1;
            } else if (!this.checkCollision(rotated, { x: x + 1, y: this.currentPiece.y })) {
                x += 1;
            } else if (!this.checkCollision(rotated, { x: x - 2, y: this.currentPiece.y })) {
                x -= 2;
            } else if (!this.checkCollision(rotated, { x: x + 2, y: this.currentPiece.y })) {
                x += 2;
            } else {
                return; // Can't rotate
            }
        }
        this.currentPiece.matrix = rotated;
        this.currentPiece.x = x;
    }

    private movePiece(dirX: number) {
        if (this.isClearingLines) return;
        const nextX = this.currentPiece.x + dirX;
        if (!this.checkCollision(this.currentPiece.matrix, { x: nextX, y: this.currentPiece.y })) {
            this.currentPiece.x = nextX;
        }
    }

    private hardDrop() {
        if (this.gameOver || this.isClearingLines) return;
        const startY = this.currentPiece.y;
        let nextY = startY;
        while (!this.checkCollision(this.currentPiece.matrix, { x: this.currentPiece.x, y: nextY + 1 })) {
            nextY++;
        }
        const dropDistance = nextY - startY;
        this.currentPiece.y = nextY;
        
        if (dropDistance > 0) {
            this.score += dropDistance * 2;
        }

        this.lockPiece();
    }

    private lockPiece() {
        const { matrix, x, y } = this.currentPiece;
        for (let r = 0; r < matrix.length; r++) {
            for (let c = 0; c < matrix[r].length; c++) {
                if (matrix[r][c]) {
                    const targetY = y + r;
                    const targetX = x + c;
                    if (targetY >= 0 && targetY < TETRIS_ROWS && targetX >= 0 && targetX < TETRIS_COLS) {
                        this.board[targetY][targetX] = 1;
                    }
                }
            }
        }

        // Find filled lines
        const filledLines: number[] = [];
        for (let r = 0; r < TETRIS_ROWS; r++) {
            if (this.board[r].every(val => val === 1)) {
                filledLines.push(r);
            }
        }

        if (filledLines.length > 0) {
            this.isClearingLines = true;
            this.linesBeingCleared = filledLines;
            this.clearingStep = 0;

            const runClearingStep = () => {
                if (this.gameOver) return;
                const step = this.clearingStep;
                if (step >= 0 && step < 5) {
                    const col1 = 4 - step;
                    const col2 = 5 + step;

                    filledLines.forEach(r => {
                        this.board[r][col1] = 0;
                        this.board[r][col2] = 0;
                    });

                    this.clearingStep += 1;
                    setTimeout(runClearingStep, 80);
                } else {
                    // Animation complete: remove cleared lines and shift down
                    const cleanBoard = this.board.filter((_, idx) => !filledLines.includes(idx));
                    while (cleanBoard.length < TETRIS_ROWS) {
                        cleanBoard.unshift(Array(TETRIS_COLS).fill(0));
                    }
                    this.board = cleanBoard;

                    const linesCleared = filledLines.length;
                    const oldLevel = Math.floor(this.linesClearedTotal / 10) + 1;
                    this.linesClearedTotal += linesCleared;
                    const newLevel = Math.floor(this.linesClearedTotal / 10) + 1;

                    let linePoints = 0;
                    if (linesCleared === 1) linePoints = 100 * oldLevel;
                    else if (linesCleared === 2) linePoints = 300 * oldLevel;
                    else if (linesCleared === 3) linePoints = 500 * oldLevel;
                    else if (linesCleared >= 4) linePoints = 800 * oldLevel;

                    this.score += linePoints;
                    if (this.playSound) {
                        this.playSound('CONSOLE_FOOD');
                    }
                    if (this.score >= 5000) {
                        window.dispatchEvent(new CustomEvent('achievement-update', { detail: { action: 'unlock', statKey: 'tetris_master' } }));
                    }

                    this.isClearingLines = false;
                    this.clearingStep = -1;
                    this.linesBeingCleared = [];

                    this.spawnPiece();

                    if (this.onLevelChanged) {
                        this.onLevelChanged(this.getTickSpeed());
                    }
                }
            };

            runClearingStep();
        } else {
            if (this.score >= 5000) {
                window.dispatchEvent(new CustomEvent('achievement-update', { detail: { action: 'unlock', statKey: 'tetris_master' } }));
            }
            this.spawnPiece();
        }
    }

    draw(
        screenCtx: CanvasRenderingContext2D,
        bounds: ConsoleGameBounds,
        localAnimFrame: number,
        settings: any,
        strings: any
    ) {
        const { screenMaskX, screenMaskY, screenMaskW, screenMaskH } = bounds;

        const gameSize = Math.min(screenMaskH - 2, (screenMaskW * 0.75) - 2);
        const cellSize = gameSize / TETRIS_ROWS;
        const gameWidth = cellSize * TETRIS_COLS;
        const gameHeight = gameSize;

        const offsetX = screenMaskX + (screenMaskW * 0.75 - gameWidth) / 2;
        const offsetY = screenMaskY + (screenMaskH - gameHeight) / 2;

        screenCtx.strokeStyle = 'rgba(15, 56, 15, 0.3)';
        screenCtx.lineWidth = 1;
        screenCtx.strokeRect(offsetX - 0.5, offsetY - 0.5, gameWidth + 1.0, gameHeight + 1.0);

        const scoreAreaX = offsetX + gameWidth;
        let scoreAreaW = screenMaskW - (offsetX - screenMaskX) - gameWidth;
        if (scoreAreaW < 10) {
            scoreAreaW = Math.max(10, screenMaskW * 0.25);
        }

        screenCtx.fillStyle = '#306230';
        screenCtx.textAlign = 'center';
        screenCtx.textBaseline = 'top';

        const scoreStr = `${this.score}`;
        const targetChars = Math.max(3, scoreStr.length);
        const charRatio = 0.6;
        
        let scoreFontSize = Math.floor(scoreAreaW / (targetChars * charRatio));
        scoreFontSize = Math.min(scoreFontSize, Math.max(5, Math.floor(screenMaskH * 0.15)));

        screenCtx.font = `bold ${scoreFontSize}px monospace`;
        screenCtx.fillText(scoreStr, scoreAreaX + scoreAreaW / 2, screenMaskY + screenMaskH * 0.1);

        const nextPiece = this.nextPiece;
        if (nextPiece && !this.gameOver) {
            screenCtx.fillStyle = '#306230';
            const previewCellSize = cellSize * 1.1;
            const nextR = nextPiece.length;
            const nextC = nextPiece[0]?.length || 0;
            
            const previewW = nextC * previewCellSize;
            const previewH = nextR * previewCellSize;
            
            const previewX = scoreAreaX + (scoreAreaW - previewW) / 2;
            const previewY = screenMaskY + screenMaskH * 0.45;
            
            const previewGap = previewCellSize * 0.1;
            
            for (let r = 0; r < nextR; r++) {
                for (let c = 0; c < nextC; c++) {
                    if (nextPiece[r][c]) {
                        const px = previewX + c * previewCellSize + previewGap / 2;
                        const py = previewY + r * previewCellSize + previewGap / 2;
                        const pw = previewCellSize - previewGap;
                        const ph = previewCellSize - previewGap;
                        screenCtx.fillRect(px, py, pw, ph);
                    }
                }
            }

            const levelVal = Math.floor(this.linesClearedTotal / 10) + 1;
            screenCtx.fillStyle = '#306230';
            screenCtx.textAlign = 'center';
            screenCtx.textBaseline = 'top';
            screenCtx.font = `bold ${Math.floor(scoreFontSize * 0.95)}px monospace`;
            screenCtx.fillText(`${levelVal}`, scoreAreaX + scoreAreaW / 2, previewY + previewH + screenMaskH * 0.08);
        }

        const cellGap = cellSize * 0.1;
        const getTetrisCellBounds = (cx: number, cy: number) => {
            return {
                x: offsetX + cx * cellSize + cellGap / 2,
                y: offsetY + cy * cellSize + cellGap / 2,
                w: cellSize - cellGap,
                h: cellSize - cellGap
            };
        };

        // Draw background LCD pixels
        screenCtx.fillStyle = 'rgba(15, 56, 15, 0.07)';
        for (let r = 0; r < TETRIS_ROWS; r++) {
            for (let c = 0; c < TETRIS_COLS; c++) {
                const b = getTetrisCellBounds(c, r);
                screenCtx.fillRect(b.x, b.y, b.w, b.h);
            }
        }

        // Active Piece currently on
        const activeCurrentlyOn = Array(TETRIS_ROWS).fill(null).map(() => Array(TETRIS_COLS).fill(false));
        if (!this.gameOver && !this.isClearingLines) {
            const { matrix, x, y } = this.currentPiece;
            for (let r = 0; r < matrix.length; r++) {
                for (let c = 0; c < matrix[r].length; c++) {
                    if (matrix[r][c]) {
                        const targetY = y + r;
                        const targetX = x + c;
                        if (targetY >= 0 && targetY < TETRIS_ROWS && targetX >= 0 && targetX < TETRIS_COLS) {
                            activeCurrentlyOn[targetY][targetX] = true;
                        }
                    }
                }
            }
        }

        const isGhosting = settings?.lcdGhosting !== false;
        const tetrisDecayRate = isGhosting ? 0.07 : 1.0;

        for (let r = 0; r < TETRIS_ROWS; r++) {
            for (let c = 0; c < TETRIS_COLS; c++) {
                const isOn = this.board[r][c] || activeCurrentlyOn[r][c];
                if (isOn) {
                    this.tetrisDecayGrid[r][c] = 1.0;
                } else {
                    this.tetrisDecayGrid[r][c] = Math.max(0, this.tetrisDecayGrid[r][c] - tetrisDecayRate);
                }
            }
        }

        // Render board pixels and active falling pieces
        for (let r = 0; r < TETRIS_ROWS; r++) {
            for (let c = 0; c < TETRIS_COLS; c++) {
                const intensity = this.tetrisDecayGrid[r][c];
                if (intensity > 0) {
                    const opacity = intensity === 1.0 ? 1.0 : Math.pow(intensity, 1.4) * 0.75;
                    screenCtx.fillStyle = `rgba(15, 56, 15, ${opacity})`;
                    const b = getTetrisCellBounds(c, r);
                    screenCtx.fillRect(b.x, b.y, b.w, b.h);
                }
            }
        }

        if (this.gameOver) {
            screenCtx.textAlign = 'center';
            screenCtx.textBaseline = 'middle';
            screenCtx.fillStyle = '#306230';

            if (!this.hasStartedFlag) {
                const titleText = strings?.ui?.console?.tetris_title || "TETRIS";
                const fontSizeTitle = Math.max(5, Math.min(10, Math.floor((gameWidth - 4) / (titleText.length * 0.6))));
                
                const textSub = strings?.ui?.console?.press_start || "PRESS START";
                const fontSizeSub = Math.max(4, Math.min(6, Math.floor((gameWidth - 4) / (textSub.length * 0.6))));

                const centerY = offsetY + gameHeight / 2 - 4;
                screenCtx.font = `bold ${fontSizeTitle}px monospace`;
                const totalWidth = screenCtx.measureText(titleText).width;
                const textStartX = offsetX + (gameWidth - totalWidth) / 2;
                
                let currentX = textStartX;
                for (let i = 0; i < titleText.length; i++) {
                     const char = titleText[i];
                     const charWidth = screenCtx.measureText(char).width;
                     const bounceY = Math.sin((localAnimFrame * 0.15) - (i * 0.4)) * 2;
                     screenCtx.fillText(char, currentX + charWidth / 2, centerY + bounceY);
                     currentX += charWidth;
                }

                if (Math.floor(localAnimFrame / 15) % 2 === 0) {
                    screenCtx.font = `${fontSizeSub}px monospace`;
                    screenCtx.textAlign = 'left';
                    screenCtx.fillText(textSub, offsetX + 1, offsetY + gameHeight / 2 + 8);
                    screenCtx.textAlign = 'center';
                }
            } else {
                const textTitle = strings?.ui?.console?.game_over || "GAME OVER";
                const fontSizeTitle = Math.max(5, Math.min(10, Math.floor((gameWidth - 4) / (textTitle.length * 0.6))));
                
                const textSub = strings?.ui?.console?.press_start || "PRESS START";
                const fontSizeSub = Math.max(4, Math.min(6, Math.floor((gameWidth - 4) / (textSub.length * 0.6))));

                screenCtx.font = `bold ${fontSizeTitle}px monospace`;
                const vibrationY = Math.sin(localAnimFrame * 0.25) * 1.0;
                screenCtx.fillText(textTitle, offsetX + gameWidth / 2, offsetY + gameHeight / 2 - 4 + vibrationY, gameWidth - 6);
                
                if (Math.floor(localAnimFrame / 15) % 2 === 0) {
                    screenCtx.font = `${fontSizeSub}px monospace`;
                    screenCtx.textAlign = 'left';
                    screenCtx.fillText(textSub, offsetX + 1, offsetY + gameHeight / 2 + 8, gameWidth - 2);
                    screenCtx.textAlign = 'center';
                }
            }
        }
    }

    handleKeyDown(details: ConsoleGameInputDetails) {
        if (this.gameOver || this.isClearingLines) return;

        if (details.isLeft) {
            this.movePiece(-1);
        } else if (details.isRight) {
            this.movePiece(1);
        } else if (details.isDown) {
            this.tickTetris(true);
        } else if (details.isAction) {
            this.rotatePiece();
        } else if (details.isUp) {
            if (this.upKeyUpTimeout) {
                clearTimeout(this.upKeyUpTimeout);
                this.upKeyUpTimeout = null;
            }
            if (details.repeat) return;
            if (!this.isUpPressed) {
                this.isUpPressed = true;
                if (Date.now() - this.lastSpawnTime >= 180) {
                    this.hardDrop();
                }
            }
        }
    }

    handleKeyUp(details: { isUp: boolean; isDown: boolean; isLeft: boolean; isRight: boolean; isAction: boolean }) {
        if (details && details.isUp) {
            if (this.upKeyUpTimeout) {
                clearTimeout(this.upKeyUpTimeout);
            }
            this.upKeyUpTimeout = setTimeout(() => {
                this.isUpPressed = false;
                this.upKeyUpTimeout = null;
            }, 80);
        }
    }

    handleSwipe(dir: 'LEFT' | 'RIGHT' | 'UP' | 'DOWN') {
        if (this.gameOver || this.isClearingLines) return;

        if (dir === 'LEFT') {
            this.movePiece(-1);
        } else if (dir === 'RIGHT') {
            this.movePiece(1);
        } else if (dir === 'DOWN') {
            this.tickTetris(true);
        } else if (dir === 'UP') {
            if (Date.now() - this.lastSpawnTime >= 180) {
                this.hardDrop();
            }
        }
    }

    handleTap() {
        if (this.gameOver || this.isClearingLines) return;
        this.rotatePiece();
    }
}
