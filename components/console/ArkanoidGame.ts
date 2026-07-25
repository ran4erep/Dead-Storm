import { ConsoleGame, ConsoleGameBounds, ConsoleGameInputDetails } from './types';

const GRID_SIZE = 15;

export class ArkanoidGame implements ConsoleGame {
    id = 'arkanoid';
    labelKey = 'arkanoid_title';

    private paddleX = 6;
    private balls: { x: number, y: number, vx: number, vy: number }[] = [];
    private bricks: number[][] = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(0));
    private level = 1;
    private powerUps: { x: number, y: number }[] = [];
    private ballOnPaddle = true;
    private score = 0;
    private gameOver = true;
    private hasStartedFlag = false;

    private playSound: ((soundId: string) => void) | undefined;
    private arkanoidDecayGrid: number[][] = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(0));

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
        return 40; // Tighter loop interval for highly responsive action
    }

    stop() {
        this.balls = [];
    }

    private generateBricks(level: number): number[][] {
        const bricks = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(0));
        
        const isSymmetric = Math.random() < 0.55;
        const density = 0.38 + Math.min(0.35, (level % 5) * 0.04) + Math.random() * 0.3;
        const startY = 1;
        const endY = 4 + Math.floor(Math.random() * 4);
        
        const f1 = 0.5 + Math.random() * 1.5;
        const f2 = 0.3 + Math.random() * 1.2;
        const offset = Math.random() * Math.PI * 2;

        for (let y = startY; y <= endY; y++) {
            const limit = isSymmetric ? Math.ceil(GRID_SIZE / 2) : GRID_SIZE;
            for (let x = 0; x < limit; x++) {
                const trigNoise = Math.sin(x * f1 + offset) * Math.cos(y * f2) * 0.35;
                const cellRandom = Math.random() * 0.3 - 0.15;
                const finalChance = density + trigNoise + cellRandom;

                if (Math.random() < finalChance) {
                    bricks[y][x] = 1;
                    if (isSymmetric) {
                        bricks[y][GRID_SIZE - 1 - x] = 1;
                    }
                }
            }
        }

        const numHoles = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < numHoles; i++) {
            const hx = Math.floor(Math.random() * GRID_SIZE);
            const hy = startY + Math.floor(Math.random() * (endY - startY + 1));
            const radius = Math.random() < 0.7 ? 1 : 2;
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    const ny = hy + dy;
                    const nx = hx + dx;
                    if (ny >= startY && ny <= endY && nx >= 0 && nx < GRID_SIZE) {
                        bricks[ny][nx] = 0;
                    }
                }
            }
        }

        let count = 0;
        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                if (bricks[y][x]) count++;
            }
        }

        if (count > 48) {
            const toRemove = count - 48;
            let removed = 0;
            while (removed < toRemove) {
                const rx = Math.floor(Math.random() * GRID_SIZE);
                const ry = startY + Math.floor(Math.random() * (endY - startY + 1));
                if (bricks[ry][rx] === 1) {
                    bricks[ry][rx] = 0;
                    removed++;
                }
            }
        } else if (count < 15) {
            const toAdd = 15 - count;
            let added = 0;
            while (added < toAdd) {
                const rx = Math.floor(Math.random() * GRID_SIZE);
                const ry = startY + Math.floor(Math.random() * (endY - startY + 1));
                if (bricks[ry][rx] === 0) {
                    bricks[ry][rx] = 1;
                    added++;
                }
            }
        }

        return bricks;
    }

    reset() {
        this.level = 1;
        this.paddleX = 5;
        this.powerUps = [];
        this.score = 0;
        this.bricks = this.generateBricks(1);
        this.balls = [{ x: 6.5, y: 13, vx: 0.10, vy: -0.32 }];
        this.ballOnPaddle = true;
        this.gameOver = false;
        this.hasStartedFlag = true;

        for (let r = 0; r < GRID_SIZE; r++) {
            this.arkanoidDecayGrid[r].fill(0);
        }

        if (this.playSound) {
            this.playSound('CONSOLE_START');
        }
    }

    private movePaddle(dir: number) {
        const nextX = this.paddleX + dir;
        if (nextX >= 0 && nextX <= 11) {
            this.paddleX = nextX;
        }
    }

    private launchBall() {
        if (this.ballOnPaddle) {
            this.ballOnPaddle = false;
            if (this.playSound) {
                this.playSound('CONSOLE_START');
            }
        }
    }

    tick() {
        if (this.gameOver) return;

        let bricksLeft = 0;
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                if (this.bricks[r][c] === 1) bricksLeft++;
            }
        }

        if (bricksLeft === 0) {
            this.level += 1;
            this.bricks = this.generateBricks(this.level);
            this.paddleX = 5;
            this.balls = [{ x: 6.5, y: 13, vx: 0.12 + (Math.random() - 0.5) * 0.05, vy: -0.32 - Math.min(0.08, this.level * 0.015) }];
            this.ballOnPaddle = true;
            this.powerUps = [];
            if (this.playSound) {
                this.playSound('CONSOLE_START');
            }
            return;
        }

        if (this.ballOnPaddle) {
            if (this.balls.length > 0) {
                this.balls[0].x = this.paddleX + 1.5;
                this.balls[0].y = 13;
            }
            const nextPowerUps: { x: number, y: number }[] = [];
            this.powerUps.forEach(pu => {
                const nextY = pu.y + 0.26;
                if (nextY < GRID_SIZE) {
                    nextPowerUps.push({ x: pu.x, y: nextY });
                }
            });
            this.powerUps = nextPowerUps;
            return;
        }

        // Move powerups
        const nextPowerUps: { x: number, y: number }[] = [];
        this.powerUps.forEach(pu => {
            const nextY = pu.y + 0.26;
            const pux = Math.round(pu.x);
            const puy = Math.round(nextY);

            if (puy === 14) {
                if (pux >= this.paddleX && pux <= this.paddleX + 3) {
                    const expandedBalls: typeof this.balls = [];
                    this.balls.forEach(ball => {
                        const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) || 0.34;
                        const signY = ball.vy < 0 ? -1 : 1;

                        let vx1 = ball.vx - 0.12 - Math.random() * 0.08;
                        if (vx1 > 0.28) vx1 = 0.28;
                        if (vx1 < -0.28) vx1 = -0.28;
                        const vy1 = signY * Math.sqrt(Math.max(0.01, speed * speed - vx1 * vx1));

                        let vx2 = ball.vx + (Math.random() - 0.5) * 0.06;
                        if (vx2 > 0.28) vx2 = 0.28;
                        if (vx2 < -0.28) vx2 = -0.28;
                        const vy2 = signY * Math.sqrt(Math.max(0.01, speed * speed - vx2 * vx2));

                        let vx3 = ball.vx + 0.12 + Math.random() * 0.08;
                        if (vx3 > 0.28) vx3 = 0.28;
                        if (vx3 < -0.28) vx3 = -0.28;
                        const vy3 = signY * Math.sqrt(Math.max(0.01, speed * speed - vx3 * vx3));

                        expandedBalls.push(
                            { x: ball.x, y: ball.y, vx: vx1, vy: vy1 },
                            { x: ball.x, y: ball.y, vx: vx2, vy: vy2 },
                            { x: ball.x, y: ball.y, vx: vx3, vy: vy3 }
                        );
                    });
                    this.balls = expandedBalls;
                    this.score += 50;
                    if (this.playSound) {
                        this.playSound('CONSOLE_FOOD');
                    }
                    return;
                }
            }
            if (nextY < GRID_SIZE) {
                nextPowerUps.push({ x: pu.x, y: nextY });
            }
        });
        this.powerUps = nextPowerUps;

        // Move and collide balls
        const nextBalls: typeof this.balls = [];

        this.balls.forEach(ball => {
            let nextX = ball.x + ball.vx;
            let nextY = ball.y + ball.vy;

            let vx = ball.vx;
            let vy = ball.vy;

            if (nextX <= 0) {
                nextX = 0;
                vx = -vx;
                if (this.playSound) this.playSound('CONSOLE_FOOD');
            } else if (nextX >= GRID_SIZE - 1) {
                nextX = GRID_SIZE - 1;
                vx = -vx;
                if (this.playSound) this.playSound('CONSOLE_FOOD');
            }

            if (nextY <= 0) {
                nextY = 0;
                vy = -vy;
                if (this.playSound) this.playSound('CONSOLE_FOOD');
            }

            if (vy > 0 && Math.round(nextY) === 14) {
                const bx = Math.round(nextX);
                if (bx >= this.paddleX && bx <= this.paddleX + 3) {
                    nextY = 13;
                    vy = -Math.abs(vy);

                    const paddleCenter = this.paddleX + 1.5;
                    const hitOffset = nextX - paddleCenter;
                    vx = hitOffset * 0.16;

                    const speed = 0.38;
                    if (vx > 0.28) vx = 0.28;
                    if (vx < -0.28) vx = -0.28;
                    vy = -Math.sqrt(Math.max(0.01, speed * speed - vx * vx));

                    if (this.playSound) this.playSound('CONSOLE_FOOD');
                    nextBalls.push({ x: nextX, y: nextY, vx, vy });
                    return;
                }
            }

            if (nextY >= GRID_SIZE) {
                return;
            }

            const cellX = Math.round(nextX);
            const cellY = Math.round(nextY);

            if (cellY >= 0 && cellY < GRID_SIZE && cellX >= 0 && cellX < GRID_SIZE && this.bricks[cellY][cellX] === 1) {
                this.bricks[cellY][cellX] = 0;
                this.score += 10;

                const prevCellX = Math.round(ball.x);
                const prevCellY = Math.round(ball.y);

                if (prevCellX !== cellX) vx = -vx;
                if (prevCellY !== cellY) vy = -vy;

                if (this.playSound) this.playSound('CONSOLE_FOOD');

                if (Math.random() < 0.10 && this.powerUps.length < 2) {
                    this.powerUps.push({ x: cellX, y: cellY });
                }

                nextBalls.push({ x: nextX, y: nextY, vx, vy });
                return;
            }

            nextBalls.push({ x: nextX, y: nextY, vx, vy });
        });

        this.balls = nextBalls;

        if (nextBalls.length === 0) {
            this.gameOver = true;
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

        const scoreAreaX = offsetX + gameWidth;
        let scoreAreaW = screenMaskW - gameWidth;
        if (scoreAreaW < 10) {
             scoreAreaW = Math.max(10, screenMaskW * 0.2);
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
        screenCtx.fillText(scoreStr, scoreAreaX + scoreAreaW / 2, screenMaskY + (screenMaskH * 0.05));

        // Draw active level below score in score area
        screenCtx.fillText(`L${this.level}`, scoreAreaX + scoreAreaW / 2, screenMaskY + screenMaskH * 0.45);

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

        // What elements are currently on
        const currentlyOn = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(false));
        
        // Bricks
        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                if (this.bricks[y][x]) {
                    currentlyOn[y][x] = true;
                }
            }
        }

        // Paddle
        if (!this.gameOver) {
            for (let i = 0; i < 4; i++) {
                const px = this.paddleX + i;
                if (px >= 0 && px < GRID_SIZE) {
                    currentlyOn[14][px] = true;
                }
            }
        }

        // Balls
        if (!this.gameOver) {
            this.balls.forEach(ball => {
                const bx = Math.round(ball.x);
                const by = Math.round(ball.y);
                if (bx >= 0 && bx < GRID_SIZE && by >= 0 && by < GRID_SIZE) {
                    currentlyOn[by][bx] = true;
                }
            });
        }

        // PowerUps
        if (!this.gameOver) {
            this.powerUps.forEach(pu => {
                const px = Math.round(pu.x);
                const py = Math.round(pu.y);
                if (px >= 0 && px < GRID_SIZE && py >= 0 && py < GRID_SIZE) {
                    currentlyOn[py][px] = true;
                }
            });
        }

        const isGhosting = settings?.lcdGhosting !== false;
        const arkanoidDecayRate = isGhosting ? 0.08 : 1.0;

        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                if (currentlyOn[y][x]) {
                    this.arkanoidDecayGrid[y][x] = 1.0;
                } else {
                    this.arkanoidDecayGrid[y][x] = Math.max(0, this.arkanoidDecayGrid[y][x] - arkanoidDecayRate);
                }
            }
        }

        // Render all pixels using the decay grid
        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                const intensity = this.arkanoidDecayGrid[y][x];
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
                const titleText = strings?.ui?.console?.arkanoid_title || "ARKANOID";
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

        if (details.isLeft) {
            this.movePaddle(-1);
        } else if (details.isRight) {
            this.movePaddle(1);
        } else if (details.isUp || details.isAction) {
            this.launchBall();
        }
    }

    handleKeyUp() {}

    handleContinuousInput(pressed: 'LEFT' | 'RIGHT' | 'UP' | 'DOWN' | null) {
        if (this.gameOver) return;
        if (pressed === 'LEFT') {
            this.movePaddle(-1);
        } else if (pressed === 'RIGHT') {
            this.movePaddle(1);
        }
    }

    handleSwipe(dir: 'LEFT' | 'RIGHT' | 'UP' | 'DOWN') {
        if (this.gameOver) return;
        if (dir === 'LEFT') {
            this.movePaddle(-1);
        } else if (dir === 'RIGHT') {
            this.movePaddle(1);
        } else if (dir === 'UP') {
            this.launchBall();
        }
    }

    handleTap() {
        this.launchBall();
    }
}
