import { ConsoleGame, ConsoleGameBounds, ConsoleGameInputDetails } from './types';

const GRID_SIZE = 15;

export class PongGame implements ConsoleGame {
    id = 'pong';
    labelKey = 'pong_title';

    private playerY = 6;
    private cpuY = 6;
    private ballX = 7.5;
    private ballY = 7.5;
    private ballVx = 0.2;
    private ballVy = 0.1;
    private scorePlayer = 0;
    private scoreCpu = 0;
    private gameOver = true;
    private hasStartedFlag = false;

    private playSound: ((soundId: string) => void) | undefined;
    private pongDecayGrid: number[][] = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(0));

    init(playSound: ((soundId: string) => void) | undefined) {
        this.playSound = playSound;
    }

    getScore() {
        return this.scorePlayer;
    }

    isGameOver() {
        return this.gameOver;
    }

    hasStarted() {
        return this.hasStartedFlag;
    }

    getTickSpeed() {
        return 40; // 40ms interval for fluid logic updates
    }

    stop() {
        // No asynchronous cleanup required
    }

    private resetBall(direction: number) {
        this.ballX = 7.5;
        this.ballY = 7.5;
        this.ballVx = direction * 0.22;
        this.ballVy = (Math.random() - 0.5) * 0.16;
    }

    reset() {
        this.scorePlayer = 0;
        this.scoreCpu = 0;
        this.playerY = 6;
        this.cpuY = 6;
        this.resetBall(Math.random() > 0.5 ? 1 : -1);
        this.gameOver = false;
        this.hasStartedFlag = true;

        for (let r = 0; r < GRID_SIZE; r++) {
            this.pongDecayGrid[r].fill(0);
        }

        if (this.playSound) {
            this.playSound('CONSOLE_START');
        }
    }

    private movePaddle(dir: number) {
        const nextY = this.playerY + dir;
        if (nextY >= 0 && nextY <= GRID_SIZE - 4) {
            this.playerY = nextY;
        }
    }

    tick() {
        if (this.gameOver) return;

        // Ball movement
        let nextX = this.ballX + this.ballVx;
        let nextY = this.ballY + this.ballVy;

        let vx = this.ballVx;
        let vy = this.ballVy;

        // Ceiling/Floor bounce
        if (nextY <= 0) {
            nextY = 0;
            vy = -vy;
            if (this.playSound) this.playSound('CONSOLE_FOOD');
        } else if (nextY >= GRID_SIZE - 1) {
            nextY = GRID_SIZE - 1;
            vy = -vy;
            if (this.playSound) this.playSound('CONSOLE_FOOD');
        }

        // Left paddle (Player, X = 1) collision (Height = 4)
        if (vx < 0 && nextX <= 1) {
            const paddleY = this.playerY;
            if (nextY >= paddleY - 0.5 && nextY <= paddleY + 3.5) {
                nextX = 1;
                const hitCenter = paddleY + 1.5;
                const hitOffset = nextY - hitCenter;

                const speedMultiplier = 1.05;
                const currentSpeed = Math.sqrt(vx * vx + vy * vy);
                const nextSpeed = Math.min(0.55, currentSpeed * speedMultiplier);

                vx = Math.abs(vx);
                vy = hitOffset * 0.14;

                const norm = Math.sqrt(vx * vx + vy * vy);
                if (norm > 0) {
                    vx = (vx / norm) * nextSpeed;
                    vy = (vy / norm) * nextSpeed;
                }

                if (this.playSound) this.playSound('CONSOLE_FOOD');
            }
        }

        // Right paddle (CPU, X = GRID_SIZE - 2) collision
        if (vx > 0 && nextX >= GRID_SIZE - 2) {
            const paddleY = this.cpuY;
            if (nextY >= paddleY - 0.5 && nextY <= paddleY + 3.5) {
                nextX = GRID_SIZE - 2;
                const hitCenter = paddleY + 1.5;
                const hitOffset = nextY - hitCenter;

                const speedMultiplier = 1.05;
                const currentSpeed = Math.sqrt(vx * vx + vy * vy);
                const nextSpeed = Math.min(0.55, currentSpeed * speedMultiplier);

                vx = -Math.abs(vx);
                vy = hitOffset * 0.14;

                const norm = Math.sqrt(vx * vx + vy * vy);
                if (norm > 0) {
                    vx = (vx / norm) * nextSpeed;
                    vy = (vy / norm) * nextSpeed;
                }

                if (this.playSound) this.playSound('CONSOLE_FOOD');
            }
        }

        // Out of bounds: scoring
        if (nextX < 0) {
            this.scoreCpu += 1;

            if (this.scoreCpu >= 10) {
                this.gameOver = true;
            } else {
                this.resetBall(1);
            }
            return;
        }

        if (nextX > GRID_SIZE - 1) {
            this.scorePlayer += 1;
            if (this.playSound) this.playSound('CONSOLE_START');

            if (this.scorePlayer >= 10) {
                this.gameOver = true;
                window.dispatchEvent(new CustomEvent('achievement-update', { 
                    detail: { action: 'unlock', statKey: 'pong_master' } 
                }));
            } else {
                this.resetBall(-1);
            }
            return;
        }

        this.ballX = nextX;
        this.ballY = nextY;
        this.ballVx = vx;
        this.ballVy = vy;

        // CPU AI tracking
        const cpuY = this.cpuY;
        const cpuCenter = cpuY + 1.5;
        const diff = nextY - cpuCenter;

        const shouldCpuMove = vx > 0 && nextX > GRID_SIZE * 0.35;
        if (shouldCpuMove && Math.abs(diff) > 0.2) {
            const ballSpeed = Math.sqrt(vx * vx + vy * vy);
            const cpuSpeedLimit = Math.min(0.24, 0.08 + ballSpeed * 0.28);
            const moveStep = Math.sign(diff) * Math.min(cpuSpeedLimit, Math.abs(diff));
            this.cpuY = Math.max(0, Math.min(GRID_SIZE - 4, cpuY + moveStep));
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

        const gameSize = Math.min(screenMaskH, screenMaskW * 0.75);
        const cellSize = gameSize / GRID_SIZE;
        const gameWidth = gameSize;
        const gameHeight = gameSize;
        
        const offsetX = screenMaskX;
        const offsetY = screenMaskY + (screenMaskH - gameHeight) / 2;

        screenCtx.strokeStyle = 'rgba(15, 56, 15, 0.3)';
        screenCtx.lineWidth = 1;
        screenCtx.strokeRect(offsetX, offsetY, gameWidth, gameHeight);

        // Scores
        const scoreAreaX = offsetX + gameWidth;
        let scoreAreaW = screenMaskW - gameWidth;
        if (scoreAreaW < 10) {
             scoreAreaW = Math.max(10, screenMaskW * 0.2);
        }

        screenCtx.fillStyle = '#306230';
        screenCtx.textAlign = 'center';
        screenCtx.textBaseline = 'top';

        const scoreStr = `${this.scorePlayer}:${this.scoreCpu}`;
        const targetChars = Math.max(3, scoreStr.length);
        const charRatio = 0.6;
        
        let scoreFontSize = Math.floor(scoreAreaW / (targetChars * charRatio));
        scoreFontSize = Math.min(scoreFontSize, Math.max(5, Math.floor(screenMaskH * 0.15)));

        screenCtx.font = `bold ${scoreFontSize}px monospace`;
        screenCtx.fillText(scoreStr, scoreAreaX + scoreAreaW / 2, screenMaskY + (screenMaskH * 0.1));

        const cellGap = cellSize * 0.1;
        const getCellBounds = (cx: number, cy: number) => {
            return {
                x: offsetX + cx * cellSize + cellGap / 2,
                y: offsetY + cy * cellSize + cellGap / 2,
                w: cellSize - cellGap,
                h: cellSize - cellGap
            };
        };

        // Draw background grid
        screenCtx.fillStyle = 'rgba(15, 56, 15, 0.07)';
        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                const b = getCellBounds(x, y);
                screenCtx.fillRect(b.x, b.y, b.w, b.h);
            }
        }

        // Active items
        const currentlyOn = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(false));

        if (!this.gameOver) {
            // Player Paddle
            const pyRounded = Math.round(this.playerY);
            for (let i = 0; i < 4; i++) {
                const ry = pyRounded + i;
                if (ry >= 0 && ry < GRID_SIZE) {
                    currentlyOn[ry][1] = true;
                }
            }

            // CPU Paddle
            const cyRounded = Math.round(this.cpuY);
            for (let i = 0; i < 4; i++) {
                const ry = cyRounded + i;
                if (ry >= 0 && ry < GRID_SIZE) {
                    currentlyOn[ry][GRID_SIZE - 2] = true;
                }
            }

            // Ball
            const bx = Math.round(this.ballX);
            const by = Math.round(this.ballY);
            if (bx >= 0 && bx < GRID_SIZE && by >= 0 && by < GRID_SIZE) {
                currentlyOn[by][bx] = true;
            }
        }

        const isGhosting = settings?.lcdGhosting !== false;
        const pongDecayRate = isGhosting ? 0.09 : 1.0;

        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                if (currentlyOn[y][x]) {
                    this.pongDecayGrid[y][x] = 1.0;
                } else {
                    this.pongDecayGrid[y][x] = Math.max(0, this.pongDecayGrid[y][x] - pongDecayRate);
                }
            }
        }

        // Render pixels
        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                const intensity = this.pongDecayGrid[y][x];
                if (intensity > 0) {
                    const opacity = intensity === 1.0 ? 1.0 : Math.pow(intensity, 1.4) * 0.75;
                    screenCtx.fillStyle = `rgba(15, 56, 15, ${opacity})`;
                    const b = getCellBounds(x, y);
                    screenCtx.fillRect(b.x, b.y, b.w, b.h);
                }
            }
        }

        if (this.gameOver) {
            screenCtx.textAlign = 'center';
            screenCtx.textBaseline = 'middle';
            screenCtx.fillStyle = '#306230';

            if (!this.hasStartedFlag) {
                const titleText = strings?.ui?.console?.pong_title || "PONG";
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
        if (this.gameOver) return;

        if (details.isUp) {
            this.movePaddle(-1);
        } else if (details.isDown) {
            this.movePaddle(1);
        }
    }

    handleKeyUp() {}

    handleContinuousInput(pressed: 'LEFT' | 'RIGHT' | 'UP' | 'DOWN' | null) {
        if (this.gameOver) return;
        if (pressed === 'UP') {
            this.movePaddle(-0.4);
        } else if (pressed === 'DOWN') {
            this.movePaddle(0.4);
        }
    }

    handleSwipe(dir: 'LEFT' | 'RIGHT' | 'UP' | 'DOWN') {
        if (this.gameOver) return;
        if (dir === 'UP') {
            this.movePaddle(-1);
        } else if (dir === 'DOWN') {
            this.movePaddle(1);
        }
    }
}
export default PongGame;
