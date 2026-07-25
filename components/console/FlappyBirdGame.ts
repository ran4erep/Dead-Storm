import { ConsoleGame, ConsoleGameBounds, ConsoleGameInputDetails } from './types';

const GRID_SIZE = 15;
const TICK_SPEED = 60; // 60ms updates for fluid physics and scrolling

interface Pipe {
    x: number;
    gapY: number;
    gapHeight: number;
    scored: boolean;
}

export class FlappyBirdGame implements ConsoleGame {
    id = 'flappy';
    labelKey = 'flappy_title';

    private birdY = 7.0;
    private birdVy = 0.0;
    private pipes: Pipe[] = [];
    private score = 0;
    private gameOver = true;
    private hasStartedFlag = false;
    private tickCount = 0;

    private playSound: ((soundId: string) => void) | undefined;
    private onSpeedChange: ((speed: number) => void) | undefined;
    private flappyDecayGrid: number[][] = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(0));

    constructor(onSpeedChange?: (speed: number) => void) {
        this.onSpeedChange = onSpeedChange;
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
        // Runs at a constant 25ms for ultra-smooth 40 FPS real-time physics and animation!
        return 25;
    }

    stop() {
        this.pipes = [];
    }

    private getSpeedFactor() {
        // Gradually increase speed as the score goes up, up to 1.5x speed
        return 1.0 + Math.min(0.5, this.score * 0.035);
    }

    reset() {
        this.birdY = 7.0;
        this.birdVy = 0.0;
        this.score = 0;
        this.tickCount = 0;
        const initialGapHeight = 4 + Math.floor(Math.random() * 4); // 4 to 7 pixels
        const initialGapY = 1 + Math.floor(Math.random() * (14 - initialGapHeight - 1));
        this.pipes = [
            { x: 14, gapY: initialGapY, gapHeight: initialGapHeight, scored: false }
        ];
        this.gameOver = false;
        this.hasStartedFlag = true;

        for (let r = 0; r < GRID_SIZE; r++) {
            this.flappyDecayGrid[r].fill(0);
        }

        if (this.playSound) {
            this.playSound('CONSOLE_START');
        }

        if (this.onSpeedChange) {
            this.onSpeedChange(this.getTickSpeed());
        }
    }

    private flap() {
        if (this.gameOver) return;
        const speedFactor = this.getSpeedFactor();
        // Snappy lift force: designed to reach exactly 2 pixels high
        this.birdVy = -0.31 * speedFactor;
    }

    tick() {
        if (this.gameOver) return;

        this.tickCount++;

        const speedFactor = this.getSpeedFactor();
        const currentScrollSpeed = 0.12 * speedFactor;
        const currentGravity = 0.024 * speedFactor;
        const maxFallSpeed = 0.32 * speedFactor;
        const maxRiseSpeed = -0.50 * speedFactor;

        // Apply physics to bird
        this.birdVy += currentGravity;
        // speed limits
        if (this.birdVy > maxFallSpeed) this.birdVy = maxFallSpeed;
        if (this.birdVy < maxRiseSpeed) this.birdVy = maxRiseSpeed;

        this.birdY += this.birdVy;

        // Collision: floor or ceiling of body
        const birdRoundedY = Math.round(this.birdY);

        if (birdRoundedY < 0 || birdRoundedY >= GRID_SIZE) {
            this.gameOver = true;
            return;
        }

        // Scroll and update pipes
        const nextPipes: Pipe[] = [];
        let spawnNew = false;

        this.pipes.forEach(pipe => {
            pipe.x -= currentScrollSpeed;

            // Score check when passing bird X (X = 3)
            const birdX = 3;
            if (!pipe.scored && pipe.x <= birdX - 2) {
                pipe.scored = true;
                this.score += 1;
                if (this.playSound) {
                    this.playSound('CONSOLE_FOOD'); // Play console_food on score
                }
            }

            // Collision check with only the body pixel (no wings)
            const birdPixels = [
                { x: birdX, y: birdRoundedY } // Body only
            ];

            const hasCollision = birdPixels.some(p => this.checkPixelCollision(p.x, p.y, pipe));
            if (hasCollision) {
                this.gameOver = true;
            }

            if (pipe.x > -2) { // Allow pipe to completely scroll out (width 4)
                nextPipes.push(pipe);
            }
        });

        // Spawn a new pipe
        if (nextPipes.length > 0) {
            const lastPipe = nextPipes[nextPipes.length - 1];
            // slightly closer spacing (e.g., when last pipe is at x=7 or less, space between is 8)
            if (lastPipe.x <= GRID_SIZE - 8) {
                spawnNew = true;
            }
        } else {
            spawnNew = true;
        }

        if (spawnNew) {
            // gapHeight ranges from 4 to 7 pixels (4 + [0..3])
            const gapHeight = 4 + Math.floor(Math.random() * 4);
            // gapY ensures there is at least 1 pixel of top and bottom pipe (lips)
            const maxGapY = 14 - gapHeight;
            const gapY = 1 + Math.floor(Math.random() * maxGapY);
            nextPipes.push({ x: GRID_SIZE, gapY, gapHeight, scored: false });
        }

        this.pipes = nextPipes;
    }

    private checkPixelCollision(x: number, y: number, pipe: Pipe): boolean {
        const px = Math.round(pipe.x);
        if (y < pipe.gapY) {
            // Only a single row of thickness 4 blocks for the lip/nose
            const isNose = y === pipe.gapY - 1;
            if (isNose) {
                return x >= px - 1 && x <= px + 2;
            } else {
                return x >= px && x <= px + 1;
            }
        } else if (y >= pipe.gapY + pipe.gapHeight) {
            // Only a single row of thickness 4 blocks for the lip/nose
            const isNose = y === pipe.gapY + pipe.gapHeight;
            if (isNose) {
                return x >= px - 1 && x <= px + 2;
            } else {
                return x >= px && x <= px + 1;
            }
        }
        return false;
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

        // Score Area
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

        // Active pixel calculations
        const currentlyOn = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(false));

        if (!this.gameOver) {
            // Draw Bird (Flappy Fly)
            const bx = 3;
            const by = Math.round(this.birdY);
            const wingsUp = Math.floor(localAnimFrame / 6) % 2 === 0;

            // Draw Body
            if (by >= 0 && by < GRID_SIZE) {
                currentlyOn[by][bx] = true;
            }
            if (wingsUp) {
                // Row 1 (by - 1): B - B
                // Row 2 (by): - B -
                const wingY = by - 1;
                if (wingY >= 0 && wingY < GRID_SIZE) {
                    if (bx - 1 >= 0) currentlyOn[wingY][bx - 1] = true;
                    if (bx + 1 < GRID_SIZE) currentlyOn[wingY][bx + 1] = true;
                }
            } else {
                // Row 1 (by - 1): - - - (empty)
                // Row 2 (by): B B B
                if (by >= 0 && by < GRID_SIZE) {
                    if (bx - 1 >= 0) currentlyOn[by][bx - 1] = true;
                    if (bx + 1 < GRID_SIZE) currentlyOn[by][bx + 1] = true;
                }
            }

            // Draw Pipes
            this.pipes.forEach(pipe => {
                const px = Math.round(pipe.x);
                
                for (let y = 0; y < GRID_SIZE; y++) {
                    if (y < pipe.gapY) {
                        const isNose = y === pipe.gapY - 1;
                        if (isNose) {
                            for (let dx = -1; dx <= 2; dx++) {
                                const cx = px + dx;
                                if (cx >= 0 && cx < GRID_SIZE) {
                                    currentlyOn[y][cx] = true;
                                }
                            }
                        } else {
                            for (let dx = 0; dx <= 1; dx++) {
                                const cx = px + dx;
                                if (cx >= 0 && cx < GRID_SIZE) {
                                    currentlyOn[y][cx] = true;
                                }
                            }
                        }
                    } else if (y >= pipe.gapY + pipe.gapHeight) {
                        const isNose = y === pipe.gapY + pipe.gapHeight;
                        if (isNose) {
                            for (let dx = -1; dx <= 2; dx++) {
                                const cx = px + dx;
                                if (cx >= 0 && cx < GRID_SIZE) {
                                    currentlyOn[y][cx] = true;
                                }
                            }
                        } else {
                            for (let dx = 0; dx <= 1; dx++) {
                                const cx = px + dx;
                                if (cx >= 0 && cx < GRID_SIZE) {
                                    currentlyOn[y][cx] = true;
                                }
                            }
                        }
                    }
                }
            });
        }

        const isGhosting = settings?.lcdGhosting !== false;
        const decayRate = isGhosting ? 0.08 : 1.0;

        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                if (currentlyOn[y][x]) {
                    this.flappyDecayGrid[y][x] = 1.0;
                } else {
                    this.flappyDecayGrid[y][x] = Math.max(0, this.flappyDecayGrid[y][x] - decayRate);
                }
            }
        }

        // Render pixels
        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                const intensity = this.flappyDecayGrid[y][x];
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
                const titleText = strings?.ui?.console?.flappy_title || "FLAPPY FLY";
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

        // Spacebar or ArrowUp or w jumps
        if (details.isAction || details.isUp) {
            this.flap();
        }
    }

    handleKeyUp() {}

    handleSwipe(dir: 'LEFT' | 'RIGHT' | 'UP' | 'DOWN') {
        if (this.gameOver) return;
        if (dir === 'UP') {
            this.flap();
        }
    }

    handleTap() {
        this.flap();
    }
}
